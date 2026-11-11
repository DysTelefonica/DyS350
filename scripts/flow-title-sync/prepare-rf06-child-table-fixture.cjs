'use strict';
// Offline fixture preparation only: no authentication, cloud client, upload or deployment.
// Derives the RF06 case from the RF05a payload: the same in-flight expediente with a new supplier
// name and a new milestone date, so the reconciliation of the two child tables can be measured.
// Neither change touches the business key of its row, so the row identifiers have to survive.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const DIRECTORY = path.resolve(__dirname, `../../.atl/project-title-sync/${process.env.RF06_OUT_DIR ?? 'rf06-20261111'}`);
const BASE_NAME = process.env.RF06_BASE ?? 'rf05a-drop-ingenieria.json';
const OUTPUT_NAME = process.env.RF06_OUTPUT ?? 'rf06a-child-tables.json';
const RECEIPT_NAME = process.env.RF06_RECEIPT ?? 'rf06-receipt.json';
const BASE_HASH = process.env.RF06_BASE_HASH ?? '5E6E49347A8FF4B57C38DCB84F6502CA428493BDE92E717A3EC562952C85BACE';
const SUPPLIER_NAME = process.env.RF06_SUPPLIER_NAME ?? 'Telefónica Soluciones de Informática y Comunicaciones de España, S.A.U. (TEST 3)';
const MILESTONE_DATE = process.env.RF06_MILESTONE_DATE ?? '2026-12-20T00:00:00.000Z';

const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();

function readBase(basePath = path.join(DIRECTORY, BASE_NAME)) {
  const bytes = fs.readFileSync(basePath);
  assert.equal(hash(bytes), BASE_HASH, `the base payload ${BASE_NAME} does not match the pinned hash`);
  return JSON.parse(bytes.toString('utf8'));
}

function changeChildTables(base) {
  const payload = JSON.parse(JSON.stringify(base));
  const record = payload.data[0];
  const supplier = (record.suministradores ?? [])[0];
  const milestone = (record.hitos ?? [])[0];
  assert.ok(supplier && milestone, 'the base payload must carry a supplier and a milestone');
  const before = { name: supplier.nombre, date: milestone.fechahito, amount: milestone.importe };
  supplier.nombre = SUPPLIER_NAME;
  milestone.fechahito = MILESTONE_DATE;
  return { payload, before, after: { name: supplier.nombre, date: milestone.fechahito, amount: milestone.importe } };
}

function main() {
  const base = readBase();
  const { payload, before, after } = changeChildTables(base);
  const bytes = Buffer.from(JSON.stringify(payload, null, 2));
  fs.writeFileSync(path.join(DIRECTORY, OUTPUT_NAME), bytes);
  const receipt = {
    status: 'PREPARED_NOT_UPLOADED',
    purpose: 'DEV/CERT case for the reconciliation of the supplier and milestone rows: the values change, the identifiers must not',
    environment: 'DEV/CERT only',
    base: { file: BASE_NAME, sha256: BASE_HASH },
    before,
    after,
    output: { file: OUTPUT_NAME, bytes: bytes.length, sha256: hash(bytes) },
    expectation: 'the supplier row and the milestone row keep their identifiers and carry the new values',
  };
  fs.writeFileSync(path.join(DIRECTORY, RECEIPT_NAME), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`${OUTPUT_NAME}: ${bytes.length} bytes, sha256 ${receipt.output.sha256}`);
  return receipt;
}

if (require.main === module) main();

module.exports = { DIRECTORY, BASE_NAME, OUTPUT_NAME, BASE_HASH, SUPPLIER_NAME, MILESTONE_DATE, readBase, changeChildTables, main };
