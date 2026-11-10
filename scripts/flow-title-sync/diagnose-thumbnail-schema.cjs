#!/usr/bin/env node
'use strict';

// Offline DEV/CERT diagnostic only. No network, deployment, input data or dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const ROOT = path.resolve(__dirname, '../..');
const SOURCE = path.join(ROOT, '.atl/project-title-sync/schema-diagnostic-20261104/readback.json');
const OUTPUT = path.join(ROOT, 'docs/tests/dev-schema-diagnostics-2026-11-04');
const SOURCE_SHA256 = 'b0dec474a25fa8c4f0a1c2d7db74155d0e7705ef6965268485ad204474e72e94';
const TARGET = '{Thumbnail}';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = value => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])]));
}
const json = value => `${JSON.stringify(value, null, 2)}\n`;

function checkShape(schema) {
  assert.ok(object(schema) && schema.type === 'array', 'Expected array schema');
  assert.ok(object(schema.items) && schema.items.type === 'object', 'Expected object items');
  const { properties, required } = schema.items;
  assert.ok(object(properties), 'Expected properties object');
  assert.ok(Array.isArray(required) && required.length > 0, 'Expected required array');
  assert.ok(required.every(key => typeof key === 'string' && key.length > 0), 'Invalid required member');
  assert.equal(new Set(required).size, required.length, 'Duplicate required member');
  assert.ok(required.every(key => Object.hasOwn(properties, key)), 'Required property undefined');
  assert.ok(Object.hasOwn(properties, TARGET) && object(properties[TARGET]), 'Missing Thumbnail definition');
  assert.ok(required.includes('ID') && required.includes('Title'), 'Missing ID/Title requirement');
}

function propose(schema) {
  checkShape(schema);
  assert.equal(schema.items.required.filter(key => key === TARGET).length, 1,
    'Expected exactly one required Thumbnail; already optional inputs are rejected');
  const result = clone(schema);
  result.items.required = result.items.required.filter(key => key !== TARGET);
  return result;
}

// This intentionally supports only this bundle's two-operation RFC 6902 patch.
function applyBoundedPatch(schema, patch) {
  assert.equal(patch.length, 2);
  assert.equal(patch[0].op, 'test');
  assert.equal(patch[0].path, '/items/required');
  assert.deepEqual(schema.items.required, patch[0].value, 'Patch precondition failed');
  assert.equal(patch[1].op, 'replace');
  assert.equal(patch[1].path, '/items/required');
  const result = clone(schema);
  result.items.required = clone(patch[1].value);
  return result;
}

// Required-presence probe ONLY: deliberately not a JSON Schema validator.
function missingRequired(schema, record) {
  assert.ok(object(record), 'Presence probe expects an object');
  return schema.items.required.filter(key => !Object.hasOwn(record, key));
}

