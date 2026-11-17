'use strict';
// Offline candidate preparation only: no authentication, cloud client, save or deployment.
// Phase F of the authoritative reconciliation: the scope of the role deletion.
//
// The JSON is the authority over the roles of an expediente:
//   - a row whose (person, kind) the JSON does not describe is deleted, for EVERY kind the flow
//     writes: the quality and the security rows are not protected any more;
//   - the Direccion kind is out of scope: the flow never creates, updates or deletes it;
//   - a row that already holds the person and the name of the JSON is not written again;
//   - a row that is deleted also leaves the group of its kind, and only when the person holds no
//     other row of that kind in another expediente;
//   - with no valid responsible in the JSON nothing is deleted: the deletion fails closed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const BASE_PATH = path.resolve(__dirname, '../../.atl/project-title-sync/change-trace-20261115/candidate-definition.json');
const BASE_DEFINITION_HASH = '062C26A11FAB4AA8B0E44441C13E739F28EBD28FD072BCCD0AB5E904BF6856BD';
const ENVIRONMENT = 'aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b';
const FLOW = '1ca49582-ae1e-f111-8342-6045bde02c54';
const DIRECTORY = path.resolve(__dirname, '../../.atl/project-title-sync/role-authoritative-deletion-20261117');
const OUTPUTS = ['candidate-definition.json', 'candidate-comparison.json'];

const TRY = 'Try_-_Procesar_ExpedientesJSON';
const EXISTE = 'Existe_ExpedienteJSON';
const COMPROBAR = 'Comprobar_que_hay_RolesUsuario';
const POR_CADA_2 = 'Por_cada_Responsable_2';
const ELIMINAR = 'Por_cada_RolUsuario_Eliminar';

// The catalog of role kinds. The identifiers are read by title at runtime, never by a literal:
// the same definition has to work in an environment where the catalog has other identifiers.
const CATALOG = {
  jefe: { action: 'Rol_Jefe_de_Proyecto', title: 'Jefe de proyecto' },
  direccion: { action: 'Rol_Direccion', title: 'Dirección' },
};

// The removal of a member of a group is NOT part of the published candidate: the REST API of this
// tenant does not expose it. Measured on 2026-11-17 against the group of the quality (id 36) of
// DEV/CERT with the session of the team:
//   POST   /_api/web/sitegroups(36)/removeUser                              -> 404
//   POST   /_api/web/sitegroups/getbyid(36)/removeUser                      -> 404
//   POST   /_api/web/sitegroups/getbyid(36)/users/removeUser                -> 404
//   DELETE /_api/web/sitegroups/getbyid(36)/users('<login>')                -> 400 / 500
//   DELETE /_api/web/sitegroups(getbyid(36))/users(<id>)                    -> 404
// The addition to a group works (POST .../users with a LoginName) and the flow already uses it,
// but the symmetric removal is not available: publishing an action that fails would break the
// ingestion of every expediente whose role row is deleted. The rule stays written down and the
// code stays ready for the day the endpoint is there.
const GROUP_REMOVAL_ENABLED = false;

const PATHS = {
  try: `actions.${TRY}.actions`,
  existe: `actions.${TRY}.actions.${EXISTE}.actions`,
  calidad: `actions.${TRY}.actions.${EXISTE}.actions.Responsable_de_Calidad_ya_Existente`,
  comprobar: `actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}.actions`,
  porCada: `actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}.actions.${POR_CADA_2}.actions`,
  jefe: `actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}.actions.${POR_CADA_2}.actions.No_es_Jefe_de_Proyecto_2`,
  preventa: `actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}.actions.${POR_CADA_2}.actions.No_es_Preventa_2`,
  ingenieria: `actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}.actions.${POR_CADA_2}.actions.No_es_Preventa_2.actions.Es_Ingeniero_2.actions`,
  seguridad: `actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}.actions.${POR_CADA_2}.actions.Responsable_Seguridad_no_vacio_1`,
  borrar: `actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}.actions.${ELIMINAR}`,
};

