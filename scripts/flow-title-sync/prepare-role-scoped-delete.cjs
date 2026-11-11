'use strict';
// Offline candidate preparation only: no authentication, cloud client, save or deployment.
// Phase 2b of the authoritative reconciliation: the role rows the JSON no longer describes are
// deleted, and only those. The delete is scoped to the keys the JSON does not carry and it fails
// closed: with no valid responsible in the JSON nothing is deleted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const BASE_PATH = path.resolve(__dirname, '../../.atl/project-title-sync/role-title-convergence-20261110/candidate-definition.json');
const BASE_DEFINITION_HASH = '568D3028B095C9F7EE38659D35D8B4BBE2CEB7A7ACA7E7D48FFCD8C72CEBD845';
const ENVIRONMENT = 'aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b';
const FLOW = '1ca49582-ae1e-f111-8342-6045bde02c54';
const DIRECTORY = path.resolve(__dirname, '../../.atl/project-title-sync/role-scoped-delete-20261110');
const OUTPUTS = ['candidate-definition.json', 'candidate-comparison.json'];

const TRY = 'Try_-_Procesar_ExpedientesJSON';
const EXISTE = 'Existe_ExpedienteJSON';
const COMPROBAR = 'Comprobar_que_hay_RolesUsuario';
const POR_CADA_2 = 'Por_cada_Responsable_2';
const VARIABLE = 'RolesUsuarioDeseados';
const NORM = value => `toLower(trim(${value}))`;

const PATHS = {
  calidad: `actions.${TRY}.actions.${EXISTE}.actions.Responsable_de_Calidad_ya_Existente`,
  jefe: `actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}.actions.${POR_CADA_2}.actions.No_es_Jefe_de_Proyecto_2.else.actions`,
  preventa: `actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}.actions.${POR_CADA_2}.actions.No_es_Preventa_2.else.actions`,
  ingenieria: `actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}.actions.${POR_CADA_2}.actions.No_es_Preventa_2.actions.Es_Ingeniero_2.actions`,
  seguridad: `actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}.actions.${POR_CADA_2}.actions.Responsable_Seguridad_no_vacio_1.actions.Contiene_Usuario_ya_Seguridad.actions`,
  borrar: `actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}.actions.Por_cada_RolUsuario_Eliminar`,
};

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
    'source definition differs from the reviewed phase 2a candidate');
  return { environment: ENVIRONMENT, flow: FLOW, definition };
}

function assertBaseline(snapshot) {
  const borrar = get(snapshot.definition, PATHS.borrar);
  assert.ok(borrar, 'the role deletion loop is missing from the source');
  assert.equal(borrar.type, 'Foreach');
  assert.ok(borrar.actions.Eliminar_RolesUsuario, 'the deletion action is not where the baseline expects it');
  assert.equal(borrar.actions.Eliminar_RolesUsuario.runtimeConfiguration?.staticResult?.name, 'Eliminar_RolesUsuario0',
    'the role deletion is no longer the reviewed static result');
  assert.equal(borrar.runAfter && Object.keys(borrar.runAfter).length, 0, 'the deletion loop no longer runs first');
  assert.ok(!snapshot.definition.actions[`INI_${VARIABLE}`], 'the desired key variable already exists');
}

function appendAction(value) {
  return {
    type: 'AppendToArrayVariable',
    inputs: { name: VARIABLE, value },
    runAfter: {},
  };
}

