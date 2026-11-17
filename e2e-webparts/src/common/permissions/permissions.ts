/**
 * Shared permission model for the E2E webparts.
 *
 * The functional role of a person in a project ("rol funcional") is stored in
 * the SharePoint list `Roles_usuario`:
 *
 *   - Title        -> name of the person.
 *   - usuario      -> email of the person (plain string or people field).
 *   - IDRol        -> id of the role in the `Roles` catalog.
 *   - IDExpediente -> id of the project (expediente) the role belongs to.
 *
 * The role name itself lives in the `Roles` catalog (`IDRol` + `Title`), for
 * example "Preventa", "Jefe de Proyecto", "Tecnicos de calidad".
 *
 * A SharePoint security group ("calidad", "documentacion") grants the same
 * capability on every project. The functional role and the SharePoint item
 * permission are two different checks, so both are reported separately and
 * never substituted for one another
 * (docs/manuals/guia-consulta-operativa.md, section 3).
 *
 * This module is deliberately free of any SharePoint dependency so the rules
 * can be unit tested in isolation. `permissionsData.ts` loads the data.
 */

export type PermissionCapability =
  | "read"
  | "create"
  | "edit"
  | "delete"
  | "admin";

export type PermissionCapabilityMap = Record<PermissionCapability, boolean>;

export const PERMISSION_CAPABILITIES: PermissionCapability[] = [
  "read",
  "create",
  "edit",
  "delete",
  "admin",
];

/** Capabilities that only an administrator may use unless the policy says otherwise. */
export const DEFAULT_ADMIN_ONLY_CAPABILITIES: PermissionCapability[] = [
  "admin",
];

export interface IPermissionUser {
  displayName: string;
  email: string;
}

export interface IRoleCatalogEntry {
  idRol: number;
  title: string;
}

/** A single row of the `Roles_usuario` list. */
export interface IRoleAssignment {
  title?: unknown;
  usuario?: unknown;
  idRol?: number | string | null;
  idExpediente?: number | string | null;
}

export interface IPermissionPolicy {
  /** Role names of the `Roles` catalog that grant the capability. */
  allowedRoleNames?: string[];
  /** Role ids of the `Roles` catalog that grant the capability. */
  allowedRoleIds?: number[];
  /** Security group titles that grant the capability on every project. */
  allowedGroupNames?: string[];
  /** When true, any role assignment of the user in the project grants the capability. */
  anyRoleGrants?: boolean;
  /** Capabilities reserved to administrators. Defaults to ["admin"]. */
  adminOnlyCapabilities?: PermissionCapability[];
}

export interface IPermissionSubject {
  user: IPermissionUser;
  /** Titles of the SharePoint security groups the user belongs to. */
  securityGroups: string[];
  /** True when the user is an administrator of the application. */
  isAdministrator?: boolean;
}

export interface IPermissionEvaluationInput {
  subject: IPermissionSubject;
  /** Role assignments that belong to the project being evaluated. */
  assignments: IRoleAssignment[];
  /** The `Roles` catalog, used to resolve the role name of an assignment. */
  roleCatalog?: IRoleCatalogEntry[];
  policy?: IPermissionPolicy;
}

export interface IPermissionEvaluation {
  capabilities: PermissionCapabilityMap;
  /** Normalized names of the catalog roles held by the user in the project. */
  grantedRoleNames: string[];
  /** Normalized titles of the security groups that matched the policy. */
  matchedSecurityGroups: string[];
  /** Assignments of the user in the project that were matched. */
  matchedAssignments: IRoleAssignment[];
}

const DIACRITICS: { [key: string]: string } = {
  "á": "a",
  "à": "a",
  "ä": "a",
  "â": "a",
  "ã": "a",
  "å": "a",
  "é": "e",
  "è": "e",
  "ë": "e",
  "ê": "e",
  "í": "i",
  "ì": "i",
  "ï": "i",
  "î": "i",
  "ó": "o",
  "ò": "o",
  "ö": "o",
  "ô": "o",
  "õ": "o",
  "ú": "u",
  "ù": "u",
  "ü": "u",
  "û": "u",
  "ñ": "n",
  "ç": "c",
};

const stringNormalize = (
  String.prototype as unknown as { normalize?: (form: string) => string }
).normalize;

export const toText = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
};

/**
 * Removes the diacritics of a text. Uses the Unicode normalization when the
 * runtime provides it and falls back to a Spanish oriented folding table, so
 * the result is the same on the ES5 browsers targeted by the webparts.
 */
