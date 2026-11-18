'use strict';
// Offline candidate preparation only: no authentication, cloud client, save or deployment.
// The candidate of PROD of the removal of the copies of a role row.
//
// Promoting to PROD is a PORT and not a copy: the definition that is published in PROD keeps its
// own wiring (the parameters of the environment, the authentication of the actions and the schema
// of the trigger) and receives the logic of the phase. The source of the logic is the candidate of
// DEV/CERT, and the difference against the definition that is live in PROD has to be exactly the
// paths of the phase: nothing else may move.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const phase = require('./prepare-role-duplicate-removal.cjs');

const LIVE_PATH = path.resolve(__dirname, '../../.atl/prod-live-child-20261118.json');
const LIVE_HASH = '97D20BA24E01CEEB3DFF506C532FF3BE0F26C1EBE41E100AC73C0E0A51B5A1E9';
const SOURCE_PATH = path.resolve(__dirname, '../../.atl/project-title-sync/role-duplicate-removal-20261118/candidate-definition.json');
const SOURCE_HASH = '177EC0C7D55D18A91504D9699227AD287FD6E58E926253AFAEF9A13F603C29C1';
const ENVIRONMENT = '80cfcc42-c966-ebc6-8934-9cd1802f9e53';
const FLOW = '1ca49582-ae1e-f111-8342-6045bde02c54';
const DIRECTORY = path.resolve(__dirname, '../../.atl/project-title-sync/prod-role-duplicate-removal-20261118');
const OUTPUTS = ['prod-child-ported-definition.json', 'prod-child-comparison.json'];

// The parameters of the environment of PROD, read from the site of PROD on 2026-11-17.
const PROD_PARAMS = {
  'E2E_ConexionEntorno (cr435_E2E_ConexionEntorno)': 'https://telefonicacorp.sharepoint.com/sites/DyS350.prod.OCETF',
  'E2E_ListaExpedientesJSON (cr435_E2E_ListaExpedientesJSON)': 'e5076497-ce45-41f1-852e-75deda0938db',
  'E2E_ListaRolesUsuario (cr435_E2E_ListaRolesUsuario)': 'b15bcf7c-b994-4e58-a541-61a9ebc160f0',
  'E2E_ListaRoles (cr435_E2E_ListaRoles)': '0472cfba-0b8d-469e-a8dc-ae1c6fae1ee1',
  'E2E_ListaHitos (cr435_E2E_ListaHitos)': 'bd50b05b-0d5d-4226-9638-3f25f6cbb100',
  'E2E_ListaSuministradores (cr435_E2E_ListaSuministradores)': 'b5757db4-7d8b-4ba6-bd8b-79ae84fcfe02',
  'E2E_BibliotecaCargaExpedientesJSON (cr435_E2E_BibliotecaCargaExpedientesJSON)': '3f4ea36c-454a-49bc-98f2-adabca60e3cd',
  'E2E_ListaExpedientes (cr435_E2E_ListaExpedientes)': '4a4bb3ae-f9ff-4597-a15e-5d6c5b061db3',
  'E2E_BibliotecaCargaJSONFallidos (cr435_E2E_BibliotecaCargaJSONFallidos)': '/cargaJSON_fallidos',
  'E2E_BibliotecaCargaJSONProcesados (cr435_E2E_BibliotecaCargaJSONProcesados)': '/cargaJSON_procesados',
  'E2E_BibliotecaCargaJSON_Logs (cr435_E2E_BibliotecaCargaJSON_Logs)': '/cargaJSON_log',
};

const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const sort = value => Array.isArray(value) ? value.map(sort)
  : (value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])]))
    : value);
const definitionHash = definition => hash(JSON.stringify(sort(definition)));

function readJson(file, expected) {
  const definition = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(definitionHash(definition), expected, 'the definition of ' + path.basename(file) + ' is not the reviewed one');
  return definition;
}

function prepare(live = readJson(LIVE_PATH, LIVE_HASH), source = readJson(SOURCE_PATH, SOURCE_HASH)) {
  const candidate = structuredClone(source);
  for (const [name, value] of Object.entries(PROD_PARAMS)) {
    if (candidate.parameters[name]) candidate.parameters[name].defaultValue = value;
  }
  let removed = 0;
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.inputs && node.inputs.authentication) { delete node.inputs.authentication; removed += 1; }
    for (const key of Object.keys(node)) walk(node[key]);
  })(candidate);
  const liveTrigger = Object.keys(live.triggers || {})[0];
  const candidateTrigger = Object.keys(candidate.triggers || {})[0];
  const liveSchema = live.triggers?.[liveTrigger]?.inputs?.schema?.properties;
  const candidateSchema = candidate.triggers?.[candidateTrigger]?.inputs?.schema?.properties;
  if (liveSchema && candidateSchema) {
    for (const key of Object.keys(liveSchema)) {
      if (!(key in candidateSchema)) candidateSchema[key] = liveSchema[key];
    }
  }
  return { definition: candidate, removedAuthenticationBlocks: removed };
}

