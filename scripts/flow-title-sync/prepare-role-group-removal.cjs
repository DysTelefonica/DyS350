'use strict';
// Offline candidate preparation only: no authentication, cloud client, save or deployment.
// Phase F2 of DEV/CERT: the removal of the member of the group, rewritten.
//
// The phase F published the removal of the member of the group inside a condition that the flow
// never evaluates: the action 'Quitar_el_miembro_del_grupo' failed in DEV/CERT on 2026-11-17
// with the error 'ActionFailed' and without running any of its actions, so the person of a
// deleted row never left the group. The condition was the only expression of the flow that used
// an 'or' of two comparisons and the only one that nested an If inside an If inside the deletion
// loop.
//
// This phase rewrites the removal with the vocabulary the flow itself uses for the same job (the
// deletion of a milestone and the deletion of a supplier): one If per kind, with 'and' of two
// comparisons and the actions of the group in the body. Nothing else of the flow moves.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const BASE_PATH = path.resolve(__dirname, '../../.atl/project-title-sync/role-group-removal-v2-20261117/base-definition.json');
const BASE_DEFINITION_HASH = '9C85364B92CD38CBDDDCB3F38500B3150BCE9518F9CCFFE0F07AAD4F896ADF4E';
const ENVIRONMENT = 'aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b';
const FLOW = '1ca49582-ae1e-f111-8342-6045bde02c54';
const DIRECTORY = path.resolve(__dirname, '../../.atl/project-title-sync/role-group-removal-v2-20261117');
const OUTPUTS = ['candidate-definition.json', 'candidate-comparison.json'];

const TRY = 'Try_-_Procesar_ExpedientesJSON';
const EXISTE = 'Existe_ExpedienteJSON';
const COMPROBAR = 'Comprobar_que_hay_RolesUsuario';
const ELIMINAR = 'Por_cada_RolUsuario_Eliminar';
const GUARDIA = 'Es_Rol_No_Deseado';
const CRUCE = 'Buscar_Otros_Expedientes_Con_El_Mismo_Rol';

// The two kinds that own a group, and the action of the flow that adds a member to it. The
// removal is derived from the addition, so both share the connection, the authentication and the
// expression of the identifier of the group.
const GRUPOS = [
  {
    if: 'Quitar_el_miembro_del_grupo_jefes',
    accion: 'Quitar_al_jefe_del_grupo',
    condicion: 'Quitar_del_grupo_de_jefes',
    grupo: 'Obtener_ID_Grupo_Jefes_de_Proyecto',
    adicion: 'usuario_a_grupo_SP_Jefes_de_Proyecto$',
    catalogo: 'Rol_Jefe_de_Proyecto',
  },
  {
    if: 'Quitar_el_miembro_del_grupo_calidad',
    accion: 'Quitar_a_la_calidad_del_grupo',
    condicion: 'Quitar_del_grupo_de_calidad',
    grupo: 'Obtener_ID_Grupo_Calidad',
    adicion: 'Crear_Tecnico_de_Calidad_en_Grupo_Sharepoint$',
    catalogo: 'Rol_Tecnico_de_Calidad',
  },
];

const LOGIN = "@items('Por_cada_RolUsuario_Eliminar')?['usuario']";

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

// The first action of the definition whose name matches the pattern. The name of the action of
// the flow carries an accent, so it is found by a pattern instead of being written twice.
function findAction(definition, pattern) {
  const matcher = new RegExp(pattern);
  let found = null;
  const walk = (node, path) => {
    if (found || !node || typeof node !== 'object') return;
    if (node.actions && typeof node.actions === 'object') {
      for (const [name, action] of Object.entries(node.actions)) {
        if (matcher.test(name)) { found = { name, action, path: path + '.actions.' + name }; break; }
        walk(action, path + '.actions.' + name);
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'actions') continue;
      walk(node[key], path + '.' + key);
    }
  };
  walk(definition, '$');
  return found;
}

function readBase(basePath = BASE_PATH) {
  const bytes = fs.readFileSync(basePath);
  const definition = JSON.parse(bytes.toString('utf8'));
  assert.equal(definitionHash(definition), BASE_DEFINITION_HASH,
    'the source definition is not the one that is published in DEV/CERT');
  return { environment: ENVIRONMENT, flow: FLOW, definition };
}

// The scope of the deletion loop, where the guard and the cross check live.
const GUARDIA_PATH = `actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}.actions.${ELIMINAR}.actions.${GUARDIA}.actions`;

function guardActions(definition) {
  return get(definition, GUARDIA_PATH);
}

// The addition of a member to a group, with the identifier of the group and the login of the
// person of the row that is deleted.
function removalFrom(addition, groupAction) {
  const removal = structuredClone(addition);
  removal.inputs.parameters['parameters/uri'] = addition.inputs.parameters['parameters/uri'].replace(/\/users$/, '/removeUser');
  removal.inputs.parameters['parameters/body'] = `{"userLoginName": "i:0#.f|membership|${LOGIN}"}`;
  removal.runAfter = {};
  delete removal.metadata;
  return removal;
}