export const foldDiacritics = (value: unknown): string => {
  const lowered = toText(value).toLowerCase();
  if (typeof stringNormalize === "function") {
    return stringNormalize
      .call(lowered, "NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }
  return lowered.replace(/[\u00c0-\u017f]/g, (char: string) =>
    DIACRITICS[char] !== undefined ? DIACRITICS[char] : char,
  );
};

/**
 * Canonical comparison form of a text: no diacritics, lower case and single
 * spaces. Used to match a person against `Roles_usuario` even when the name
 * was stored with different accents, case or spacing.
 */
export const normalizePermissionText = (value: unknown): string =>
  foldDiacritics(value).replace(/\s+/g, " ").trim();

/** Escapes a value to be used inside a SharePoint OData string literal. */
export const escapeODataValue = (value: unknown): string =>
  toText(value).replace(/'/g, "''");

/** Reads the email of a people field, accepting plain strings as well. */
export const extractUserEmail = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      const candidate = extractUserEmail(value[index]);
      if (candidate) {
        return candidate;
      }
    }
    return "";
  }
  if (typeof value === "object") {
    const person = value as {
      EMail?: unknown;
      Email?: unknown;
      email?: unknown;
    };
    return toText(person.EMail || person.Email || person.email || "").trim();
  }
  return "";
};

/** True when the assignment of `Roles_usuario` belongs to the given user. */
export const assignmentMatchesUser = (
  assignment: IRoleAssignment,
  user: IPermissionUser,
): boolean => {
  const nameNorm = normalizePermissionText(user.displayName);
  const emailNorm = normalizePermissionText(user.email);
  if (!nameNorm && !emailNorm) {
    return false;
  }

  const titleNorm = normalizePermissionText(assignment.title);
  if (nameNorm && titleNorm === nameNorm) {
    return true;
  }

  const assignedEmailNorm = normalizePermissionText(
    extractUserEmail(assignment.usuario),
  );
  if (emailNorm && assignedEmailNorm === emailNorm) {
    return true;
  }

  // The `usuario` column is sometimes stored as a plain string that carries
  // the email next to other values, so the email is also looked up inside it.
  const rawNorm = normalizePermissionText(assignment.usuario);
  if (emailNorm && rawNorm && rawNorm.indexOf(emailNorm) >= 0) {
    return true;
  }

  return false;
};

/**
 * True when a security group title matches one of the allowed titles. The
 * match accepts an exact title and a title that contains the allowed one, so
 * "E2E - Calidad" matches the allowed group "calidad".
 */
export const matchesSecurityGroup = (
  groupTitle: unknown,
  allowedGroupNames: string[],
): boolean => {
  const groupNorm = normalizePermissionText(groupTitle);
  if (!groupNorm) {
    return false;
  }
  for (let index = 0; index < allowedGroupNames.length; index++) {
    const allowedNorm = normalizePermissionText(allowedGroupNames[index]);
    if (!allowedNorm) {
      continue;
    }
    if (groupNorm === allowedNorm || groupNorm.indexOf(allowedNorm) >= 0) {
      return true;
    }
  }
  return false;
};

/** Resolves the catalog name of the role held by an assignment. */
export const resolveRoleName = (
  assignment: IRoleAssignment,
  roleCatalog: IRoleCatalogEntry[],
): string => {
  const rawId = assignment.idRol;
  if (rawId === null || rawId === undefined || rawId === "") {
    return "";
  }
  const numericId = Number(rawId);
  if (isNaN(numericId)) {
    return "";
  }
  for (let index = 0; index < roleCatalog.length; index++) {
    if (Number(roleCatalog[index].idRol) === numericId) {
      return normalizePermissionText(roleCatalog[index].title);
    }
  }
  return "";
};

/** True when a row of the administrators list belongs to the given user. */
export const matchesAdministratorRecord = (
  record: unknown,
  user: IPermissionUser,
): boolean => {
  if (record === null || record === undefined) {
    return false;
  }
  const row = record as { Title?: unknown; Correo?: unknown };
  const nameNorm = normalizePermissionText(user.displayName);
  const emailNorm = normalizePermissionText(user.email);
  if (nameNorm && nameNorm === normalizePermissionText(row.Title)) {
    return true;
  }
  if (emailNorm && emailNorm === normalizePermissionText(row.Correo)) {
    return true;
  }
  return false;
};

const buildCapabilityMap = (
  options: {
    isAdministrator: boolean;
    isAdminOnly: boolean;
    hasGroupGrant: boolean;
    hasRoleGrant: boolean;
    hasAnyRole: boolean;
    anyRoleGrants: boolean;
  },
): boolean => {
  if (options.isAdministrator) {
    return true;
  }
  if (options.isAdminOnly) {
    return false;
  }
  if (options.hasGroupGrant || options.hasRoleGrant) {
    return true;
  }
  return options.anyRoleGrants && options.hasAnyRole;
};

