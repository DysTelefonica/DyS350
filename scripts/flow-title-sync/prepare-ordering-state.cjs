'use strict';
// Offline candidate preparation only: no authentication, cloud client, upload or deployment.
// Builds the part of the phase E that belongs to the child flow of DEV/CERT (062C26A1...):
//
// The child writes the state of the ordering guard: the key of the generation time of the last
// JSON applied to the expediente, in the column ClaveGeneracionJSON of its staging row.
//
// The child is the one that writes it because the connection of the parent cannot write a field
// of an item: the definition of the operations of its connection does not know the columns of
// the list, so the platform refuses the parameter. The connection of the child is the one of the
// trigger, and it knows the list.
//
// The generation time of the file travels in a new input of the trigger, file_6, that the parent
// fills with the envelope of the file. The input is not required, so a call that does not carry it
// (the application) still works: the key of the empty instant is zero and the file is applied.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { dependencyCycles } = require('./prepare-role-scoped-delete.cjs');

const DIRECTORY = path.resolve(__dirname, '../../.atl/project-title-sync/ordering-guard-20261116');
const BASE_PATH = path.join(DIRECTORY, '1ca49582-ae1e-f111-8342-6045bde02c54.definition.json');
const BASE_HASH = '062C26A11FAB4AA8B0E44441C13E739F28EBD28FD072BCCD0AB5E904BF6856BD';
const OUTPUTS = ['child-definition.json', 'child-comparison.json'];

// The scope of the child that processes one expediente.
const SCOPE = 'actions.Try_-_Procesar_ExpedientesJSON.actions';
// The names of the actions of this phase.
const READ_INSTANT = 'Leer_la_Fecha_de_Generacion';
const KEY_INSTANT = 'Calcular_la_clave_de_Generacion';
const STATE_COLUMN = 'ClaveGeneracionJSON';
const EMPTY_INSTANT = '0000-00-00T00:00:00.000Z';
const INSTANT_PARTS = [[0, 4], [5, 2], [8, 2], [11, 2], [14, 2], [17, 2]];

// The writes of the staging row: the patch of an expediente that exists and the two creations.
const WRITES = [
  `${SCOPE}.Existe_ExpedienteJSON.actions.Actualizar_ExpedienteJSON`,
  `${SCOPE}.Existe_ExpedienteJSON.else.actions.Tiene_ExpedientePadre.actions.Expediente_con_Padre_en_el_sistema.actions.Crear_Expediente_Sharepoint_2`,
  `${SCOPE}.Existe_ExpedienteJSON.else.actions.Tiene_ExpedientePadre.else.actions.Crear_Expediente_Sharepoint`,
];

const sort = value => Array.isArray(value)
  ? value.map(sort)
  : (value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])]))
    : value);
const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const definitionHash = definition => hash(JSON.stringify(sort(definition)));
const get = (root, key) => key.split('.').reduce((node, part) => node?.[part], root);

function readBase(basePath = BASE_PATH) {
  const definition = JSON.parse(fs.readFileSync(basePath, 'utf8'));
  assert.equal(definitionHash(definition), BASE_HASH, 'the base is not the published child of DEV/CERT');
  return { definition };
}

// The key of an instant: its fourteen digits as a number, so the instants sort the way the time
// does without asking the platform to compare dates.
function keyOf(expression) {
  const parts = INSTANT_PARTS.map(([start, length]) => `substring(${expression},${start},${length})`);
  return `int(concat(${parts.join(',')}))`;
}

