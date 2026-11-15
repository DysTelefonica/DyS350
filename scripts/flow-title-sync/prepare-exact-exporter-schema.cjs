'use strict';
// Offline candidate preparation only: no authentication, cloud client, upload or deployment.
// Builds the fifth phase on top of the published roles by name and unknown fields (7E52849F):
//
// The schema of the parse declares exactly the fifty keys of the exporter. The two leftovers of the
// older nested shape are removed, so a JSON that carries one of them is rejected like any other key
// the flow does not know, instead of being accepted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { dependencyCycles } = require('./prepare-role-scoped-delete.cjs');

const BASE_PATH = path.resolve(__dirname, '../../.atl/project-title-sync/catalog-roles-and-unknown-fields-20261115/candidate-definition.json');
const BASE_DEFINITION_HASH = '7E52849F87E08FF8DE252C8F865841607E0B4002430F3BB2397E138246E6AE04';
const DIRECTORY = path.resolve(__dirname, '../../.atl/project-title-sync/exact-exporter-schema-20261115');
const OUTPUTS = ['candidate-definition.json', 'candidate-comparison.json'];

const TRY = 'Try_-_Procesar_ExpedientesJSON';
const PARSE = 'ExpedienteJSON';
const SCHEMA_PATH = `actions.${TRY}.actions.${PARSE}.inputs.schema`;

// The two properties of the older nested shape. They are not keys of the exporter, so a JSON that
// carries one of them was accepted by the schema of the previous phase.
const LEGACY_KEYS = ['content', 'schema'];

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
  assert.equal(definitionHash(definition), BASE_DEFINITION_HASH, 'the base is not the published candidate of the roles by name');
  return { definition };
}

function prepare(base) {
  const result = JSON.parse(JSON.stringify(base));
  const schema = get(result.definition, SCHEMA_PATH);
  const keys = Object.keys(schema.properties).filter(key => !LEGACY_KEYS.includes(key));
  assert.equal(keys.length, 50, 'the fifty keys of the exporter are the ones the schema declares');
  assert.deepEqual([...schema.required].sort(), [...keys].sort(), 'the required keys and the declared keys are the same fifty');
  for (const key of LEGACY_KEYS) {
    assert.ok(schema.properties[key], `the legacy property ${key} is still declared`);
    delete schema.properties[key];
  }
  assert.equal(schema.additionalProperties, false, 'the schema must not accept an unknown key');
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
  const allowed = LEGACY_KEYS.map(key => `$.${SCHEMA_PATH}.properties.${key}`);
  for (const path of changed) {
    assert.ok(allowed.includes(path), `unexpected changed path: ${path}`);
  }
  const schema = get(candidate.definition, SCHEMA_PATH);
  assert.equal(Object.keys(schema.properties).length, 50, 'the schema declares exactly the fifty keys');
  assert.equal(schema.required.length, 50, 'the fifty keys stay required');
  assert.equal(schema.additionalProperties, false);
  const cycles = dependencyCycles(candidate.definition);
  assert.deepEqual(cycles, [], `the candidate must not close a dependency cycle: ${cycles.join(' | ')}`);
  return {
    changedPaths: changed,
    changedPathCount: changed.length,
    sourceDefinitionSha256: definitionHash(base.definition),
    candidateDefinitionSha256: definitionHash(candidate.definition),
    schemaDeclaresTheFiftyKeys: true,
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

module.exports = {
  BASE_PATH, BASE_DEFINITION_HASH, DIRECTORY, OUTPUTS, SCHEMA_PATH, LEGACY_KEYS,
  prepare, compare, readBase, diffPaths, definitionHash, validateDestination, writeOutputs, dependencyCycles,
};
