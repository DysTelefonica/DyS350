'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { BASE, BASE_SHA256, OUT, TARGET, build, write } = require('./prepare-rf13-update-fixture.cjs');

test('the base is the payload of the case of RF08 and the generator refuses any other one', () => {
  const bytes = fs.readFileSync(BASE);
  const { receipt } = build(bytes);
  assert.equal(receipt.baseSha256, BASE_SHA256);
  assert.equal(receipt.baseBytes, 11130);
  const tampered = Buffer.from(`${bytes.toString('utf8')} `, 'utf8');
  assert.throws(() => build(tampered), /the base is not the payload of RF08/);
});

test('the case changes the two fields of the root expediente and nothing else', () => {
  const base = JSON.parse(fs.readFileSync(BASE, 'utf8'));
  const { out, receipt } = build();
  const payload = JSON.parse(out.toString('utf8'));
  const before = base.data.find(r => r.idexpediente === TARGET);
  const after = payload.data.find(r => r.idexpediente === TARGET);
  assert.notEqual(after.observaciones, before.observaciones);
  assert.equal(after.importecontratacion, 555555.55);
  assert.equal(receipt.changed.length, 2);
  assert.deepEqual(receipt.untouchedSiblingIds, [900611802, 900611803]);
  const others = payload.data.filter(r => r.idexpediente !== TARGET);
  assert.deepEqual(others, base.data.filter(r => r.idexpediente !== TARGET), 'the controls travel untouched');
});

test('the output goes to the ignored directory of the phase and is written once', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rf13-')), 'case.json');
  const receipt = write(file);
  assert.ok(fs.existsSync(file));
  assert.equal(receipt.outputBytes, fs.statSync(file).size);
  assert.ok(OUT.includes(`${path.sep}.atl${path.sep}`), 'the default output stays inside the ignored subtree');
});