function prepare(base) {
  const result = JSON.parse(JSON.stringify(base));
  const definition = result.definition;

  // The new input of the trigger: the envelope of the file, with its generation time.
  const properties = definition.triggers.manual.inputs.schema.properties;
  assert.ok(properties.file, 'the trigger of the child does not have the file of the expediente');
  assert.ok(!properties.file_6, 'the input of the generation time already exists');
  properties.file_6 = {
    name: { type: 'string' },
    contentBytes: { type: 'string', format: 'byte' },
  };

  // The instant of the file and its key, before the branch of the expediente.
  const scope = get(definition, SCOPE);
  assert.ok(scope, 'the scope of the ingestion is not in the definition');
  assert.ok(!scope[READ_INSTANT], `the action ${READ_INSTANT} already exists`);
  assert.ok(!scope[KEY_INSTANT], `the action ${KEY_INSTANT} already exists`);
  scope[READ_INSTANT] = {
    runAfter: { ExpedienteJSON: ['Succeeded'] },
    metadata: { operationMetadataId: '00000000-0000-0000-0000-000000000000' },
    type: 'Compose',
    inputs: "@coalesce(string(base64ToString(coalesce(triggerOutputs()?['body/file_6/contentBytes'],''))),'')",
  };
  scope[KEY_INSTANT] = {
    runAfter: { [READ_INSTANT]: ['Succeeded'] },
    metadata: { operationMetadataId: '00000000-0000-0000-0000-000000000000' },
    type: 'Compose',
    inputs: `@${keyOf(`coalesce(body('${READ_INSTANT}'),'${EMPTY_INSTANT}')`)}`,
  };
  // The branch of the expediente writes the state, so the key has to be in its path.
  const branch = get(definition, `${SCOPE}.Existe_ExpedienteJSON`);
  assert.ok(branch, 'the branch of an existing expediente is not in the definition');
  branch.runAfter = { ...branch.runAfter, [KEY_INSTANT]: ['Succeeded'] };

  // The state is written with the three writes of the staging row.
  for (const path of WRITES) {
    const write = get(definition, path);
    assert.ok(write, `the write ${path} is not in the definition`);
    assert.equal(write.type, 'OpenApiConnection', `the write ${path} is not a call to the list`);
    const parameters = write.inputs.parameters;
    assert.ok(parameters['item/Title'], `the write ${path} does not write the title`);
    assert.ok(!parameters[`item/${STATE_COLUMN}`], `the write ${path} already writes the state`);
    parameters[`item/${STATE_COLUMN}`] = `@body('${KEY_INSTANT}')`;
  }

  return result;
}

function diffPaths(a, b, path = '$', out = []) {
  const ta = Array.isArray(a) ? 'array' : (a === null ? 'null' : typeof a);
  const tb = Array.isArray(b) ? 'array' : (b === null ? 'null' : typeof b);
  if (ta !== tb) { out.push(path); return out; }
  if (ta === 'array') {
    if (a.length !== b.length) out.push(path);
    for (let i = 0; i < Math.min(a.length, b.length); i += 1) diffPaths(a[i], b[i], `${path}[${i}]`, out);
    return out;
  }
  if (ta === 'object') {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    for (const key of ka) if (!kb.includes(key)) out.push(`${path}.${key}`);
    for (const key of kb) if (!ka.includes(key)) out.push(`${path}.${key}`);
    for (const key of ka) if (kb.includes(key)) diffPaths(a[key], b[key], `${path}.${key}`, out);
    return out;
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) out.push(path);
  return out;
}

function compare(base, candidate) {
  const changed = diffPaths(base.definition, candidate.definition);
  const cycles = dependencyCycles(candidate.definition);
  assert.deepEqual(cycles, [], `the candidate must not close a dependency cycle: ${cycles.join(' | ')}`);
  return {
    changedPathCount: changed.length,
    changedPaths: changed,
    sourceDefinitionSha256: definitionHash(base.definition),
    candidateDefinitionSha256: definitionHash(candidate.definition),
    stateColumn: STATE_COLUMN,
    writes: WRITES.length,
    keyExpression: get(candidate.definition, `${SCOPE}.${KEY_INSTANT}`).inputs,
  };
}

function validateDestination(destination, exclusive = true) {
  const resolved = path.resolve(destination);
  const relative = path.relative(DIRECTORY, resolved);
  assert.ok(relative && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`),
    'destination must stay inside the ignored candidate subtree');
  if (exclusive) assert.ok(!fs.existsSync(resolved), 'refusing to overwrite an existing output');
}

function writeOutputs(destination = DIRECTORY) {
  for (const name of OUTPUTS) validateDestination(path.join(destination, name));
  const base = readBase();
  const candidate = prepare(base);
  const comparison = compare(base, candidate);
  fs.mkdirSync(DIRECTORY, { recursive: true });
  fs.writeFileSync(path.join(DIRECTORY, 'child-definition.json'), `${JSON.stringify(candidate.definition)}\n`);
  fs.writeFileSync(path.join(DIRECTORY, 'child-comparison.json'), `${JSON.stringify(comparison, null, 2)}\n`);
  return comparison;
}

if (require.main === module) {
  const comparison = writeOutputs();
  console.log(JSON.stringify({
    localOnly: true,
    outputs: OUTPUTS,
    changedPathCount: comparison.changedPathCount,
    writes: comparison.writes,
    candidateDefinitionSha256: comparison.candidateDefinitionSha256,
  }, null, 2));
}

module.exports = {
  BASE_PATH, BASE_HASH, DIRECTORY, OUTPUTS, SCOPE, READ_INSTANT, KEY_INSTANT, STATE_COLUMN, WRITES,
  prepare, compare, readBase, diffPaths, definitionHash, validateDestination, writeOutputs,
  dependencyCycles, keyOf, get,
};
