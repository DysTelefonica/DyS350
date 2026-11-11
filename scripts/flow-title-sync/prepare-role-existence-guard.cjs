'use strict';
// Offline candidate preparation only: no authentication, cloud client, save or deployment.
// Phase 1 of the authoritative reconciliation: the role creations that ignore an existing role
// get an existence guard, and every role key is compared in one normalized form.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const BASE_PATH = path.resolve(__dirname, '../../.atl/project-title-sync/skip-empty-responsibles-20261106/saved-source.json');
const BASE_DEFINITION_HASH = '8B9A82F1CE6CDD71ADD147085BD50A437CCCA1EC343446B3C192E435CFB73C32';
const ENVIRONMENT = 'aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b';
const FLOW = '1ca49582-ae1e-f111-8342-6045bde02c54';
const DIRECTORY = path.resolve(__dirname, '../../.atl/project-title-sync/role-existence-guard-20261110');
const OUTPUTS = ['candidate-definition.json', 'candidate-comparison.json'];

const TRY = 'Try_-_Procesar_ExpedientesJSON';
const EXISTE = 'Existe_ExpedienteJSON';
const COMPROBAR = 'Comprobar_que_hay_RolesUsuario';
const POR_CADA_2 = 'Por_cada_Responsable_2';

// No '@' here: inside a nested expression the '@' prefix is only valid at the start of the whole
// expression, and the platform rejects 'concat(..., @int(...))' with a template validation error.
const INGENIERIA_PARAM = "int(parameters('E2E_IDRol_Ingenieria (cr435_E2E_IDRol_Ingenieria)'))";
const SEGURIDAD_IDROL = 5;
// One key format everywhere: trimmed and lower-cased user plus role id. The RF02 duplicate
// analysis grouped the rows by that form, so a raw comparison would miss real matches.
// Same shape the published flow already uses for its own normalized comparisons: string(coalesce(...))
// keeps a null user from breaking the expression at runtime.
const NORM = value => `toLower(trim(string(coalesce(${value}, ''))))`;

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
const flowPath = (...parts) => parts.join('.');

function readBase(basePath = BASE_PATH) {
  const bytes = fs.readFileSync(basePath);
  const snapshot = JSON.parse(bytes.toString('utf8'));
  assert.equal(snapshot.environment, ENVIRONMENT, 'source environment mismatch: DEV/CERT only');
  assert.equal(snapshot.flow, FLOW, 'source flow mismatch');
  assert.equal(definitionHash(snapshot.definition), BASE_DEFINITION_HASH,
    'source definition differs from the reviewed published child');
  return snapshot;
}

const PATHS = {
  anexar: flowPath(`actions.${TRY}.actions.${EXISTE}.actions.Por_cada_RolesUsuario.actions.Anexar_RolesUsuario`),
  calidad: flowPath(`actions.${TRY}.actions.${EXISTE}.actions.Responsable_de_Calidad_ya_Existente`),
  jefe: flowPath(`actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}.actions.${POR_CADA_2}.actions.No_es_Jefe_de_Proyecto_2.else.actions.Contiene_Usuario_ya`),
  preventa: flowPath(`actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}.actions.${POR_CADA_2}.actions.No_es_Preventa_2.else.actions.Contiene_Usuario_ya_2`),
  ingenieria: flowPath(`actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}.actions.${POR_CADA_2}.actions.No_es_Preventa_2.actions.Es_Ingeniero_2`),
  seguridad: flowPath(`actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}.actions.${POR_CADA_2}.actions.Responsable_Seguridad_no_vacio_1`),
  eliminacion: flowPath(`actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}.actions.Por_cada_RolUsuario_Eliminar.actions.Eliminar_RolesUsuario`),
};

