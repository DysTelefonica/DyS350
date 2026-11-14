'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  prepare, compare, readBase, declaredKeys, definitionHash, dependencyCycles, validateDestination,
  BASE_DEFINITION_HASH, DIRECTORY, SCHEMA_PATH, OUTPUTS,
} = require('./prepare-field-completeness-guard.cjs');

const base = readBase();
const candidate = prepare(base);
const get = (root, key) => key.split('.').reduce((node, part) => node?.[part], root);

test('the pinned source is the applied phase 3 candidate', () => {
  assert.equal(definitionHash(base.definition), BASE_DEFINITION_HASH);
});

test('the candidate does not close a dependency cycle', () => {
  assert.deepEqual(dependencyCycles(candidate.definition), []);
});

test('the fifty keys of the exporter are required at the root of the schema', () => {
  const keys = declaredKeys(base.definition);
  assert.equal(keys.length, 50);
  const schema = get(candidate.definition, SCHEMA_PATH);
  assert.deepEqual(schema.required, keys);
  assert.ok(schema.required.includes('idexpediente'));
  assert.ok(schema.required.includes('titulo'));
  assert.ok(schema.required.includes('hitos'));
});

test('the root declarations check the presence and not the value', () => {
  const keys = declaredKeys(base.definition);
  const schema = get(candidate.definition, SCHEMA_PATH);
  for (const key of keys) {
    assert.deepEqual(schema.properties[key], {}, `the declaration of ${key} must not constrain the value`);
  }
  assert.deepEqual(schema.properties.content.properties[keys[0]], { type: 'integer' }, 'the nested declaration of the schema is preserved');
});

test('nothing else of the flow is touched', () => {
  const comparison = compare(base, candidate);
  const keys = declaredKeys(base.definition);
  assert.equal(comparison.changedPathCount, keys.length + 1);
  assert.equal(comparison.sourceDefinitionSha256, BASE_DEFINITION_HASH);
  assert.ok(comparison.changedPaths.includes(`$.${SCHEMA_PATH}.required`));
  const parse = get(candidate.definition, 'actions.Try_-_Procesar_ExpedientesJSON.actions.ExpedienteJSON');
  assert.equal(parse.type, 'ParseJson');
  assert.ok(parse.inputs.content.includes('body/file/contentBytes'), 'the parse still reads the file of the trigger');
  assert.ok(candidate.definition.actions['INI_RolesUsuarioDeseados'], 'the reconciliation of the roles is preserved');
});

test('a source that is not the reviewed candidate is rejected', () => {
  const tampered = JSON.parse(JSON.stringify(base.definition));
  tampered.actions['INI_ContadorNuevos'] = { type: 'InitializeVariable', inputs: { name: 'x' } };
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fidelity-')), 'candidate-definition.json');
  fs.writeFileSync(file, JSON.stringify(tampered));
  assert.throws(() => readBase(file), /the base is not the reviewed phase 3 candidate/);
});

test('the outputs stay inside the ignored subtree', () => {
  assert.ok(DIRECTORY.includes(`${path.sep}.atl${path.sep}`), 'the candidate subtree is ignored by git');
  for (const name of OUTPUTS) validateDestination(path.join(DIRECTORY, name), false);
  assert.throws(() => validateDestination(path.join(os.tmpdir(), 'candidate-definition.json'), false), /destination must stay inside/);
  const existing = path.join(DIRECTORY, 'candidate-definition.json');
  fs.mkdirSync(DIRECTORY, { recursive: true });
  fs.writeFileSync(existing, 'x');
  assert.throws(() => validateDestination(existing), /refusing to overwrite an existing output/);
  fs.rmSync(existing);
});
