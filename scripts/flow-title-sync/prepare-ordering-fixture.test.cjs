'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const fixture = require('./prepare-ordering-fixture.cjs');

test('the two payloads of the case come from the committed payload of RF08', () => {
  for (const build of [fixture.buildNew, fixture.buildOld]) {
    const { receipt } = build();
    assert.equal(receipt.baseSha256, fixture.BASE_SHA256);
    assert.equal(receipt.outputBytes, receipt.outputBytes);
  }
});

test('the new file is newer than the old one', () => {
  assert.ok(fixture.NEW_INSTANT > fixture.OLD_INSTANT, 'the instants are ISO 8601 UTC, so the text sorts');
  const newer = JSON.parse(fixture.buildNew().out.toString('utf8'));
  const older = JSON.parse(fixture.buildOld().out.toString('utf8'));
  assert.equal(newer.meta.generatedAt, fixture.NEW_INSTANT);
  assert.equal(older.meta.generatedAt, fixture.OLD_INSTANT);
});

test('the two payloads carry different values of the root expediente', () => {
  const newer = JSON.parse(fixture.buildNew().out.toString('utf8'));
  const older = JSON.parse(fixture.buildOld().out.toString('utf8'));
  const rootOf = payload => payload.data.find(record => record.idexpediente === fixture.TARGET);
  assert.notEqual(rootOf(newer).observaciones, rootOf(older).observaciones);
  assert.notEqual(rootOf(newer).importecontratacion, rootOf(older).importecontratacion);
});

test('the sibling expedientes travel with the case and are not touched', () => {
  const { receipt } = fixture.buildNew();
  assert.deepEqual(receipt.untouchedSiblingIds, [900611802, 900611803]);
});

test('a base that is not the payload of RF08 is refused', () => {
  assert.throws(() => fixture.buildNew(Buffer.from('{}')), /the base is not the payload of RF08/);
});