// The six reviewed defects, asserted on the source before any edit.
function assertBaseline(snapshot) {
  const anexar = get(snapshot.definition, PATHS.anexar);
  assert.equal(anexar.inputs.value, "@{items('Por_cada_RolesUsuario')?['usuario']}-@{items('Por_cada_RolesUsuario')?['IDRol']}",
    'the role key list is no longer built in the reviewed raw form');
  const calidad = get(snapshot.definition, PATHS.calidad);
  assert.equal(calidad.expression.contains[0], "@variables('ArrayResponsables')",
    'the quality existence check no longer compares the incompatible variable');
  const jefe = get(snapshot.definition, PATHS.jefe);
  assert.ok(jefe.expression.contains[1].includes("items('Por_cada_Responsable_2')?['correousuario'],'-'"),
    'the project lead key is no longer the reviewed raw form');
  const preventa = get(snapshot.definition, PATHS.preventa);
  assert.ok(preventa.expression.contains[1].includes("items('Por_cada_Responsable_2')?['correousuario'], '-'"),
    'the Preventa key is no longer the reviewed raw form');
  const ingenieria = get(snapshot.definition, PATHS.ingenieria);
  assert.ok(!ingenieria.actions.Contiene_Usuario_ya_Ingenieria, 'the engineering guard is already present');
  assert.ok(ingenieria.actions.Crear_elemento, 'the engineering creation is not where the baseline expects it');
  const seguridad = get(snapshot.definition, PATHS.seguridad);
  assert.ok(!seguridad.actions.Contiene_Usuario_ya_Seguridad, 'the security guard is already present');
  assert.ok(seguridad.actions._Crear_Tecnico_Documentacion_Sin_RolesUsuario_1, 'the security creation is not where the baseline expects it');
  const eliminacion = get(snapshot.definition, PATHS.eliminacion);
  assert.equal(eliminacion.runtimeConfiguration?.staticResult?.name, 'Eliminar_RolesUsuario0',
    'the role deletion is no longer the reviewed static result: this phase never enables it');
}

function guard(keyExpression, creation) {
  return {
    type: 'If',
    expression: { contains: ["@variables('RolesUsuarioPrevios')", keyExpression] },
    actions: {},
    else: { actions: { [creation.name]: creation.action } },
  };
}

function prepare(snapshot) {
  assertBaseline(snapshot);
  const result = structuredClone(snapshot);

  // 1. One key format: the index of existing roles is built trimmed and lower-cased.
  const anexar = get(result.definition, PATHS.anexar);
  anexar.inputs.value = `@{${NORM("items('Por_cada_RolesUsuario')?['usuario']")}}-@{items('Por_cada_RolesUsuario')?['IDRol']}`;

  // 2. The project lead check compares the same normalized key.
  const jefe = get(result.definition, PATHS.jefe);
  jefe.expression.contains[1] = `@concat(${NORM("items('Por_cada_Responsable_2')?['correousuario']")},'-',body('Filter_array_2')?[0]?['IDRol'])`;

  // 3. The Preventa check compares the same normalized key.
  const preventa = get(result.definition, PATHS.preventa);
  preventa.expression.contains[1] = `@concat(${NORM("items('Por_cada_Responsable_2')?['correousuario']")},'-',body('Filter_array_Preventa_2')?[0]?['IDRol'])`;

  // 4. The quality technician check read an incompatible variable and never matched.
  const calidad = get(result.definition, PATHS.calidad);
  calidad.expression.contains[0] = "@variables('RolesUsuarioPrevios')";
  calidad.expression.contains[1] = `@concat(${NORM("body('ExpedienteJSON')?['responsableCalidad']?['correousuario']")},'-',body('Rol_Tecnico_de_Calidad')?[0]?['IDRol'])`;

  // 5. The engineering role was created without any existence check.
  const ingenieria = get(result.definition, PATHS.ingenieria);
  const ingenieriaCreation = ingenieria.actions.Crear_elemento;
  delete ingenieria.actions.Crear_elemento;
  ingenieria.actions.Contiene_Usuario_ya_Ingenieria = guard(
    `@concat(${NORM("items('Por_cada_Responsable_2')?['correousuario']")},'-',${INGENIERIA_PARAM})`,
    { name: 'Crear_elemento', action: ingenieriaCreation });

  // 6. The security role was created once per responsible and without any existence check.
  const seguridad = get(result.definition, PATHS.seguridad);
  const seguridadCreation = seguridad.actions._Crear_Tecnico_Documentacion_Sin_RolesUsuario_1;
  delete seguridad.actions._Crear_Tecnico_Documentacion_Sin_RolesUsuario_1;
  seguridad.actions.Contiene_Usuario_ya_Seguridad = guard(
    `@concat(${NORM("body('ExpedienteJSON')?['responsableSeguridad']?['correousuario']")},'-',${SEGURIDAD_IDROL})`,
    { name: '_Crear_Tecnico_Documentacion_Sin_RolesUsuario_1', action: seguridadCreation });

  return result;
}

