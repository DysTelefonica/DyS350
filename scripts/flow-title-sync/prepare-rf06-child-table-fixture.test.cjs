'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { readBase, changeChildTables, SUPPLIER_NAME, MILESTONE_DATE } = require('./prepare-rf06-child-table-fixture.cjs');

const base = readBase();
const { payload, before, after } = changeChildTables(base);

test('the base payload is the RF05a case of the controlled leaf', () => {
  assert.equal(base.data.length, 1);
  assert.equal(base.data[0].idexpediente, 900611603);
});

test('the supplier name and the milestone date change', () => {
  assert.equal(after.name, SUPPLIER_NAME);
  assert.equal(after.date, MILESTONE_DATE);
  assert.notEqual(before.name, after.name);
  assert.notEqual(before.date, after.date);
});

test('the business keys of both rows are untouched', () => {
  assert.equal(payload.data[0].suministradores[0].idsuministrador, base.data[0].suministradores[0].idsuministrador);
  assert.equal(payload.data[0].suministradores[0].idpadre, base.data[0].suministradores[0].idpadre);
  assert.equal(payload.data[0].suministradores[0].idexpedientesuministrador, base.data[0].suministradores[0].idexpedientesuministrador);
  assert.equal(payload.data[0].hitos[0].descripcion, base.data[0].hitos[0].descripcion);
  assert.equal(payload.data[0].hitos[0].importe, base.data[0].hitos[0].importe);
});

test('the rest of the payload is preserved', () => {
  assert.equal(payload.data[0].titulo, base.data[0].titulo);
  assert.equal(payload.data[0].fechaoferta, base.data[0].fechaoferta);
  assert.deepEqual(payload.data[0].responsables, base.data[0].responsables);
});