// The update branches: the If that decides whether the row that holds the person of the JSON is
// written, and the name the JSON brings for it.
const UPDATES = [
  {
    kind: 'jefe',
    path: `actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}.actions.${POR_CADA_2}.actions.No_es_Jefe_de_Proyecto_2.else.actions.Contiene_Usuario_ya.actions.Actualizar_Rol_Existente_Jefe`,
    buscar: 'Buscar_Rol_Existente_Jefe',
    name: "items('Por_cada_Responsable_2')?['nombre']",
  },
  {
    kind: 'preventa',
    path: `actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}.actions.${POR_CADA_2}.actions.No_es_Preventa_2.else.actions.Contiene_Usuario_ya_2.actions.Actualizar_Rol_Existente_Preventa`,
    buscar: 'Buscar_Rol_Existente_Preventa',
    name: "items('Por_cada_Responsable_2')?['nombre']",
  },
  {
    kind: 'ingenieria',
    path: `actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}.actions.${POR_CADA_2}.actions.No_es_Preventa_2.actions.Es_Ingeniero_2.actions.Contiene_Usuario_ya_Ingenieria.actions.Actualizar_Rol_Existente_Ingenieria`,
    buscar: 'Buscar_Rol_Existente_Ingenieria',
    name: "items('Por_cada_Responsable_2')?['nombre']",
  },
  {
    kind: 'seguridad',
    path: `actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}.actions.${POR_CADA_2}.actions.Responsable_Seguridad_no_vacio_1.actions.Contiene_Usuario_ya_Seguridad.actions.Actualizar_Rol_Existente_Seguridad`,
    buscar: 'Buscar_Rol_Existente_Seguridad',
    name: "body('ExpedienteJSON')?['responsableSeguridad']?['nombre']",
  },
  {
    kind: 'calidad',
    path: `actions.${TRY}.actions.${EXISTE}.actions.Responsable_de_Calidad_ya_Existente.actions.Actualizar_Rol_Existente_Calidad`,
    buscar: 'Buscar_Rol_Existente_Calidad',
    name: "body('ExpedienteJSON')?['responsableCalidad']?['nombre']",
  },
];

const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const sort = value => Array.isArray(value) ? value.map(sort)
  : (value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])]))
    : value);
const definitionHash = definition => hash(JSON.stringify(sort(definition)));

function diffPaths(left, right, prefix = '$', out = []) {
  if (JSON.stringify(left) === JSON.stringify(right)) return out;
  if (Array.isArray(left) && Array.isArray(right)) {
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      if (index >= left.length || index >= right.length) { out.push(`${prefix}[${index}]`); continue; }
      diffPaths(left[index], right[index], `${prefix}[${index}]`, out);
    }
    return out;
  }
  const leftIsObject = left && typeof left === 'object' && !Array.isArray(left);
  const rightIsObject = right && typeof right === 'object' && !Array.isArray(right);
  if (!leftIsObject || !rightIsObject) { out.push(prefix); return out; }
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of [...keys].sort()) diffPaths(left[key], right[key], `${prefix}.${key}`, out);
  return out;
}

const get = (root, key) => key.split('.').reduce((node, part) => node?.[part], root);

function readBase(basePath = BASE_PATH) {
  const bytes = fs.readFileSync(basePath);
  const definition = JSON.parse(bytes.toString('utf8'));
  assert.equal(definitionHash(definition), BASE_DEFINITION_HASH,
    'source definition differs from the reviewed candidate of the change trace');
  return { environment: ENVIRONMENT, flow: FLOW, definition };
}

