'use strict';
// Offline candidate preparation only: no authentication, cloud client, save or deployment.
// Phase 2a of the authoritative reconciliation: when a role already exists, the stored title and
// user are rewritten from the JSON. Nothing is deleted: the role deletion stays simulated.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const BASE_PATH = path.resolve(__dirname, '../../.atl/project-title-sync/role-existence-guard-20261110/candidate-definition.json');
const BASE_DEFINITION_HASH = 'B419F64A9666E4F3ACF326149B3E9502C02CE19F80F43164EBC9C72D73AFA244';
const ENVIRONMENT = 'aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b';
const FLOW = '1ca49582-ae1e-f111-8342-6045bde02c54';
const DIRECTORY = path.resolve(__dirname, '../../.atl/project-title-sync/role-title-convergence-20261110');
const OUTPUTS = ['candidate-definition.json', 'candidate-comparison.json'];

const TRY = 'Try_-_Procesar_ExpedientesJSON';
const EXISTE = 'Existe_ExpedienteJSON';
const COMPROBAR = 'Comprobar_que_hay_RolesUsuario';
const POR_CADA_2 = 'Por_cada_Responsable_2';

const LIST_ROLES = "@parameters('E2E_ListaRolesUsuario (cr435_E2E_ListaRolesUsuario)')";
const DATASET = "@parameters('E2E_ConexionEntorno (cr435_E2E_ConexionEntorno)')";
const AUTH = { type: 'Raw', value: "@json(decodeBase64(triggerOutputs().headers['X-MS-APIM-Tokens']))['$ConnectionKey']" };
const NORM = value => `toLower(trim(${value}))`;
const SNAPSHOT_KEY = `concat(${NORM("item()?['usuario']")},'-',item()?['IDRol'])`;

// One entry per role kind: where the guard lives, the key that identifies it and the JSON
// values that the stored row must carry.
const KINDS = [
  {
    id: 'Jefe',
    guard: `actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}.actions.${POR_CADA_2}.actions.No_es_Jefe_de_Proyecto_2.else.actions.Contiene_Usuario_ya`,
    key: `concat(${NORM("items('Por_cada_Responsable_2')?['correousuario']")},'-',body('Filter_array_2')?[0]?['IDRol'])`,
    title: "@items('Por_cada_Responsable_2')?['nombre']",
    usuario: "@items('Por_cada_Responsable_2')?['correousuario']",
  },
  {
    id: 'Preventa',
    guard: `actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}.actions.${POR_CADA_2}.actions.No_es_Preventa_2.else.actions.Contiene_Usuario_ya_2`,
    key: `concat(${NORM("items('Por_cada_Responsable_2')?['correousuario']")},'-',body('Filter_array_Preventa_2')?[0]?['IDRol'])`,
    title: "@items('Por_cada_Responsable_2')?['nombre']",
    usuario: "@items('Por_cada_Responsable_2')?['correousuario']",
  },
  {
    id: 'Ingenieria',
    guard: `actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}.actions.${POR_CADA_2}.actions.No_es_Preventa_2.actions.Es_Ingeniero_2.actions.Contiene_Usuario_ya_Ingenieria`,
    key: `concat(${NORM("items('Por_cada_Responsable_2')?['correousuario']")},'-',int(parameters('E2E_IDRol_Ingenieria (cr435_E2E_IDRol_Ingenieria)')))`,
    title: "@items('Por_cada_Responsable_2')?['nombre']",
    usuario: "@items('Por_cada_Responsable_2')?['correousuario']",
  },
  {
    id: 'Seguridad',
    guard: `actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}.actions.${POR_CADA_2}.actions.Responsable_Seguridad_no_vacio_1.actions.Contiene_Usuario_ya_Seguridad`,
    key: `concat(${NORM("body('ExpedienteJSON')?['responsableSeguridad']?['correousuario']")},'-',5)`,
    title: "@body('ExpedienteJSON')?['responsableSeguridad']?['nombre']",
    usuario: "@body('ExpedienteJSON')?['responsableSeguridad']?['correousuario']",
  },
  {
    id: 'Calidad',
    guard: `actions.${TRY}.actions.${EXISTE}.actions.Responsable_de_Calidad_ya_Existente`,
    key: `concat(${NORM("body('ExpedienteJSON')?['responsableCalidad']?['correousuario']")},'-',body('Rol_Tecnico_de_Calidad')?[0]?['IDRol'])`,
    title: "@body('ExpedienteJSON')?['responsableCalidad']?['nombre']",
    usuario: "@body('ExpedienteJSON')?['responsableCalidad']?['correousuario']",
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
    'source definition differs from the reviewed phase 1 candidate');
  return { environment: ENVIRONMENT, flow: FLOW, definition };
}

