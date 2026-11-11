'use strict';
// Offline fixture preparation only: no authentication, cloud client, upload or deployment.
// Derives the RF05 case from the RF04b update payload: the same in-flight expediente, ingested
// again without the engineering responsible, so the scoped role deletion can be measured. The
// JSON stops describing that role, and the row has to disappear.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const DIRECTORY = path.resolve(__dirname, `../../.atl/project-title-sync/${process.env.RF05_OUT_DIR ?? 'rf05-20261111'}`);
const BASE_NAME = process.env.RF05_BASE ?? 'rf04b-update.json';
const OUTPUT_NAME = process.env.RF05_OUTPUT ?? 'rf05a-drop-ingenieria.json';
const RECEIPT_NAME = process.env.RF05_RECEIPT ?? 'rf05-receipt.json';
const BASE_HASH = '414AD60EA5C73824C2141F7BDF938F1D13309F65905F89BC476400E224641ACD';
// The responsible the case drops: the engineering one, the only role the JSON stops describing.
const DROPPED_EMAIL = process.env.RF05_DROPPED_EMAIL ?? 'rosamaria.fuentesherrero@telefonica.com';
// With RF05_EMPTY_RESPONSABLES=1 the case carries no valid responsible at all, which is the
// input the fail closed rule protects: the deletion must not remove anything.
const EMPTY_RESPONSABLES = process.env.RF05_EMPTY_RESPONSABLES === '1';

const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();

function readBase(basePath = path.join(DIRECTORY, BASE_NAME)) {
  const bytes = fs.readFileSync(basePath);
  assert.equal(hash(bytes), BASE_HASH, `the base payload ${BASE_NAME} does not match the pinned hash`);
  return JSON.parse(bytes.toString('utf8'));
}

function dropResponsible(base, email = DROPPED_EMAIL) {
  const payload = JSON.parse(JSON.stringify(base));
  const record = payload.data[0];
  if (EMPTY_RESPONSABLES) {
    const before = record.responsables.length;
    record.responsables = [];
    assert.ok(before >= 1, 'the base payload has no responsable to empty');
    return { payload, dropped: null, kept: [] };
  }
  const before = record.responsables.length;
  record.responsables = record.responsables.filter(entry => entry.correousuario !== email);
  assert.equal(record.responsables.length, before - 1, 'the case must drop exactly one responsible');
  return { payload, dropped: email, kept: record.responsables.map(entry => entry.correousuario) };
}

function main() {
  const base = readBase();
  const { payload, dropped, kept } = dropResponsible(base);
  const bytes = Buffer.from(JSON.stringify(payload, null, 2));
  fs.writeFileSync(path.join(DIRECTORY, OUTPUT_NAME), bytes);
  const receipt = {
    status: 'PREPARED_NOT_UPLOADED',
    purpose: 'DEV/CERT case for the scoped role deletion: the JSON stops describing one role of an in-flight expediente',
    environment: 'DEV/CERT only',
    base: { file: BASE_NAME, sha256: BASE_HASH },
    dropped,
    keptResponsables: kept,
    output: { file: OUTPUT_NAME, bytes: bytes.length, sha256: hash(bytes) },
    expectation: 'the role row of the dropped responsible is deleted; the rows the JSON still describes stay',
  };
  fs.writeFileSync(path.join(DIRECTORY, RECEIPT_NAME), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`${OUTPUT_NAME}: ${bytes.length} bytes, sha256 ${receipt.output.sha256}`);
  return receipt;
}

if (require.main === module) main();

module.exports = { DIRECTORY, BASE_NAME, OUTPUT_NAME, BASE_HASH, DROPPED_EMAIL, EMPTY_RESPONSABLES, readBase, dropResponsible, main };