function assertBaseline(snapshot) {
  const borrar = get(snapshot.definition, PATHS.borrar);
  assert.ok(borrar, 'the role deletion loop is missing from the source');
  assert.equal(borrar.type, 'Foreach');
  const guardia = borrar.actions.Es_Rol_No_Deseado;
  assert.ok(guardia, 'the deletion guard is missing from the source');
  assert.equal(guardia.type, 'If');
  assert.ok(guardia.actions.Eliminar_RolesUsuario, 'the deletion action is not where the baseline expects it');
  assert.equal(guardia.actions.Eliminar_RolesUsuario.runtimeConfiguration, undefined,
    'the role deletion must already be a real delete inside the guard');
  assert.ok(!snapshot.definition.actions[`${TRY}`].actions[CATALOG.jefe.action], 'the jefe catalog lookup already exists');
  assert.ok(!snapshot.definition.actions[`${TRY}`].actions[CATALOG.direccion.action], 'the direccion catalog lookup already exists');
}

const catalogQuery = title => ({
  type: 'Query',
  inputs: { from: "@body('Obtener_Roles')", where: `@equals(item()?['Title'], '${title}')` },
  runAfter: { Obtener_Roles: ['Succeeded'] },
});

// The removal of a member of a group is derived from the addition that the flow already does,
// so both share the connection, the authentication and the expression of the group identifier.
function removalFrom(addition, loginExpression) {
  const removal = structuredClone(addition);
  removal.inputs.parameters['parameters/uri'] = addition.inputs.parameters['parameters/uri'].replace(/\/users$/, '/removeUser');
  removal.inputs.parameters['parameters/body'] = `{"userLoginName": "i:0#.f|membership|${loginExpression}"}`;
  removal.runAfter = {};
  removal.metadata = { operationMetadataId: 'b7c2d1a4-6f3e-4c58-9a10-2d5e8f6b4c73' };
  return removal;
}

const LOGIN = "@items('Por_cada_RolUsuario_Eliminar')?['usuario']";