function prepare(snapshot) {
  assertBaseline(snapshot);
  const result = structuredClone(snapshot);

  // 1. The desired key set, collected while the flow already resolves the role identifiers.
  result.definition.actions[`INI_${VARIABLE}`] = {
    type: 'InitializeVariable',
    inputs: { variables: [{ name: VARIABLE, type: 'array' }] },
    runAfter: {},
  };

  const jefeKey = `@concat(${NORM("items('Por_cada_Responsable_2')?['correousuario']")},'-',body('Filter_array_2')?[0]?['IDRol'])`;
  const preventaKey = `@concat(${NORM("items('Por_cada_Responsable_2')?['correousuario']")},'-',body('Filter_array_Preventa_2')?[0]?['IDRol'])`;
  const ingenieriaKey = `@concat(${NORM("items('Por_cada_Responsable_2')?['correousuario']")},'-',int(parameters('E2E_IDRol_Ingenieria (cr435_E2E_IDRol_Ingenieria)')))`;
  const calidadKey = `@concat(${NORM("body('ExpedienteJSON')?['responsableCalidad']?['correousuario']")},'-',body('Rol_Tecnico_de_Calidad')?[0]?['IDRol'])`;
  const seguridadKey = `@concat(${NORM("body('ExpedienteJSON')?['responsableSeguridad']?['correousuario']")},'-',5)`;

  const jefe = get(result.definition, PATHS.jefe);
  jefe.Anexar_Rol_Deseado_Jefe = appendAction(jefeKey);
  jefe.Anexar_Rol_Deseado_Jefe.runAfter = { Filter_array_2: ['Succeeded'] };

  const preventa = get(result.definition, PATHS.preventa);
  preventa.Anexar_Rol_Deseado_Preventa = appendAction(preventaKey);
  preventa.Anexar_Rol_Deseado_Preventa.runAfter = { Filter_array_Preventa_2: ['Succeeded'] };

  get(result.definition, PATHS.ingenieria).Anexar_Rol_Deseado_Ingenieria = appendAction(ingenieriaKey);

  // The quality and security rows only need to be in the desired set when they already exist:
  // a row the JSON still describes must never be deleted.
  get(result.definition, PATHS.calidad).actions.Anexar_Rol_Deseado_Calidad = appendAction(calidadKey);
  get(result.definition, PATHS.seguridad).Anexar_Rol_Deseado_Seguridad = appendAction(seguridadKey);

  // 2. The delete only runs for rows the JSON no longer describes, and never with an empty
  // responsible list: the flow fails closed instead of emptying an expediente.
  const borrar = get(result.definition, PATHS.borrar);
  const eliminacion = borrar.actions.Eliminar_RolesUsuario;
  delete eliminacion.runtimeConfiguration;
  delete borrar.actions.Eliminar_RolesUsuario;
  borrar.actions.Es_Rol_No_Deseado = {
    type: 'If',
    expression: {
      and: [
        { greaterOrEquals: ["@length(body('Filtrar_Responsables_Validos'))", 1] },
        { not: [{ contains: [`@variables('${VARIABLE}')`, `@concat(${NORM("items('Por_cada_RolUsuario_Eliminar')?['usuario']")},'-',items('Por_cada_RolUsuario_Eliminar')?['IDRol'])`] }] },
      ],
    },
    actions: { Eliminar_RolesUsuario: eliminacion },
    else: { actions: {} },
    runAfter: {},
  };

  // 3. The deletion loop runs once the desired set is complete.
  borrar.runAfter = { [POR_CADA_2]: ['Succeeded'] };
  const comprobar = get(result.definition, `actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}`);
  comprobar.runAfter = { ...comprobar.runAfter, Responsable_de_Calidad_ya_Existente: ['Succeeded'] };

  return result;
}

function compare(base, candidate) {
  const changed = diffPaths(base.definition, candidate.definition);
  const allowed = [
    `$.actions.INI_${VARIABLE}`,
    `$.${PATHS.jefe}.Anexar_Rol_Deseado_Jefe`,
    `$.${PATHS.preventa}.Anexar_Rol_Deseado_Preventa`,
    `$.${PATHS.ingenieria}.Anexar_Rol_Deseado_Ingenieria`,
    `$.${PATHS.calidad}.actions.Anexar_Rol_Deseado_Calidad`,
    `$.${PATHS.seguridad}.Anexar_Rol_Deseado_Seguridad`,
    `$.${PATHS.borrar}.runAfter.Por_cada_Responsable_2`,
    `$.${PATHS.borrar}.actions.Eliminar_RolesUsuario`,
    `$.${PATHS.borrar}.actions.Es_Rol_No_Deseado`,
    `$.actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}.runAfter.Responsable_de_Calidad_ya_Existente`,
  ];
  for (const changedPath of changed) {
    assert.ok(allowed.includes(changedPath), `unexpected changed path: ${changedPath}`);
  }
  const eliminar = get(candidate.definition, `${PATHS.borrar}.actions.Es_Rol_No_Deseado.actions.Eliminar_RolesUsuario`);
  assert.equal(eliminar.inputs.host.operationId, 'DeleteItem');
  assert.equal(eliminar.runtimeConfiguration, undefined, 'the role deletion must be a real delete inside the guard');
  return {
    changedPaths: changed,
    changedPathCount: changed.length,
    sourceDefinitionSha256: definitionHash(base.definition),
    candidateDefinitionSha256: definitionHash(candidate.definition),
    deleteIsScoped: true,
    deleteFailsClosed: true,
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
    changes: [
      'A desired role key set is collected while the flow already resolves the role identifiers.',
      'The role deletion becomes a real delete and only runs for rows whose key is not in that set.',
      'With no valid responsible in the JSON the delete fails closed and nothing is removed.',
      'The deletion loop runs after the responsible loop and the quality check, so the set is complete.',
    ],
    outOfScope: [
      'No supplier, milestone, expediente, permission or connection is touched.',
      'The existing duplicates outside the controlled expedientes are not cleaned.',
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
  assert.equal(process.argv.length, 2, 'Usage: node prepare-role-scoped-delete.cjs (fixed inputs/outputs only)');
  process.stdout.write(`${JSON.stringify({ localOnly: true, outputs: writeOutputs() })}\n`);
}

module.exports = { prepare, compare, readBase, diffPaths, definitionHash, validateDestination, writeOutputs,
  BASE_PATH, BASE_DEFINITION_HASH, DIRECTORY, OUTPUTS, ENVIRONMENT, FLOW, PATHS, VARIABLE };
