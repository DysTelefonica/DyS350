'use strict';

/**
 * Unit tests for the shared permission model.
 *
 * The module under test is TypeScript, so it is transpiled on the fly with the
 * TypeScript compiler that ships with this project and evaluated as a CommonJS
 * module. That keeps the tests independent from a gulp build.
 *
 * Run with: node --test test/
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ts = require('../node_modules/typescript');

const MODULE_PATH = path.join(
  __dirname,
  '..',
  'src',
  'common',
  'permissions',
  'permissions.ts',
);

const loadTypeScriptModule = (filePath) => {
  const source = fs.readFileSync(filePath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    fileName: filePath,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  });

  const moduleRef = { exports: {} };
  const localRequire = (request) => {
    if (request.charAt(0) === '.') {
      return loadTypeScriptModule(
        path.resolve(path.dirname(filePath), request + '.ts'),
      );
    }
    return require(request);
  };

  const factory = new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    outputText,
  );
  factory(
    moduleRef.exports,
    localRequire,
    moduleRef,
    filePath,
    path.dirname(filePath),
  );
  return moduleRef.exports;
};

const permissions = loadTypeScriptModule(MODULE_PATH);

const USER = {
  displayName: 'María Fernández Ruiz',
  email: 'maria.fernandez@telefonica.com',
};

const ROLE_CATALOG = [
  { idRol: 1, title: 'Preventa' },
  { idRol: 2, title: 'Jefe de Proyecto' },
  { idRol: 3, title: 'Técnicos de calidad' },
  { idRol: 4, title: 'Técnicos de documentación' },
];

test('normalizePermissionText folds case, accents and repeated spaces', () => {
  assert.equal(
    permissions.normalizePermissionText('  Técnica   de  CALIDAD '),
    'tecnica de calidad',
  );
  assert.equal(
    permissions.normalizePermissionText('TÉCNICOS DE DOCUMENTACIÓN'),
    'tecnicos de documentacion',
  );
  assert.equal(permissions.normalizePermissionText(null), '');
  assert.equal(permissions.normalizePermissionText(undefined), '');
});

test('escapeODataValue escapes single quotes', () => {
  assert.equal(permissions.escapeODataValue("O'Brien"), "O''Brien");
});

test('extractUserEmail reads plain strings and people fields', () => {
  assert.equal(
    permissions.extractUserEmail('maria.fernandez@telefonica.com'),
    'maria.fernandez@telefonica.com',
  );
  assert.equal(
    permissions.extractUserEmail({ EMail: 'maria.fernandez@telefonica.com' }),
    'maria.fernandez@telefonica.com',
  );
  assert.equal(
    permissions.extractUserEmail({ email: 'maria.fernandez@telefonica.com' }),
    'maria.fernandez@telefonica.com',
  );
  assert.equal(
    permissions.extractUserEmail([{ Email: 'maria.fernandez@telefonica.com' }]),
    'maria.fernandez@telefonica.com',
  );
  assert.equal(permissions.extractUserEmail(null), '');
});

test('assignmentMatchesUser accepts the name and the email of the user', () => {
  const byName = { title: 'maria fernandez ruiz', usuario: null, idRol: 2 };
  assert.equal(permissions.assignmentMatchesUser(byName, USER), true);

  const byAccent = { title: 'MARÍA FERNÁNDEZ RUIZ', usuario: null };
  assert.equal(permissions.assignmentMatchesUser(byAccent, USER), true);

  const byEmail = {
    title: 'Another Person',
    usuario: 'maria.fernandez@telefonica.com',
  };
  assert.equal(permissions.assignmentMatchesUser(byEmail, USER), true);

  const byPeopleField = {
    title: 'Another Person',
    usuario: { EMail: 'maria.fernandez@telefonica.com' },
  };
  assert.equal(permissions.assignmentMatchesUser(byPeopleField, USER), true);

  const byEmbeddedEmail = {
    title: 'Another Person',
    usuario: 'maria.fernandez@telefonica.com (responsable)',
  };
  assert.equal(permissions.assignmentMatchesUser(byEmbeddedEmail, USER), true);
});

test('assignmentMatchesUser rejects the assignments of other people', () => {
  const other = {
    title: 'Juan Perez Lopez',
    usuario: 'juan.perez@telefonica.com',
  };
  assert.equal(permissions.assignmentMatchesUser(other, USER), false);

  const empty = {};
  assert.equal(permissions.assignmentMatchesUser(empty, USER), false);

  const anonymous = { displayName: '', email: '' };
  assert.equal(permissions.assignmentMatchesUser(other, anonymous), false);
});

test('matchesSecurityGroup accepts exact and contained titles', () => {
  assert.equal(
    permissions.matchesSecurityGroup('calidad', ['calidad', 'documentacion']),
    true,
  );
  assert.equal(
    permissions.matchesSecurityGroup('E2E - Calidad', ['calidad']),
    true,
  );
  assert.equal(
    permissions.matchesSecurityGroup('Dirección', ['calidad', 'documentacion']),
    false,
  );
  assert.equal(permissions.matchesSecurityGroup('', ['calidad']), false);
});

test('resolveRoleName resolves the catalog name of a role', () => {
  assert.equal(
    permissions.resolveRoleName({ idRol: 3 }, ROLE_CATALOG),
    'tecnicos de calidad',
  );
  assert.equal(
    permissions.resolveRoleName({ idRol: '3' }, ROLE_CATALOG),
    'tecnicos de calidad',
  );
  assert.equal(permissions.resolveRoleName({ idRol: 99 }, ROLE_CATALOG), '');
  assert.equal(permissions.resolveRoleName({}, ROLE_CATALOG), '');
});

test('matchesAdministratorRecord matches the name and the email', () => {
  assert.equal(
    permissions.matchesAdministratorRecord(
      { Title: 'María Fernández Ruiz', Correo: 'maria.fernandez@telefonica.com' },
      USER,
    ),
    true,
  );
  assert.equal(
    permissions.matchesAdministratorRecord(
      { Title: 'Otra Persona', Correo: 'maria.fernandez@telefonica.com' },
      USER,
    ),
    true,
  );
  assert.equal(
    permissions.matchesAdministratorRecord(
      { Title: 'Otra Persona', Correo: 'otra@telefonica.com' },
      USER,
    ),
    false,
  );
});

const evaluate = (overrides) =>
  permissions.evaluatePermissions(
    Object.assign(
      {
        subject: { user: USER, securityGroups: [] },
        assignments: [],
        roleCatalog: ROLE_CATALOG,
        policy: {},
      },
      overrides || {},
    ),
  );

test('a user without roles nor groups has no capabilities', () => {
  const evaluation = evaluate();
  assert.equal(evaluation.capabilities.read, false);
  assert.equal(evaluation.capabilities.create, false);
  assert.equal(evaluation.capabilities.edit, false);
  assert.equal(evaluation.capabilities.delete, false);
  assert.equal(evaluation.capabilities.admin, false);
});

test('a catalog role grants the capabilities of the policy', () => {
  const evaluation = evaluate({
    assignments: [
      { title: 'María Fernández Ruiz', usuario: null, idRol: 3 },
      { title: 'Another Person', usuario: null, idRol: 1 },
    ],
    policy: { allowedRoleNames: ['Técnicos de calidad'] },
  });

  assert.equal(evaluation.capabilities.read, true);
  assert.equal(evaluation.capabilities.create, true);
  assert.equal(evaluation.capabilities.admin, false);
  assert.deepEqual(evaluation.grantedRoleNames, ['tecnicos de calidad']);
  assert.equal(evaluation.matchedAssignments.length, 1);
});

test('a role id grants the capabilities without resolving the name', () => {
  const evaluation = evaluate({
    assignments: [{ title: 'María Fernández Ruiz', usuario: null, idRol: 2 }],
    policy: { allowedRoleIds: [2] },
  });

  assert.equal(evaluation.capabilities.read, true);
  assert.equal(evaluation.capabilities.admin, false);
});

test('a security group grants the capabilities on every project', () => {
  const evaluation = evaluate({
    subject: {
      user: USER,
      securityGroups: ['E2E - Documentacion'],
    },
    policy: { allowedGroupNames: ['calidad', 'documentacion'] },
  });

  assert.equal(evaluation.capabilities.read, true);
  assert.equal(evaluation.capabilities.edit, true);
  assert.deepEqual(evaluation.matchedSecurityGroups, ['e2e - documentacion']);
});

test('anyRoleGrants gives every capability to the members of the project', () => {
  const evaluation = evaluate({
    assignments: [{ title: 'María Fernández Ruiz', usuario: null, idRol: 9 }],
    policy: { anyRoleGrants: true },
  });

  assert.equal(evaluation.capabilities.read, true);
  assert.equal(evaluation.capabilities.delete, true);
});

test('an administrator is allowed every capability', () => {
  const evaluation = evaluate({
    subject: { user: USER, securityGroups: [], isAdministrator: true },
  });

  assert.equal(evaluation.capabilities.read, true);
  assert.equal(evaluation.capabilities.create, true);
  assert.equal(evaluation.capabilities.edit, true);
  assert.equal(evaluation.capabilities.delete, true);
  assert.equal(evaluation.capabilities.admin, true);
});

test('the admin capability is reserved to the administrators', () => {
  const evaluation = evaluate({
    subject: { user: USER, securityGroups: ['calidad'] },
    policy: { allowedGroupNames: ['calidad'] },
  });

  assert.equal(evaluation.capabilities.read, true);
  assert.equal(evaluation.capabilities.admin, false);
});

test('the admin capability can be granted to a group on purpose', () => {
  const evaluation = evaluate({
    subject: { user: USER, securityGroups: ['administradores'] },
    policy: {
      allowedGroupNames: ['administradores'],
      adminOnlyCapabilities: [],
    },
  });

  assert.equal(evaluation.capabilities.admin, true);
});

test('can reads a single capability of an evaluation', () => {
  const evaluation = evaluate({
    subject: { user: USER, securityGroups: [], isAdministrator: true },
  });

  assert.equal(permissions.can(evaluation, 'admin'), true);
  assert.equal(permissions.can(evaluation, 'read'), true);
});

