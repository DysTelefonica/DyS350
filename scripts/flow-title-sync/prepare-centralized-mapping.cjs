'use strict';
// Offline candidate preparation only: no authentication, cloud client, upload or deployment.
// Builds the sixth phase on top of the published exact exporter schema (B9B70E5D):
//
// The mapping of the fields of an expediente lives in one table, and the generator builds the five
// writes of the flow from it. Before this phase the mapping was written by hand in seven places, and
// two of them already derived the same field in two different ways. Now the table is the source of
// truth: a field that changes changes in the table, and the destinations cannot drift apart.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { dependencyCycles } = require('./prepare-role-scoped-delete.cjs');

const TABLE = require('./mapping-table.json');

const BASE_PATH = path.resolve(__dirname, '../../.atl/project-title-sync/exact-exporter-schema-20261115/candidate-definition.json');
const BASE_DEFINITION_HASH = 'B9B70E5D38E20C954CB552BCA8B57497208C819C47078232DC1D03FFF1855EE8';
const DIRECTORY = path.resolve(__dirname, '../../.atl/project-title-sync/centralized-mapping-20261115');
const OUTPUTS = ['candidate-definition.json', 'candidate-comparison.json'];

const TRY = 'Try_-_Procesar_ExpedientesJSON';

// The writes of the flow and the group of the table each one belongs to.
const DESTINATIONS = [
  { action: 'Crear_Expediente_Sharepoint_2', group: 'staging-create', path: `actions.${TRY}.actions.Existe_ExpedienteJSON.else.actions.Tiene_ExpedientePadre.actions.Expediente_con_Padre_en_el_sistema.actions.Crear_Expediente_Sharepoint_2` },
  { action: 'Crear_Expediente_Sharepoint', group: 'staging-create', path: `actions.${TRY}.actions.Existe_ExpedienteJSON.else.actions.Tiene_ExpedientePadre.else.actions.Crear_Expediente_Sharepoint` },
  { action: 'Actualizar_ExpedienteJSON', group: 'staging-patch', path: `actions.${TRY}.actions.Existe_ExpedienteJSON.actions.Actualizar_ExpedienteJSON` },
  { action: 'Actualizar_Expediente_Sistema', group: 'application-patch', path: `actions.${TRY}.actions.Existe_ExpedienteJSON.actions.Expediente_ya_Aprovisionado.actions.Actualizar_Expediente_Sistema` },
  { action: 'Crear_Expediente_-_Dataverse_2', group: 'dataverse-create', path: `actions.${TRY}.actions.Existe_ExpedienteJSON.else.actions.Tiene_ExpedientePadre.actions.Expediente_con_Padre_en_el_sistema.actions.Crear_Expediente_-_Dataverse_2` },
  { action: 'Crear_Expediente_-_Dataverse', group: 'dataverse-create', path: `actions.${TRY}.actions.Existe_ExpedienteJSON.else.actions.Tiene_ExpedientePadre.else.actions.Crear_Expediente_-_Dataverse` },
  { action: 'Actualizar_Expediente_-_Dataverse', group: 'dataverse-patch', path: `actions.${TRY}.actions.Existe_ExpedienteJSON.actions.Existe_Expediente_en_DataVerse.actions.Actualizar_Expediente_-_Dataverse` },
];

// The source of a field, written once. The plain read is derived from the key of the JSON; the
// derived ones are the rules of the mapping, taken verbatim from the table so that they cannot be
// mistyped.
const SOURCES = {
  json: key => `@body('ExpedienteJSON')?['${key}']`,
};

const sort = value => Array.isArray(value)
  ? value.map(sort)
  : (value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])]))
    : value);
const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const definitionHash = definition => hash(JSON.stringify(sort(definition)));

const get = (root, key) => key.split('.').reduce((node, part) => node?.[part], root);

function readBase(basePath = BASE_PATH) {
  const bytes = fs.readFileSync(basePath);
  const definition = JSON.parse(bytes.toString('utf8'));
  assert.equal(definitionHash(definition), BASE_DEFINITION_HASH, 'the base is not the published exact exporter schema');
  return { definition };
}