/**
 * Resolves the capabilities of a user inside a project.
 *
 * The rules are evaluated in this order for every capability:
 *   1. An administrator is allowed everything.
 *   2. A capability reserved to administrators is denied to everybody else.
 *   3. A matching security group grants the capability on every project.
 *   4. A matching catalog role grants the capability inside the project.
 *   5. `anyRoleGrants` grants the capability to anybody holding a role in the
 *      project.
 */
export const evaluatePermissions = (
  input: IPermissionEvaluationInput,
): IPermissionEvaluation => {
  const subject = input.subject;
  const assignments = input.assignments || [];
  const roleCatalog = input.roleCatalog || [];
  const policy = input.policy || {};
  const allowedRoleNames = policy.allowedRoleNames || [];
  const allowedRoleIds = policy.allowedRoleIds || [];
  const allowedGroupNames = policy.allowedGroupNames || [];
  const adminOnlyCapabilities =
    policy.adminOnlyCapabilities !== undefined
      ? policy.adminOnlyCapabilities
      : DEFAULT_ADMIN_ONLY_CAPABILITIES;

  const matchedAssignments: IRoleAssignment[] = [];
  const grantedRoleNames: string[] = [];
  for (let index = 0; index < assignments.length; index++) {
    const assignment = assignments[index];
    if (!assignmentMatchesUser(assignment, subject.user)) {
      continue;
    }
    matchedAssignments.push(assignment);
    const roleName = resolveRoleName(assignment, roleCatalog);
    if (roleName && grantedRoleNames.indexOf(roleName) < 0) {
      grantedRoleNames.push(roleName);
    }
  }

  const matchedSecurityGroups: string[] = [];
  const securityGroups = subject.securityGroups || [];
  for (let index = 0; index < securityGroups.length; index++) {
    if (!matchesSecurityGroup(securityGroups[index], allowedGroupNames)) {
      continue;
    }
    const groupNorm = normalizePermissionText(securityGroups[index]);
    if (groupNorm && matchedSecurityGroups.indexOf(groupNorm) < 0) {
      matchedSecurityGroups.push(groupNorm);
    }
  }

  const hasAllowedRoleName = (): boolean => {
    for (let roleIndex = 0; roleIndex < grantedRoleNames.length; roleIndex++) {
      for (
        let allowedIndex = 0;
        allowedIndex < allowedRoleNames.length;
        allowedIndex++
      ) {
        if (
          grantedRoleNames[roleIndex] ===
          normalizePermissionText(allowedRoleNames[allowedIndex])
        ) {
          return true;
        }
      }
    }
    return false;
  };

  const hasAllowedRoleId = (): boolean => {
    if (!allowedRoleIds.length) {
      return false;
    }
    for (let index = 0; index < matchedAssignments.length; index++) {
      const rawId = matchedAssignments[index].idRol;
      if (rawId === null || rawId === undefined || rawId === "") {
        continue;
      }
      const numericId = Number(rawId);
      if (isNaN(numericId)) {
        continue;
      }
      for (let allowedIndex = 0; allowedIndex < allowedRoleIds.length; allowedIndex++) {
        if (Number(allowedRoleIds[allowedIndex]) === numericId) {
          return true;
        }
      }
    }
    return false;
  };

  const hasRoleGrant = hasAllowedRoleName() || hasAllowedRoleId();
  const hasAnyRole = matchedAssignments.length > 0;
  const hasGroupGrant = matchedSecurityGroups.length > 0;
  const isAdministrator = subject.isAdministrator === true;
  const anyRoleGrants = policy.anyRoleGrants === true;

  const capabilities = {} as PermissionCapabilityMap;
  for (let index = 0; index < PERMISSION_CAPABILITIES.length; index++) {
    const capability = PERMISSION_CAPABILITIES[index];
    capabilities[capability] = buildCapabilityMap({
      isAdministrator: isAdministrator,
      isAdminOnly: adminOnlyCapabilities.indexOf(capability) >= 0,
      hasGroupGrant: hasGroupGrant,
      hasRoleGrant: hasRoleGrant,
      hasAnyRole: hasAnyRole,
      anyRoleGrants: anyRoleGrants,
    });
  }

  return {
    capabilities: capabilities,
    grantedRoleNames: grantedRoleNames,
    matchedSecurityGroups: matchedSecurityGroups,
    matchedAssignments: matchedAssignments,
  };
};

/** Convenience helper to read a single capability of an evaluation. */
export const can = (
  evaluation: IPermissionEvaluation,
  capability: PermissionCapability,
): boolean => evaluation.capabilities[capability] === true;