function assertBaseline(snapshot) {
  for (const kind of KINDS) {
    const guard = get(snapshot.definition, kind.guard);
    assert.ok(guard, `the ${kind.id} guard is missing from the source`);
    assert.equal(guard.type, 'If');
    assert.equal(guard.expression.contains[0], "@variables('RolesUsuarioPrevios')",
      `the ${kind.id} guard does not read the role key index`);
    assert.ok(guard.expression.contains[1].includes('toLower(trim('),
      `the ${kind.id} guard does not compare the normalized key`);
    assert.deepEqual(Object.keys(guard.actions ?? {}), [],
      `the ${kind.id} guard already carries an update branch`);
  }
  const deletion = get(snapshot.definition,
    `actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}.actions.Por_cada_RolUsuario_Eliminar.actions.Eliminar_RolesUsuario`);
  assert.equal(deletion.runtimeConfiguration?.staticResult?.name, 'Eliminar_RolesUsuario0',
    'the role deletion is no longer the reviewed static result: this phase never enables it');
}

function searchAction(kind) {
  return {
    type: 'Query',
    inputs: {
      from: "@body('Recoger_RolesUsuario')",
      where: `@equals(${SNAPSHOT_KEY},${kind.key})`,
    },
    runAfter: {},
  };
}

function patchAction(kind) {
  const search = `Buscar_Rol_Existente_${kind.id}`;
  return {
    type: 'OpenApiConnection',
    inputs: {
      host: {
        connectionName: 'shared_sharepointonline',
        operationId: 'PatchItem',
        apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline',
      },
      parameters: {
        dataset: DATASET,
        table: LIST_ROLES,
        id: `@first(body('${search}'))?['ID']`,
        'item/Title': kind.title,
        'item/usuario': kind.usuario,
      },
      authentication: AUTH,
    },
    runAfter: {},
  };
}

function prepare(snapshot) {
  assertBaseline(snapshot);
  const result = structuredClone(snapshot);
  for (const kind of KINDS) {
    const guard = get(result.definition, kind.guard);
    const search = `Buscar_Rol_Existente_${kind.id}`;
    const update = `Actualizar_Rol_Existente_${kind.id}`;
    guard.actions = {
      [search]: searchAction(kind),
      [update]: {
        type: 'If',
        expression: { greaterOrEquals: [`@length(body('${search}'))`, 1] },
        actions: { [`Actualizar_${kind.id}`]: patchAction(kind) },
        runAfter: { [search]: ['Succeeded'] },
      },
    };
  }
  return result;
}

function compare(base, candidate) {
  const changed = diffPaths(base.definition, candidate.definition);
  const allowed = KINDS.flatMap(kind => [
    `$.${kind.guard}.actions.Buscar_Rol_Existente_${kind.id}`,
    `$.${kind.guard}.actions.Actualizar_Rol_Existente_${kind.id}`,
  ]);
  for (const changedPath of changed) {
    assert.ok(allowed.includes(changedPath), `unexpected changed path: ${changedPath}`);
  }
  const deletion = get(candidate.definition,
    `actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}.actions.Por_cada_RolUsuario_Eliminar.actions.Eliminar_RolesUsuario`);
  assert.equal(deletion.runtimeConfiguration?.staticResult?.name, 'Eliminar_RolesUsuario0',
    'the candidate must keep the role deletion simulated');
  for (const kind of KINDS) {
    const guard = get(candidate.definition, kind.guard);
    const search = guard.actions[`Buscar_Rol_Existente_${kind.id}`];
    assert.ok(search.inputs.where.includes(kind.key.split(',').at(-1).trim()), 'the search must use the same key');
    const patch = guard.actions[`Actualizar_Rol_Existente_${kind.id}`].actions[`Actualizar_${kind.id}`];
    assert.equal(patch.inputs.host.operationId, 'PatchItem');
    assert.equal(patch.inputs.parameters['item/Title'], kind.title);
    assert.equal(patch.inputs.parameters['item/usuario'], kind.usuario);
  }
  return {
    changedPaths: changed,
    changedPathCount: changed.length,
    sourceDefinitionSha256: definitionHash(base.definition),
    candidateDefinitionSha256: definitionHash(candidate.definition),
    roleDeletionStillSimulated: true,
    updatedRoleKinds: KINDS.map(kind => kind.id),
  };
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
    changes: KINDS.map(kind => `The ${kind.id} role is looked up by the normalized key and rewritten with the JSON title and user.`),
    outOfScope: [
      'No role deletion is enabled: the deletion stays the reviewed static result.',
      'No supplier, milestone, expediente or connection is touched.',
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
  assert.equal(process.argv.length, 2, 'Usage: node prepare-role-title-convergence.cjs (fixed inputs/outputs only)');
  process.stdout.write(`${JSON.stringify({ localOnly: true, outputs: writeOutputs() })}\n`);
}

module.exports = { prepare, compare, readBase, diffPaths, definitionHash, validateDestination, writeOutputs,
  BASE_PATH, BASE_DEFINITION_HASH, DIRECTORY, OUTPUTS, ENVIRONMENT, FLOW, KINDS, TRY, EXISTE, COMPROBAR, POR_CADA_2 };