function run(sourceBytes) {
  assert.equal(sha256(sourceBytes), SOURCE_SHA256, 'Source differs from reviewed fresh readback; stop for fresh review');
  const source = JSON.parse(sourceBytes.toString('utf8'));
  assert.equal(source.checkedAt, '2026-11-04T22:03:33.759Z');
  assert.equal(source.lastModified, '2026-11-04T18:33:58Z');
  assert.equal(source.state, 'Started');
  assert.equal(source.cliente, "@body('ExpedienteJSON')?['organocontratacion']");
  const observed = source.schema;
  const before = canonical(source);
  const proposed = propose(observed);
  assert.equal(observed.items.required.length, 24);
  assert.equal(proposed.items.required.length, 23);
  const patch = [
    { op: 'test', path: '/items/required', value: clone(observed.items.required) },
    { op: 'replace', path: '/items/required', value: clone(proposed.items.required) }
  ];
  const tests = [];
  function test(name, execute) { execute(); tests.push({ name, status: 'PASS' }); }

  test('Only /items/required differs; property definitions and every other constraint remain equal', () => {
    const restored = clone(proposed);
    restored.items.required = clone(observed.items.required);
    assert.equal(canonical(restored), canonical(observed));
    assert.deepEqual(proposed.items.properties[TARGET], observed.items.properties[TARGET]);
    assert.deepEqual(proposed.items.required, observed.items.required.filter(key => key !== TARGET));
  });
  test('Transformation and patch leave the full source object and bytes immutable', () => {
    assert.deepEqual(applyBoundedPatch(observed, patch), proposed);
    assert.equal(canonical(source), before);
    assert.equal(sha256(sourceBytes), SOURCE_SHA256);
  });
  test('Restoring the original required array exactly reverses the proposal', () => {
    const reverse = [
      { op: 'test', path: '/items/required', value: clone(proposed.items.required) },
      { op: 'replace', path: '/items/required', value: clone(observed.items.required) }
    ];
    assert.equal(canonical(applyBoundedPatch(proposed, reverse)), canonical(observed));
  });
  test('Repeated derivation is deterministic; reapplication fails closed, not silently idempotent', () => {
    assert.deepEqual(propose(observed), proposed);
    assert.throws(() => propose(proposed), /exactly one/);
    assert.throws(() => applyBoundedPatch(proposed, patch), /precondition/);
  });
  test('Wrong root/items/properties/required shapes and duplicate members fail closed', () => {
    for (const mutate of [
      s => { s.type = 'object'; }, s => { s.items = []; },
      s => { s.items.type = 'array'; }, s => { s.items.properties = null; },
      s => { s.items.required = 'ID'; }, s => { s.items.required.push(TARGET); },
      s => { s.items.required.push('ID'); }, s => { s.items.required.push(1); },
      s => { delete s.items.properties[TARGET]; },
      s => { s.items.required = s.items.required.filter(key => key !== TARGET); },
      s => { s.items.required = s.items.required.filter(key => key !== 'ID'); }
    ]) {
      const invalid = clone(observed); mutate(invalid);
      assert.throws(() => propose(invalid));
    }
  });
  // Synthetic names and primitive placeholders only; never real business records.
  const minimal = Object.fromEntries(proposed.items.required.map(key => [key, null]));
  test('Synthetic record without Thumbnail fails observed presence and passes proposed presence', () => {
    assert.deepEqual(missingRequired(observed, minimal), [TARGET]);
    assert.deepEqual(missingRequired(proposed, minimal), []);
    assert.deepEqual(missingRequired(observed, { ...minimal, [TARGET]: {} }), []);
  });
  test('Every other required member, including ID and Title, remains required', () => {
    for (const key of proposed.items.required) {
      const absent = { ...minimal }; delete absent[key];
      assert.deepEqual(missingRequired(proposed, absent), [key]);
    }
    assert.deepEqual(proposed.items.properties.ID, observed.items.properties.ID);
    assert.deepEqual(proposed.items.properties.Title, observed.items.properties.Title);
  });
  test('Presence probe is not type validation or full JSON Schema proof', () => {
    assert.deepEqual(missingRequired(proposed, { ...minimal, ID: 'not-an-integer' }), []);
    assert.equal(proposed.items.properties.ID.type, 'integer');
    assert.equal(proposed.items.properties.Title.type, 'string');
    assert.equal(proposed.items.properties[TARGET].type, 'object');
  });
  const receipt = {
    status: 'NOT APPLIED', artifactType: 'NOT DEPLOYABLE FLOW', scope: 'DEV/CERT ONLY; PRO EXCLUDED',
    source: { checkedAt: source.checkedAt, lastModified: source.lastModified, state: source.state,
      sha256: sha256(sourceBytes), schemaCanonicalSha256: sha256(canonical(observed)),
      correctedClienteExpressionPresent: true },
    proposedSchemaCanonicalSha256: sha256(canonical(proposed)),
    patchCanonicalSha256: sha256(canonical(patch)),
    originalRequiredCount: 24, proposedRequiredCount: 23,
    checks: { onlyRequiredArrayChanged: true, thumbnailDefinitionRetained: true,
      inputImmutable: true, reversible: true, repeatDerivationDeterministic: true,
      repeatedApplicationRejected: true, fullJsonSchemaValidation: false,
      cloudWritePerformed: false, runtimeRetestPerformed: false },
    tests
  };
  return { observed, proposed, patch, receipt };
}

function main() {
  const args = process.argv.slice(2);
  assert.ok(args.length === 0 || (args.length === 1 && args[0] === '--write'),
    'Usage: node scripts/flow-title-sync/diagnose-thumbnail-schema.cjs [--write]');
  const sourceBytes = fs.readFileSync(SOURCE);
  const result = run(sourceBytes);
  assert.deepEqual(fs.readFileSync(SOURCE), sourceBytes, 'Input file changed during diagnosis');
  if (args[0] === '--write') {
    // Fixed output directory, with existing symlink/junction destinations rejected.
    for (let current = OUTPUT; current !== ROOT; current = path.dirname(current)) {
      if (fs.existsSync(current)) assert.ok(!fs.lstatSync(current).isSymbolicLink(), 'Refusing linked output path');
    }
    fs.mkdirSync(OUTPUT, { recursive: true });
    for (const [name, value] of Object.entries({
      'observed-schema.json': result.observed, 'proposed-schema.json': result.proposed,
      'required-thumbnail.patch.json': result.patch, 'diagnostic.json': result.receipt
    })) {
      const destination = path.join(OUTPUT, name);
      if (fs.existsSync(destination)) assert.ok(!fs.lstatSync(destination).isSymbolicLink(), 'Refusing linked output file');
      fs.writeFileSync(destination, json(value));
    }
  }
  process.stdout.write(`${result.receipt.tests.length} offline assertion groups PASS; NOT APPLIED; NOT DEPLOYABLE FLOW\n`);
  process.stdout.write(args[0] === '--write' ? 'Wrote bounded diagnostic artifacts.\n' : 'Read-only run; no files written.\n');
}

if (require.main === module) {
  try { main(); } catch (error) {
    process.stderr.write(`Diagnostic stopped: ${error.message}\n`);
    process.exitCode = 1;
  }
}
