'use strict';
// Offline fixture preparation only: no authentication, cloud client, upload or deployment.
// Derives the RF04c rename case (DEV/CERT, November 11) from the RF04b update payload: the same
// responsible people with the same emails and three new display names, so the phase 2a title
// convergence can be measured without touching any other expediente.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const DIRECTORY = path.resolve(__dirname, `../../.atl/project-title-sync/${process.env.RF04_OUT_DIR ?? 'rf04-20261111'}`);
const BASE_NAME = process.env.RF04_BASE ?? 'rf04b-update.json';
const OUTPUT_NAME = process.env.RF04_RENAME_OUTPUT ?? 'rf04c-rename.json';
const RECEIPT_NAME = process.env.RF04_RENAME_RECEIPT ?? 'rf04c-receipt.json';
const BASE_HASH = '414AD60EA5C73824C2141F7BDF938F1D13309F65905F89BC476400E224641ACD';
// The bytes that were uploaded to CERT on November 11: the fixture and the evidence share the hash.
const OUTPUT_HASH = 'FBA17FE5153C2C0591D81543DE5861C1867379B4B5BF6B0317960462B5517ECF';
const SUFFIX = process.env.RF04_RENAME_SUFFIX ?? ' (TEST 2A)';
// The three display names the case renames: the project lead, the engineering responsible and the
// quality responsible. The security responsible is deliberately left alone as the control.
const RENAMED_NAMES = ['Tatiana Shulca Quinaupa', 'Rosa María Fuentes Herrero', 'Natalia Casán García'];

const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();

function readBase() {
  const file = path.join(DIRECTORY, BASE_NAME);
  const bytes = fs.readFileSync(file);
  assert.equal(hash(bytes), BASE_HASH, `the base payload ${BASE_NAME} does not match the pinned hash`);
  return JSON.parse(bytes.toString('utf8'));
}

const emailsOf = payload => {
  const record = payload.data[0];
  return {
    responsables: (record.responsables ?? []).map(entry => entry.correousuario),
    calidad: record.responsableCalidad?.correousuario ?? null,
    seguridad: record.responsableSeguridad?.correousuario ?? null,
  };
};

function renamePayload(base) {
  const payload = JSON.parse(JSON.stringify(base));
  const record = payload.data[0];
  const renamed = [];
  const renameEntry = (entry, kind) => {
    if (!entry || !entry.nombre || !RENAMED_NAMES.includes(entry.nombre)) return;
    entry.nombre = `${entry.nombre}${SUFFIX}`;
    renamed.push({ kind, nombre: entry.nombre, correo: entry.correousuario });
  };
  for (const entry of record.responsables ?? []) renameEntry(entry, 'responsable');
  renameEntry(record.responsableCalidad, 'calidad');
  renameEntry(record.responsableSeguridad, 'seguridad');
  return { payload, renamed };
}

function main() {
  const base = readBase();
  const before = emailsOf(base);
  const { payload, renamed } = renamePayload(base);
  const after = emailsOf(payload);
  assert.deepEqual(after, before, 'the rename must not change any email');
  assert.equal(renamed.length, RENAMED_NAMES.length, 'the case must rename exactly three display names');
  fs.writeFileSync(path.join(DIRECTORY, OUTPUT_NAME), JSON.stringify(payload, null, 2));
  const bytes = fs.readFileSync(path.join(DIRECTORY, OUTPUT_NAME));
  assert.equal(hash(bytes), OUTPUT_HASH, 'the generated fixture does not match the bytes uploaded on November 11');
  const receipt = {
    status: 'PREPARED_NOT_UPLOADED',
    purpose: 'DEV/CERT rename case for the phase 2a title convergence, derived from the RF04b update payload',
    environment: 'DEV/CERT only',
    base: { file: BASE_NAME, sha256: BASE_HASH },
    renamed,
    output: { file: OUTPUT_NAME, bytes: bytes.length, sha256: hash(bytes) },
  };
  fs.writeFileSync(path.join(DIRECTORY, RECEIPT_NAME), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`${OUTPUT_NAME}: ${bytes.length} bytes, sha256 ${receipt.output.sha256}`);
  return receipt;
}

if (require.main === module) main();

module.exports = { DIRECTORY, BASE_NAME, OUTPUT_NAME, BASE_HASH, SUFFIX, RENAMED_NAMES, readBase, renamePayload, emailsOf, main };
