/**
 * SharePoint loader for the shared permission model.
 *
 * It reads the three sources that decide what a user may do:
 *   - Roles_usuario   : functional role of the person in a project.
 *   - Roles           : catalog that resolves IDRol into a role name.
 *   - Aprovisionadores: administrators of the application.
 *
 * The PnP client must be initialized by the caller
 * (sp.setup({ spfxContext: context })), exactly like the rest of the webparts.
 */

import { sp } from "@pnp/sp";

import {
  escapeODataValue,
  IPermissionSubject,
  IPermissionUser,
  IRoleAssignment,
  IRoleCatalogEntry,
  matchesAdministratorRecord,
  normalizePermissionText,
} from "./permissions";

export const DEFAULT_ROLES_LIST_TITLE = "Roles_usuario";
export const DEFAULT_ROLE_CATALOG_LIST_TITLE = "Roles";
export const DEFAULT_ADMINISTRATORS_LIST_TITLE = "Aprovisionadores";

export interface IPermissionDataOptions {
  /** Project (expediente) the permissions are evaluated for. */
  projectId?: number | null;
  rolesListTitle?: string;
  roleCatalogListTitle?: string;
  administratorsListTitle?: string;
  /** Set to false to skip the Roles catalog lookup. */
  includeRoleCatalog?: boolean;
}

export interface IPermissionData {
  subject: IPermissionSubject;
  assignments: IRoleAssignment[];
  roleCatalog: IRoleCatalogEntry[];
}

/** Reads the Roles catalog, the source of truth for the role names. */
export const loadRoleCatalog = async (
  listTitle: string = DEFAULT_ROLE_CATALOG_LIST_TITLE,
): Promise<IRoleCatalogEntry[]> => {
  const items: any[] = await sp.web.lists
    .getByTitle(listTitle)
    .items.select("IDRol", "Title")
    .top(5000)
    .getAll();

  const catalog: IRoleCatalogEntry[] = [];
  for (let index = 0; index < items.length; index++) {
    const idRol = Number(items[index]?.IDRol);
    if (isNaN(idRol)) {
      continue;
    }
    catalog.push({ idRol: idRol, title: String(items[index]?.Title || "") });
  }
  return catalog;
};

/** Reads the functional roles of the project. */
export const loadProjectAssignments = async (
  projectId: number | null | undefined,
  listTitle: string = DEFAULT_ROLES_LIST_TITLE,
): Promise<IRoleAssignment[]> => {
  const numericId = Number(projectId);
  if (!numericId || isNaN(numericId) || numericId <= 0) {
    return [];
  }

  const items: any[] = await sp.web.lists
    .getByTitle(listTitle)
    .items.filter("IDExpediente eq " + numericId)
    .select("Title", "usuario", "IDRol", "IDExpediente")
    .top(5000)
    .getAll();

  const assignments: IRoleAssignment[] = [];
  for (let index = 0; index < items.length; index++) {
    assignments.push({
      title: items[index]?.Title,
      usuario: items[index]?.usuario,
      idRol: items[index]?.IDRol,
      idExpediente: items[index]?.IDExpediente,
    });
  }
  return assignments;
};

/** Reads the titles of the security groups the current user belongs to. */
export const loadSecurityGroups = async (): Promise<string[]> => {
  const groups: Array<{ Title?: string }> = await sp.web.currentUser.groups
    .select("Title")
    .get();

  const titles: string[] = [];
  for (let index = 0; index < groups.length; index++) {
    const title = normalizePermissionText(groups[index]?.Title);
    if (title && titles.indexOf(title) < 0) {
      titles.push(title);
    }
  }
  return titles;
};

/**
 * True when the user is an administrator of the application. Administrators
 * are the members of the Aprovisionadores list, the same list that grants the
 * creation of projects.
 */
export const loadIsAdministrator = async (
  user: IPermissionUser,
  listTitle: string = DEFAULT_ADMINISTRATORS_LIST_TITLE,
): Promise<boolean> => {
  const name = String(user.displayName || "").trim();
  const email = String(user.email || "").trim();
  if (!name && !email) {
    return false;
  }

  const filters: string[] = [];
  if (name) {
    filters.push("Title eq '" + escapeODataValue(name) + "'");
  }
  if (email) {
    filters.push("Correo eq '" + escapeODataValue(email) + "'");
  }

  if (filters.length) {
    const approvers: any[] = await sp.web.lists
      .getByTitle(listTitle)
      .items.select("Title", "Correo")
      .filter(filters.join(" or "))
      .top(1)
      .get();
    if (approvers.length > 0) {
      return true;
    }
  }

  // Defensive fallback for the normalization differences between the display
  // name of SharePoint and the one stored in the list.
  const approversAll: any[] = await sp.web.lists
    .getByTitle(listTitle)
    .items.select("Title", "Correo")
    .top(5000)
    .getAll();
  return approversAll.some((item: unknown) =>
    matchesAdministratorRecord(item, user),
  );
};

/** Loads every source needed to evaluate the permissions of the current user. */
export const loadPermissionData = async (
  user: IPermissionUser,
  options: IPermissionDataOptions = {},
): Promise<IPermissionData> => {
  const assignments = await loadProjectAssignments(
    options.projectId,
    options.rolesListTitle || DEFAULT_ROLES_LIST_TITLE,
  );
  const roleCatalog =
    options.includeRoleCatalog === false
      ? []
      : await loadRoleCatalog(
          options.roleCatalogListTitle || DEFAULT_ROLE_CATALOG_LIST_TITLE,
        );
  const securityGroups = await loadSecurityGroups();
  const isAdministrator = await loadIsAdministrator(
    user,
    options.administratorsListTitle || DEFAULT_ADMINISTRATORS_LIST_TITLE,
  );

  return {
    subject: {
      user: user,
      securityGroups: securityGroups,
      isAdministrator: isAdministrator,
    },
    assignments: assignments,
    roleCatalog: roleCatalog,
  };
};