function prepare(snapshot) {
  const result = structuredClone(snapshot);
  const acciones = guardActions(result.definition);
  assert.ok(acciones, 'the deletion guard is not where the baseline expects it');
  assert.ok(acciones[CRUCE], 'the cross check of the other expedientes is missing from the source');
  assert.ok(acciones['Quitar_el_miembro_del_grupo'], 'the removal of the member of the group is missing from the source');

  // The actions of the flow that add a member to a group, to derive the removal from them.
  const tryScope = result.definition.actions[TRY].actions;
  const adiciones = {};
  for (const grupo of GRUPOS) {
    const found = findAction(result.definition, grupo.adicion);
    assert.ok(found, `the addition to the group of ${grupo.condicion} is not in the source`);
    adiciones[grupo.adicion] = found.action;
    assert.ok(tryScope[grupo.catalogo], `the catalog of ${grupo.catalogo} is missing from the source`);
  }

  // The removal is one If per kind, in the scope of the guard, with the vocabulary the flow uses
  // for the same job in the milestones and in the suppliers.
  delete acciones['Quitar_el_miembro_del_grupo'];
  for (const grupo of GRUPOS) {
    acciones[grupo.if] = {
      type: 'If',
      expression: {
        and: [
          { equals: [`@length(body('${CRUCE}'))`, 0] },
          { equals: ["@items('Por_cada_RolUsuario_Eliminar')?['IDRol']", `@body('${grupo.catalogo}')?[0]?['IDRol']`] },
        ],
      },
      actions: { [grupo.accion]: removalFrom(adiciones[grupo.adicion], grupo.grupo) },
      else: { actions: {} },
      runAfter: { [CRUCE]: ['Succeeded'], Eliminar_RolesUsuario: ['Succeeded'] },
    };
  }

  return result;
}

function changedPathAllowlist() {
  const allowed = [
    `$.${GUARDIA_PATH}.Quitar_el_miembro_del_grupo`,
  ];
  for (const grupo of GRUPOS) {
    allowed.push(`$.${GUARDIA_PATH}.${grupo.if}`);
    allowed.push(`$.${GUARDIA_PATH}.${grupo.condicion}`);
  }
  return allowed;
}

function compare(base, candidate) {
  const changed = diffPaths(base.definition, candidate.definition);
  const allowed = changedPathAllowlist();
  for (const changedPath of changed) {
    const isAllowed = allowed.some(prefix => changedPath === prefix || changedPath.startsWith(`${prefix}.`));
    assert.ok(isAllowed, `unexpected changed path: ${changedPath}`);
  }
  assert.ok(changed.length > 0, 'the candidate does not change anything');
  const acciones = guardActions(candidate.definition);
  assert.ok(!acciones['Quitar_el_miembro_del_grupo'], 'the condition that failed is still there');
  for (const grupo of GRUPOS) {
    const ifAction = acciones[grupo.if];
    assert.ok(ifAction && ifAction.type === 'If', `the removal of ${grupo.accion} is missing from the candidate`);
    assert.equal(ifAction.actions[grupo.accion].type, 'OpenApiConnection');
    assert.ok(ifAction.actions[grupo.accion].inputs.parameters['parameters/uri'].endsWith('/removeUser'),
      'the removal does not use the endpoint of the group');
    assert.match(ifAction.actions[grupo.accion].inputs.parameters['parameters/body'], /userLoginName/);
    assert.equal(JSON.stringify(ifAction.expression).includes('"or"'), false,
      'the condition of the removal cannot use an or');
  }
  return {
    changedPaths: changed,
    changedPathCount: changed.length,
    sourceDefinitionSha256: definitionHash(base.definition),
    candidateDefinitionSha256: definitionHash(candidate.definition),
  };
}

function validateDestination(destination, exclusive = true) {
  const resolved = path.resolve(destination);
  const relative = path.relative(DIRECTORY, resolved);
  assert.ok(relative && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`),
    'destination must stay inside the ignored candidate subtree');
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
      'The removal of the member of the group is one If per kind, in the scope of the guard of the deletion.',
      'The condition uses the vocabulary of the flow: and of two comparisons, without an or.',
      'The cross check of the other expedientes is the same query of the phase F.',
      'The request is derived from the addition of the member to the group that the flow already does.',
    ],
    outOfScope: [
      'The deletion of the role rows, the catalog and the rest of the phase F are not touched.',
      'The parent flow and its ordering guard are not touched.',
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
  assert.equal(process.argv.length, 2, 'Usage: node prepare-role-group-removal.cjs (fixed inputs/outputs only)');
  process.stdout.write(`${JSON.stringify({ localOnly: true, outputs: writeOutputs() })}\n`);
}

module.exports = { prepare, compare, readBase, diffPaths, definitionHash, validateDestination, writeOutputs,
  BASE_PATH, BASE_DEFINITION_HASH, DIRECTORY, OUTPUTS, ENVIRONMENT, FLOW, GRUPOS, GUARDIA_PATH,
  changedPathAllowlist, guardActions };