const LOOP = '$.actions.Try_-_Procesar_ExpedientesJSON.actions.Existe_ExpedienteJSON.actions.Comprobar_que_hay_RolesUsuario.actions.Por_cada_RolUsuario_Eliminar.actions.';
const ALLOWED = [
  LOOP + phase.BUSCAR,
  LOOP + phase.COPIA,
];

function compare(live, candidate) {
  const changed = phase.diffPaths(live, candidate.definition);
  for (const changedPath of changed) {
    const isAllowed = ALLOWED.some(prefix => changedPath === prefix || changedPath.startsWith(prefix + '.'));
    assert.ok(isAllowed, 'unexpected changed path against the definition of PROD: ' + changedPath);
  }
  assert.ok(changed.length > 0, 'the candidate of PROD does not change anything');
  return {
    changedPaths: changed,
    changedPathCount: changed.length,
    liveDefinitionSha256: definitionHash(live),
    candidateDefinitionSha256: definitionHash(candidate.definition),
  };
}

function validateDestination(destination, exclusive = true) {
  const resolved = path.resolve(destination);
  const relative = path.relative(DIRECTORY, resolved);
  assert.ok(relative && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep),
    'destination must stay inside the ignored candidate subtree');
  if (exclusive) assert.ok(!fs.existsSync(resolved), 'refusing to overwrite existing output');
  return resolved;
}

function writeOutputs() {
  const destinations = OUTPUTS.map(name => validateDestination(path.join(DIRECTORY, name)));
  const live = readJson(LIVE_PATH, LIVE_HASH);
  const candidate = prepare(live);
  const comparison = compare(live, candidate);
  const candidateBytes = JSON.stringify(candidate.definition, null, 2) + '\n';
  const comparisonBytes = JSON.stringify({
    status: 'PREPARED_NOT_APPLIED',
    checkedAt: new Date().toISOString(),
    environment: ENVIRONMENT,
    flow: FLOW,
    livePath: LIVE_PATH,
    liveDefinitionSha256: LIVE_HASH,
    sourcePath: SOURCE_PATH,
    sourceDefinitionSha256: SOURCE_HASH,
    candidateBytes: Buffer.byteLength(candidateBytes),
    candidateSha256: hash(candidateBytes),
    changes: [
      'The logic of the removal of the copies of a role row is carried over the definition that is live in PROD.',
      'The parameters of the environment of PROD, the authentication of the actions and the schema of the trigger are the ones of PROD.',
      'The difference against what is live in PROD is exactly the paths of the phase.',
    ],
    outOfScope: [
      'The parent of PROD is not touched: the ordering guard is not part of this phase.',
      'The deletion of the role rows and the rest of the phase F are not touched: they are already live in PROD.',
      'The membership of the groups is not touched: the flow already adds the members.',
    ],
    comparison,
    runtime: { applied: false, executed: false },
  }, null, 2) + '\n';
  fs.mkdirSync(DIRECTORY, { recursive: true });
  const values = { 'prod-child-ported-definition.json': candidateBytes, 'prod-child-comparison.json': comparisonBytes };
  return destinations.map((file, index) => {
    validateDestination(file);
    const content = values[OUTPUTS[index]];
    fs.writeFileSync(file, content, { flag: 'wx' });
    return { file: path.basename(file), sha256: hash(content) };
  });
}

if (require.main === module) {
  assert.equal(process.argv.length, 2, 'Usage: node prepare-prod-duplicate-removal.cjs (fixed inputs/outputs only)');
  process.stdout.write(JSON.stringify({ localOnly: true, outputs: writeOutputs() }) + '\n');
}

module.exports = { prepare, compare, readJson, definitionHash, writeOutputs, validateDestination,
  LIVE_PATH, LIVE_HASH, SOURCE_PATH, SOURCE_HASH, DIRECTORY, OUTPUTS, ENVIRONMENT, FLOW, PROD_PARAMS, ALLOWED, LOOP };