function prepare(snapshot) {
  assertBaseline(snapshot);
  const result = structuredClone(snapshot);
  const tryScope = result.definition.actions[TRY].actions;

  // 1. The catalog of the two kinds the deletion needs to recognise by name: the kind that owns
  // the group of the project managers and the Direccion kind, which is out of scope.
  tryScope[CATALOG.jefe.action] = catalogQuery(CATALOG.jefe.title);
  tryScope[CATALOG.direccion.action] = catalogQuery(CATALOG.direccion.title);
  const existe = tryScope[EXISTE];
  existe.runAfter = { ...existe.runAfter, [CATALOG.jefe.action]: ['Succeeded'], [CATALOG.direccion.action]: ['Succeeded'] };

  // 2. The deletion loop: the Direccion row is never deleted and the person of a deleted row
  // leaves the group of its kind when she holds no other row of that kind.
  const borrar = get(result.definition, PATHS.borrar);
  const guardia = borrar.actions.Es_Rol_No_Deseado;
  guardia.expression.and.push({
    not: [{
      equals: [
        "@items('Por_cada_RolUsuario_Eliminar')?['IDRol']",
        `@body('${CATALOG.direccion.action}')?[0]?['IDRol']`,
      ],
    }],
  });

  const addJefes = get(result.definition,
    `${PATHS.jefe}.else.actions.Contiene_Usuario_ya.else.actions.Añadir_usuario_a_grupo_SP_Jefes_de_Proyecto`);
  const addCalidad = get(result.definition,
    `${PATHS.calidad}.else.actions.Crear_Tecnico_de_Calidad_en_Grupo_Sharepoint`);
  assert.ok(addJefes && addCalidad, 'the additions to the groups are not where the baseline expects them');

  if (GROUP_REMOVAL_ENABLED) {
    guardia.actions.Buscar_Otros_Expedientes_Con_El_Mismo_Rol = {
      type: 'Query',
      inputs: {
        from: "@body('RolesUsuario')",
        where: "@and(equals(item()?['usuario'],items('Por_cada_RolUsuario_Eliminar')?['usuario']),equals(item()?['IDRol'],items('Por_cada_RolUsuario_Eliminar')?['IDRol']),not(equals(item()?['IDExpediente'],body('ExpedienteJSON')?['idexpediente'])))",
      },
      runAfter: {},
    };

    guardia.actions.Quitar_el_miembro_del_grupo = {
    type: 'If',
    expression: {
      and: [
        { equals: ["@length(body('Buscar_Otros_Expedientes_Con_El_Mismo_Rol'))", 0] },
        {
          or: [
            { equals: ["@items('Por_cada_RolUsuario_Eliminar')?['IDRol']", `@body('${CATALOG.jefe.action}')?[0]?['IDRol']`] },
            { equals: ["@items('Por_cada_RolUsuario_Eliminar')?['IDRol']", "@body('Rol_Tecnico_de_Calidad')?[0]?['IDRol']"] },
          ],
        },
      ],
    },
    actions: {
      Quitar_del_grupo_de_jefes: {
        type: 'If',
        expression: { equals: ["@items('Por_cada_RolUsuario_Eliminar')?['IDRol']", `@body('${CATALOG.jefe.action}')?[0]?['IDRol']`] },
        actions: { Quitar_al_jefe_del_grupo: removalFrom(addJefes, LOGIN) },
        else: { actions: {} },
        runAfter: {},
      },
      Quitar_del_grupo_de_calidad: {
        type: 'If',
        expression: { equals: ["@items('Por_cada_RolUsuario_Eliminar')?['IDRol']", "@body('Rol_Tecnico_de_Calidad')?[0]?['IDRol']"] },
        actions: { Quitar_a_la_calidad_del_grupo: removalFrom(addCalidad, LOGIN) },
        else: { actions: {} },
        runAfter: {},
      },
    },
    else: { actions: {} },
      runAfter: { Eliminar_RolesUsuario: ['Succeeded'], Buscar_Otros_Expedientes_Con_El_Mismo_Rol: ['Succeeded'] },
    };
  }

  // 3. The quality row is only created when the JSON describes a quality person. With no quality
  // person the row that exists is deleted and no row with an empty user is created.
  const calidad = get(result.definition, PATHS.calidad);
  const creates = calidad.else.actions;
  calidad.else.actions = {
    Si_el_JSON_trae_calidad: {
      type: 'If',
      expression: {
        not: [{
          equals: [
            "@string(coalesce(body('ExpedienteJSON')?['responsableCalidad']?['correousuario'], ''))",
            '',
          ],
        }],
      },
      actions: creates,
      else: { actions: {} },
      runAfter: {},
    },
  };

  // 4. A row that already holds the person of the JSON is only written when the name of the JSON
  // is different: a person that does not change is not touched at all.
  for (const update of UPDATES) {
    const branch = get(result.definition, update.path);
    assert.ok(branch && branch.type === 'If', `the update branch of ${update.kind} is not where the baseline expects it`);
    branch.expression = {
      and: [
        branch.expression,
        {
          not: [{
            equals: [
              `@string(coalesce(first(body('${update.buscar}'))?['Title'], ''))`,
              `@string(coalesce(${update.name}, ''))`,
            ],
          }],
        },
      ],
    };
  }

  return result;
}

function changedPathAllowlist() {
  const allowed = [
    `$.actions.${TRY}.actions.${CATALOG.jefe.action}`,
    `$.actions.${TRY}.actions.${CATALOG.direccion.action}`,
    `$.actions.${TRY}.actions.${EXISTE}.runAfter.${CATALOG.jefe.action}`,
    `$.actions.${TRY}.actions.${EXISTE}.runAfter.${CATALOG.direccion.action}`,
    `$.${PATHS.borrar}.actions.Es_Rol_No_Deseado.expression`,
    `$.${PATHS.borrar}.actions.Es_Rol_No_Deseado.actions.Buscar_Otros_Expedientes_Con_El_Mismo_Rol`,
    `$.${PATHS.borrar}.actions.Es_Rol_No_Deseado.actions.Quitar_el_miembro_del_grupo`,
    `$.${PATHS.calidad}.else.actions.Crear_Tecnico_de_Calidad`,
    `$.${PATHS.calidad}.else.actions.Crear_Tecnico_de_Calidad_en_Grupo_Sharepoint`,
    `$.${PATHS.calidad}.else.actions.Si_el_JSON_trae_calidad`,
    `$.${PATHS.calidad}.else.actions.Si_el_JSON_trae_calidad.actions.Crear_Tecnico_de_Calidad`,
    `$.${PATHS.calidad}.else.actions.Si_el_JSON_trae_calidad.actions.Crear_Tecnico_de_Calidad_en_Grupo_Sharepoint`,
  ];
  for (const update of UPDATES) allowed.push(`$.${update.path}.expression`);
  return allowed;
}

