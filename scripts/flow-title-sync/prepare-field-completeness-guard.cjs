'use strict';
// Offline candidate preparation only: no authentication, cloud client, upload or deployment.
// Builds the completeness guard of the JSON fields on top of the applied phase 3 candidate.
//
// The Parse JSON action of the child flow declares the fifty keys the exporter sends, but it
// declares them under a `content` property that the payload does not have: the parsed object is
// the expediente itself and the flow reads it at the root (`body('ExpedienteJSON')?['titulo']`).
// The consequence is that nothing is required, so a JSON that arrives incomplete is parsed
// anyway and the patch writes null over the fields it does not carry.
//
// The candidate requires the fifty keys at the root of the schema and declares them there as
// any type, so a JSON without one of them fails the parse, the flow fails closed and no field is
// written over an existing value.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { dependencyCycles } = require('./prepare-role-scoped-delete.cjs');

const BASE_PATH = path.resolve(__dirname, '../../.atl/project-title-sync/child-table-reconciliation-20261111/candidate-definition.json');
const BASE_DEFINITION_HASH = 'FDBC92DE821EA8A43530851B7AA167ACAA98459D60DCEDD14D1B86DD3C63F811';
const DIRECTORY = path.resolve(__dirname, '../../.atl/project-title-sync/field-completeness-guard-20261114');
const OUTPUTS = ['candidate-definition.json', 'candidate-comparison.json'];

const TRY = 'Try_-_Procesar_ExpedientesJSON';
const PARSE = 'ExpedienteJSON';
const SCHEMA_PATH = `actions.${TRY}.actions.${PARSE}.inputs.schema`;
const DECLARED_UNDER = 'content';

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
  assert.equal(definitionHash(definition), BASE_DEFINITION_HASH, 'the base is not the reviewed phase 3 candidate');
  return { definition };
}

// The keys the schema declares for the expediente. They are taken from the schema itself, so the
// guard cannot drift from the exporter the schema was written for.
function declaredKeys(definition) {
  const schema = get(definition, SCHEMA_PATH);
  assert.ok(schema, 'the Parse JSON action has no schema');
  const declared = schema.properties?.[DECLARED_UNDER]?.properties;
  assert.ok(declared, `the schema does not declare the keys under ${DECLARED_UNDER}`);
  const keys = Object.keys(declared);
  assert.equal(keys.length, 50, 'the schema does not declare the fifty keys of the exporter');
  return keys;
}

function prepare(base) {
  const result = JSON.parse(JSON.stringify(base));
  const schema = get(result.definition, SCHEMA_PATH);
  const keys = declaredKeys(result.definition);
  // The keys at the root are declared as any type: the guard checks the presence, not the value,
  // because a null is a legitimate value for the twelve fields the exporter leaves empty.
  schema.properties = { ...schema.properties, ...Object.fromEntries(keys.map(key => [key, {}])) };
  schema.required = keys;
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
  const keys = declaredKeys(base.definition);
  const allowed = [`$.${SCHEMA_PATH}.required`];
  for (const key of keys) allowed.push(`$.${SCHEMA_PATH}.properties.${key}`);
  for (const changedPath of changed) {
    assert.ok(allowed.includes(changedPath), `unexpected changed path: ${changedPath}`);
  }
  assert.equal(changed.length, keys.length + 1, 'the candidate must add the required list and the root declarations');
  const schema = get(candidate.definition, SCHEMA_PATH);
  assert.deepEqual(schema.required, keys, 'the candidate must require the fifty keys of the schema');
  for (const key of keys) {
    assert.deepEqual(schema.properties[key], {}, `the root declaration of ${key} must not constrain the value`);
  }
  const cycles = dependencyCycles(candidate.definition);
  assert.deepEqual(cycles, [], `the candidate must not close a dependency cycle: ${cycles.join(' | ')}`);
  return {
    changedPaths: changed,
    changedPathCount: changed.length,
    sourceDefinitionSha256: definitionHash(base.definition),
    candidateDefinitionSha256: definitionHash(candidate.definition),
    requiredKeys: keys.length,
    aPartialJsonIsRejected: true,
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
  const candidate = prepare(base);
  const comparison = compare(base, candidate);
  fs.mkdirSync(DIRECTORY, { recursive: true });
  fs.writeFileSync(path.join(DIRECTORY, 'candidate-definition.json'), `${JSON.stringify(candidate.definition)}\n`);
  fs.writeFileSync(path.join(DIRECTORY, 'candidate-comparison.json'), `${JSON.stringify(comparison, null, 2)}\n`);
  return comparison;
}

if (require.main === module) {
  const comparison = writeOutputs();
  console.log(JSON.stringify({ localOnly: true, outputs: OUTPUTS, changedPathCount: comparison.changedPathCount, candidateDefinitionSha256: comparison.candidateDefinitionSha256 }, null, 2));
}

module.exports = { BASE_PATH, BASE_DEFINITION_HASH, DIRECTORY, OUTPUTS, SCHEMA_PATH, prepare, compare, readBase, declaredKeys, diffPaths, definitionHash, validateDestination, writeOutputs, dependencyCycles };
