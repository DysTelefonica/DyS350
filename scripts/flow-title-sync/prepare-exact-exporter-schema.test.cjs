'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  prepare, compare, readBase, definitionHash, dependencyCycles, validateDestination,
  BASE_DEFINITION_HASH, DIRECTORY, OUTPUTS, SCHEMA_PATH, LEGACY_KEYS,
} = require('./prepare-exact-exporter-schema.cjs');

const base = readBase();
const candidate = prepare(base);
const get = (root, key) => key.split('.').reduce((node, part) => node?.[part], root);
const schema = get(candidate.definition, SCHEMA_PATH);
const scope = candidate.definition.actions['Try_-_Procesar_ExpedientesJSON'];

test('the pinned source is the published candidate of the roles by name', () => {
  assert.equal(definitionHash(base.definition), BASE_DEFINITION_HASH);
});

test('the candidate does not close a dependency cycle', () => {
  assert.deepEqual(dependencyCycles(candidate.definition), []);
});

test('the schema declares exactly the fifty keys of the exporter', () => {
  const keys = Object.keys(schema.properties);
  assert.equal(keys.length, 50, 'the schema declares the fifty keys and nothing else');
  assert.deepEqual([...schema.required].sort(), [...keys].sort(), 'the required keys and the declared keys are the same fifty');
  assert.equal(schema.additionalProperties, false, 'the schema must not accept an unknown key');
  for (const key of LEGACY_KEYS) {
    assert.ok(!keys.includes(key), `the legacy property ${key} must not be declared`);
  }
});

test('the base carried the two leftovers of the older nested shape', () => {
  const baseSchema = get(base.definition, SCHEMA_PATH);
  for (const key of LEGACY_KEYS) {
    assert.ok(baseSchema.properties[key], `the base declares ${key}`);
  }
  assert.equal(Object.keys(baseSchema.properties).length, 52);
});

test('nothing else of the flow is touched', () => {
  const comparison = compare(base, candidate);
  assert.equal(comparison.sourceDefinitionSha256, BASE_DEFINITION_HASH);
  assert.equal(comparison.changedPathCount, 2);
  assert.ok(comparison.schemaDeclaresTheFiftyKeys);
  assert.ok(scope.actions['Existe_ExpedienteJSON'], 'the update of an provisioned expediente is preserved');
  assert.ok(scope.actions['Obtener_Roles'], 'the catalog of the roles is preserved');
  assert.ok(candidate.definition.actions['Catch_-_Procesar_ExpedientesJSON'], 'the rejection is still logged');
});

test('a source that is not the reviewed candidate is rejected', () => {
  const tampered = JSON.parse(JSON.stringify(base.definition));
  tampered.actions['INI_ContadorNuevos'] = { type: 'InitializeVariable', inputs: { name: 'x' } };
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'exact-schema-')), 'candidate-definition.json');
  fs.writeFileSync(file, JSON.stringify(tampered));
  assert.throws(() => readBase(file), /the base is not the published candidate of the roles by name/);
});

test('the outputs stay inside the ignored subtree', () => {
  assert.ok(DIRECTORY.includes(`${path.sep}.atl${path.sep}`));
  for (const name of OUTPUTS) validateDestination(path.join(DIRECTORY, name), false);
  assert.throws(() => validateDestination(path.join(os.tmpdir(), 'candidate-definition.json'), false), /destination must stay inside/);
  const existing = path.join(DIRECTORY, 'scratch-exact-schema-check.json');
  fs.mkdirSync(DIRECTORY, { recursive: true });
  fs.writeFileSync(existing, 'x');
  assert.throws(() => validateDestination(existing), /refusing to overwrite an existing output/);
  fs.rmSync(existing);
});