function compare(base, candidate) {
  const changed = diffPaths(base.definition, candidate.definition);
  const allowed = [
    `$.${PATHS.anexar}.inputs.value`,
    `$.${PATHS.jefe}.expression.contains[1]`,
    `$.${PATHS.preventa}.expression.contains[1]`,
    `$.${PATHS.calidad}.expression.contains[0]`,
    `$.${PATHS.calidad}.expression.contains[1]`,
    `$.${PATHS.ingenieria}.actions.Crear_elemento`,
    `$.${PATHS.ingenieria}.actions.Contiene_Usuario_ya_Ingenieria`,
    `$.${PATHS.seguridad}.actions._Crear_Tecnico_Documentacion_Sin_RolesUsuario_1`,
    `$.${PATHS.seguridad}.actions.Contiene_Usuario_ya_Seguridad`,
  ];
  for (const changedPath of changed) {
    assert.ok(allowed.includes(changedPath), `unexpected changed path: ${changedPath}`);
  }
  const eliminacion = get(candidate.definition, PATHS.eliminacion);
  assert.equal(eliminacion.runtimeConfiguration?.staticResult?.name, 'Eliminar_RolesUsuario0',
    'the candidate must keep the role deletion simulated');
  const filter = get(candidate.definition, `actions.${TRY}.actions.Filtrar_Responsables_Validos`);
  assert.ok(filter, 'the responsible filter of the published child must be preserved');
  const anexar = get(candidate.definition, PATHS.anexar);
  assert.ok(anexar.inputs.value.includes('toLower(trim('), 'the role key index must be normalized');
  return {
    changedPaths: changed,
    changedPathCount: changed.length,
    sourceDefinitionSha256: definitionHash(base.definition),
    candidateDefinitionSha256: definitionHash(candidate.definition),
    roleDeletionStillSimulated: true,
    responsibleFilterPreserved: true,
    keyFormatNormalized: true,
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
      'The role key index is built trimmed and lower-cased.',
      'The project lead and Preventa checks compare that same normalized key.',
      'The quality technician existence check now reads RolesUsuarioPrevios and compares the normalized key.',
      'The engineering role creation is guarded by the normalized usuario-IDRol key of the existing roles.',
      'The security role creation is guarded by the normalized usuario-IDRol key of the existing roles.',
    ],
    outOfScope: [
      'No role deletion is enabled: the deletion stays the reviewed static result.',
      'No existing role row is updated: the title convergence belongs to the next phase.',
      'No other branch, binding, parameter or connection is touched.',
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
  assert.equal(process.argv.length, 2, 'Usage: node prepare-role-existence-guard.cjs (fixed inputs/outputs only)');
  process.stdout.write(`${JSON.stringify({ localOnly: true, outputs: writeOutputs() })}\n`);
}

module.exports = { prepare, compare, readBase, diffPaths, definitionHash, validateDestination, writeOutputs,
  BASE_PATH, BASE_DEFINITION_HASH, DIRECTORY, OUTPUTS, ENVIRONMENT, FLOW, TRY, EXISTE, COMPROBAR, POR_CADA_2,
  PATHS, NORM, INGENIERIA_PARAM, SEGURIDAD_IDROL };
