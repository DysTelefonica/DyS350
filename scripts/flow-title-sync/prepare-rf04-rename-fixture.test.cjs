'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  readBase, renamePayload, emailsOf, RENAMED_NAMES, SUFFIX,
} = require('./prepare-rf04-rename-fixture.cjs');

const base = readBase();
const { payload, renamed } = renamePayload(base);

test('the base payload is the RF04b update case and keeps the controlled leaf', () => {
  assert.equal(base.data.length, 1);
  assert.equal(base.data[0].idexpediente, 900611603);
});

test('the case renames exactly the project lead, the engineering and the quality responsible', () => {
  assert.equal(renamed.length, 3);
  const kinds = renamed.map(entry => entry.kind).sort();
  assert.deepEqual(kinds, ['calidad', 'responsable', 'responsable']);
  for (const entry of renamed) assert.ok(entry.nombre.endsWith(SUFFIX));
});

test('no email changes', () => {
  assert.deepEqual(emailsOf(payload), emailsOf(base));
  for (const entry of renamed) assert.ok(entry.correo.includes('@'));
});

test('the security responsible is the control and is not renamed', () => {
  const security = payload.data[0].responsableSeguridad;
  assert.ok(security && security.nombre);
  assert.ok(!security.nombre.endsWith(SUFFIX));
  assert.ok(!RENAMED_NAMES.includes(security.nombre));
});

test('the identifiers and the scalars of the base are untouched', () => {
  assert.equal(payload.data[0].idexpediente, base.data[0].idexpediente);
  assert.equal(payload.data[0].titulo, base.data[0].titulo);
  assert.equal(payload.data[0].fechaoferta, base.data[0].fechaoferta);
});
