'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { readBase, dropResponsible, DROPPED_EMAIL } = require('./prepare-rf05-drop-role-fixture.cjs');

const base = readBase();
const { payload, kept } = dropResponsible(base);

test('the base payload is the RF04b update case of the controlled leaf', () => {
  assert.equal(base.data.length, 1);
  assert.equal(base.data[0].idexpediente, 900611603);
});

test('the case drops exactly the engineering responsible', () => {
  assert.ok(!kept.includes(DROPPED_EMAIL));
  assert.equal(payload.data[0].responsables.length, base.data[0].responsables.length - 1);
});

test('the responsible list stays valid, so the deletion is not the fail closed case', () => {
  const valid = payload.data[0].responsables.filter(entry => entry.correousuario);
  assert.ok(valid.length >= 1);
  assert.equal(payload.data[0].responsableCalidad.correousuario, base.data[0].responsableCalidad.correousuario);
  assert.equal(payload.data[0].responsableSeguridad.correousuario, base.data[0].responsableSeguridad.correousuario);
});

test('the identifiers, the title and the dates of the base are untouched', () => {
  assert.equal(payload.data[0].idexpediente, base.data[0].idexpediente);
  assert.equal(payload.data[0].titulo, base.data[0].titulo);
  assert.equal(payload.data[0].fechaoferta, base.data[0].fechaoferta);
  assert.deepEqual(payload.data[0].suministradores, base.data[0].suministradores);
  assert.deepEqual(payload.data[0].hitos, base.data[0].hitos);
});