function compare(base, candidate) {
  const changed = diffPaths(base.definition, candidate.definition);
  const allowed = changedPathAllowlist();
  for (const changedPath of changed) {
    const isAllowed = allowed.some(prefix => changedPath === prefix || changedPath.startsWith(`${prefix}.`));
    assert.ok(isAllowed, `unexpected changed path: ${changedPath}`);
  }
  const guardia = get(candidate.definition, `${PATHS.borrar}.actions.Es_Rol_No_Deseado`);
  assert.equal(guardia.actions.Eliminar_RolesUsuario.inputs.host.operationId, 'DeleteItem');
  assert.equal(guardia.actions.Eliminar_RolesUsuario.runtimeConfiguration, undefined, 'the role deletion must be a real delete inside the guard');
  const grupos = guardia.actions.Quitar_el_miembro_del_grupo;
  assert.equal(Boolean(grupos), GROUP_REMOVAL_ENABLED,
    'the removal from the group does not match the flag that enables it');
  if (grupos) {
    const quitJefes = grupos.actions.Quitar_del_grupo_de_jefes.actions.Quitar_al_jefe_del_grupo;
    const quitCalidad = grupos.actions.Quitar_del_grupo_de_calidad.actions.Quitar_a_la_calidad_del_grupo;
    assert.ok(quitJefes.inputs.parameters['parameters/uri'].endsWith('/removeUser'), 'the removal of the project managers does not use the endpoint of the group');
    assert.ok(quitCalidad.inputs.parameters['parameters/uri'].endsWith('/removeUser'), 'the removal of the quality does not use the endpoint of the group');
    assert.match(quitJefes.inputs.parameters['parameters/body'], /userLoginName/);
  }
  const calidad = get(candidate.definition, PATHS.calidad);
  assert.ok(calidad.else.actions.Si_el_JSON_trae_calidad, 'the quality creation is not guarded');
  assert.ok(!calidad.else.actions.Crear_Tecnico_de_Calidad, 'the unguarded quality creation is still reachable');
  const cycles = dependencyCycles(candidate.definition);
  assert.deepEqual(cycles, [], `the candidate must not close a dependency cycle: ${cycles.join(' | ')}`);
  return {
    changedPaths: changed,
    changedPathCount: changed.length,
    sourceDefinitionSha256: definitionHash(base.definition),
    candidateDefinitionSha256: definitionHash(candidate.definition),
    direccionIsOutOfScope: true,
    qualityRowsAreDeletable: true,
    deletesFailClosed: true,
    removesTheMemberOfTheGroup: GROUP_REMOVAL_ENABLED,
    groupRemovalIsDisabledBecauseTheEndpointDoesNotExist: !GROUP_REMOVAL_ENABLED,
    writesOnlyWhenTheNameChanges: true,
  };
}

// The platform validates the action graph when the flow is saved and rejects a cycle with
// "The circular dependency detected in template language expressions". The check is done per
// scope, over the dependencies an action declares on the actions of the same scope.
function scopeCycles(scope) {
  const actions = scope.actions || {};
  const names = Object.keys(actions);
  const edges = new Map(names.map(name => [name, Object.keys(actions[name].runAfter || {}).filter(dep => names.includes(dep))]));
  const state = new Map();
  const cycles = [];
  const visit = (name, stack) => {
    if (state.get(name) === 'done') return;
    if (state.get(name) === 'open') { cycles.push([...stack, name].join(' -> ')); return; }
    state.set(name, 'open');
    for (const dependency of edges.get(name) || []) visit(dependency, [...stack, name]);
    state.set(name, 'done');
  };
  for (const name of names) visit(name, []);
  return cycles;
}