// The expression of a source of the table.
function expressionOf(source) {
  const separator = source.indexOf(':');
  if (separator === -1) {
    const expression = TABLE.sources[source];
    assert.ok(expression, `the table uses the unknown source ${source}`);
    return expression;
  }
  const name = source.slice(0, separator);
  const argument = source.slice(separator + 1);
  const rule = SOURCES[name];
  assert.ok(rule, `the table uses the unknown source ${source}`);
  return rule(argument);
}

// The map of a group: the columns it writes and the expression of each one.
function buildGroup(group) {
  const map = {};
  for (const field of TABLE.fields) {
    const columns = field.columns[group];
    if (!columns) continue;
    const expression = expressionOf(field.source);
    for (const column of columns) map[`item/${column}`] = expression;
  }
  return map;
}

function prepare(base) {
  const result = JSON.parse(JSON.stringify(base));
  const rebuilt = new Map();
  for (const destination of DESTINATIONS) {
    const action = get(result.definition, destination.path);
    assert.ok(action, `the action ${destination.action} is not in the definition`);
    const parameters = action.inputs.parameters;
    const published = Object.fromEntries(Object.entries(parameters).filter(([key]) => key.startsWith('item/')));
    const table = buildGroup(destination.group);
    assert.deepEqual(
      Object.keys(table).sort(),
      Object.keys(published).sort(),
      `the table and the published action ${destination.action} do not write the same columns`,
    );
    for (const [key, expression] of Object.entries(table)) parameters[key] = expression;
    rebuilt.set(destination.action, { group: destination.group, published, table });
  }
  return { result, rebuilt };
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
  const allowed = [];
  for (const destination of DESTINATIONS) {
    allowed.push(`$.${destination.path}.inputs.parameters`);
  }
  for (const path of changed) {
    assert.ok(allowed.some((prefix) => path.startsWith(prefix)), `unexpected changed path: ${path}`);
  }
  const cycles = dependencyCycles(candidate.definition);
  assert.deepEqual(cycles, [], `the candidate must not close a dependency cycle: ${cycles.join(' | ')}`);
  return {
    changedPaths: changed,
    changedPathCount: changed.length,
    sourceDefinitionSha256: definitionHash(base.definition),
    candidateDefinitionSha256: definitionHash(candidate.definition),
    fieldsInTheTable: TABLE.fields.length,
    destinationsBuiltFromTheTable: DESTINATIONS.length,
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
  if (exclusive) assert.ok(!fs.existsSync(resolved), 'refusing to overwrite an existing output');
}

function writeOutputs(destination = DIRECTORY) {
  for (const name of OUTPUTS) validateDestination(path.join(destination, name));
  const base = readBase();
  const { result, rebuilt } = prepare(base);
  const comparison = compare(base, result);
  comparison.rebuiltFromTheTable = [...rebuilt].map(([action, entry]) => ({
    action,
    group: entry.group,
    columns: Object.keys(entry.table).length,
  }));
  fs.mkdirSync(DIRECTORY, { recursive: true });
  fs.writeFileSync(path.join(DIRECTORY, 'candidate-definition.json'), `${JSON.stringify(result.definition)}\n`);
  fs.writeFileSync(path.join(DIRECTORY, 'candidate-comparison.json'), `${JSON.stringify(comparison, null, 2)}\n`);
  return comparison;
}

if (require.main === module) {
  const comparison = writeOutputs();
  console.log(JSON.stringify({ localOnly: true, outputs: OUTPUTS, changedPathCount: comparison.changedPathCount, candidateDefinitionSha256: comparison.candidateDefinitionSha256 }, null, 2));
}

module.exports = {
  BASE_PATH, BASE_DEFINITION_HASH, DIRECTORY, OUTPUTS, DESTINATIONS, SOURCES, TABLE,
  prepare, compare, readBase, diffPaths, definitionHash, validateDestination, writeOutputs,
  dependencyCycles, buildGroup, expressionOf,
};
