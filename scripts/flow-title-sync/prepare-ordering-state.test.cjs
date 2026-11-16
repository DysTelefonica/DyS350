'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const generator = require('./prepare-ordering-state.cjs');

const { BASE_HASH, SCOPE, READ_INSTANT, KEY_INSTANT, STATE_COLUMN, WRITES } = generator;
const base = generator.readBase();
const candidate = generator.prepare(base);

test('the base is the published child of DEV/CERT', () => {
  assert.equal(generator.definitionHash(base.definition), BASE_HASH);
});

test('the trigger carries the generation time of the file, and it is not required', () => {
  const properties = candidate.definition.triggers.manual.inputs.schema.properties;
  assert.ok(properties.file_6, 'the trigger does not carry the generation time of the file');
  assert.equal(properties.file_6.contentBytes.type, 'string');
  assert.ok(!candidate.definition.triggers.manual.inputs.schema.required.includes('file_6'),
    'the generation time is not required: a call that does not carry it still works');
});

test('the key of the instant is a number that sorts the way the time does', () => {
  const key = generator.get(candidate.definition, `${SCOPE}.${KEY_INSTANT}`).inputs;
  assert.ok(key.startsWith('@int(concat('), 'the key is a number');
  assert.equal((key.match(/substring\(/g) || []).length, 6, 'the key is the six parts of the instant');
  assert.ok(!key.includes('tick('), 'the platform is not asked to compare dates');
});

test('the three writes of the staging row carry the state', () => {
  assert.equal(WRITES.length, 3, 'the write of the patch and the two creations are the writes of the row');
  for (const path of WRITES) {
    const write = generator.get(candidate.definition, path);
    assert.ok(write, `the write ${path} is not in the definition`);
    assert.ok(write.inputs.parameters[`item/${STATE_COLUMN}`], `the write ${path} does not write the state`);
    assert.ok(write.inputs.parameters[`item/${STATE_COLUMN}`].includes(KEY_INSTANT), 'the state is not the key of the file');
  }
});

test('the candidate closes no dependency cycle and touches nothing else', () => {
  assert.deepEqual(generator.dependencyCycles(candidate.definition), []);
  const changed = generator.diffPaths(base.definition, candidate.definition);
  assert.ok(changed.length <= 7, `the candidate changes ${changed.length} paths: ${changed.join(' | ')}`);
  assert.ok(changed.some(path => path.includes('file_6')), 'the trigger does not change');
  assert.ok(changed.some(path => path.includes(KEY_INSTANT)), 'the key is not computed');
  assert.ok(changed.some(path => path.includes(`item/${STATE_COLUMN}`)), 'the state is not written');
});

test('a source that is not the reviewed child is rejected', () => {
  const tampered = JSON.parse(JSON.stringify(base.definition));
  tampered.actions['INI_ContadorNuevos'] = { type: 'InitializeVariable', inputs: { name: 'x' } };
  const file = path.join(fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'state-')), 'definition.json');
  fs.writeFileSync(file, JSON.stringify(tampered));
  assert.throws(() => generator.readBase(file), /the base is not the published child of DEV\/CERT/);
});