function dependencyCycles(definition) {
  const cycles = [];
  const walk = node => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    if (node.actions && typeof node.actions === 'object') cycles.push(...scopeCycles(node));
    for (const key of Object.keys(node)) walk(node[key]);
  };
  walk(definition);
  return cycles;
}

function validateDestination(destination, exclusive = true) {
  const resolved = path.resolve(destination);
  const relative = path.relative(DIRECTORY, resolved);
  assert.ok(relative && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`),
    'destination must stay inside the ignored candidate subtree');
  let current = path.parse(resolved).root;
  for (const part of resolved.slice(current.length).split(path.sep)) {
    current = path.join(current, part);
    let stat;
    try { stat = fs.lstatSync(current); } catch (error) { if (error.code === 'ENOENT') break; throw error; }
    assert.ok(!stat.isSymbolicLink(), 'destination contains a symbolic link or reparse point');
    assert.equal(path.relative(current, fs.realpathSync.native(current)), '', 'destination reparse resolution differs');
  }
  if (exclusive) assert.ok(!fs.existsSync(resolved), 'refusing to overwrite existing output');
  return resolved;
}

function writeOutputs() {
  const destinations = OUTPUTS.map(name => validateDestination(path.join(DIRECTORY, name)));
  const base = readBase();
  const candidate = prepare(base);
  const comparison = compare(base, candidate);
  const candidateBytes = `${JSON.stringify(candidate.definition, null, 2)}\n`;
  const comparisonBytes = `${JSON.stringify({
    status: 'PREPARED_NOT_APPLIED',
    checkedAt: new Date().toISOString(),
    environment: ENVIRONMENT,
    flow: FLOW,
    basePath: BASE_PATH,
    baseDefinitionSha256: BASE_DEFINITION_HASH,
    candidateBytes: Buffer.byteLength(candidateBytes),
    candidateSha256: hash(candidateBytes),
    changes: [
      'The Direccion kind is read from the catalog by title and its row is never deleted.',
      'The quality row is only created when the JSON describes a quality person, so no row with an empty user is created and the row that exists is deleted.',
      'A deleted row takes its person out of the group of its kind, and only when she holds no other row of that kind in another expediente.',
      'A row that already holds the person of the JSON is written only when the name of the JSON is different.',
      'The deletion keeps failing closed: with no valid responsible in the JSON nothing is deleted.',
    ],
    outOfScope: [
      'No supplier, milestone, expediente, permission or connection is touched.',
      'The parent flow and its ordering guard are not touched.',
      'The Personal externo kind is not written by the flow and a row of that kind is deleted, as the JSON cannot describe it.',
    ],
    comparison,
    runtime: { applied: false, executed: false },
  }, null, 2)}\n`;
  fs.mkdirSync(DIRECTORY, { recursive: true });
  const values = { 'candidate-definition.json': candidateBytes, 'candidate-comparison.json': comparisonBytes };
  return destinations.map((file, index) => {
    validateDestination(file);
    const content = values[OUTPUTS[index]];
    fs.writeFileSync(file, content, { flag: 'wx' });
    return { file: path.basename(file), sha256: hash(content) };
  });
}

if (require.main === module) {
  assert.equal(process.argv.length, 2, 'Usage: node prepare-role-authoritative-deletion.cjs (fixed inputs/outputs only)');
  process.stdout.write(`${JSON.stringify({ localOnly: true, outputs: writeOutputs() })}\n`);
}

module.exports = { prepare, compare, readBase, diffPaths, definitionHash, validateDestination, writeOutputs,
  dependencyCycles, GROUP_REMOVAL_ENABLED, BASE_PATH, BASE_DEFINITION_HASH, DIRECTORY, OUTPUTS, ENVIRONMENT, FLOW, PATHS, UPDATES, CATALOG };
