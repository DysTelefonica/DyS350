'use strict';
// Builds the two payloads that measure the ordering guard: the same case with two generation
// times and two values of the root expediente.
//
// The NEW file is applied: it is newer than nothing. The OLD file is the one with the older
// generation time: uploaded after the new one, it must not overwrite it. The values of the two
// files differ, so the row of the staging list says which one was applied.
//
// The base is the payload of the case of RF08, committed here with the hash it had when it was
// uploaded, so the case of the guard can be rebuilt and uploaded again. The generator refuses any
// base whose bytes differ. The output goes to the ignored directory of the phase E.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const BASE = path.resolve(__dirname, 'fixtures/rf08a-create.json');
const BASE_SHA256 = '9E46AEE0595C5632BAD11F5245242AAF50FF8756D5AF53D8DF653F816CF33068';
const OUT_DIR = path.resolve(__dirname, '../../.atl/project-title-sync/ordering-guard-20261116');
const NEW_OUT = path.join(OUT_DIR, '900611801_26_20261116_RF15-new.json');
const OLD_OUT = path.join(OUT_DIR, '900611801_26_20261116_RF16-old.json');
const TARGET = 900611801;

// The two generation times of the case: the new one is newer than the old one.
const NEW_INSTANT = '2026-11-16T09:00:00.000Z';
const OLD_INSTANT = '2026-10-01T09:00:00.000Z';

// The fingerprint and the size are taken over the content with the line endings of the repository:
// a checkout rewrites a file with the line endings of the operating system, and the payload is the
// same one.
const content = bytes => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
const hash = bytes => createHash('sha256').update(content(bytes)).digest('hex').toUpperCase();

// One payload: the base, the generation time and the two values of the root expediente.
function buildOne(baseBytes, { instant, mark, amount }) {
  const baseHash = hash(baseBytes);
  if (baseHash !== BASE_SHA256) throw new Error(`the base is not the payload of RF08: ${baseHash}`);
  const payload = JSON.parse(baseBytes.toString('utf8'));
  const root = payload.data.find(record => record.idexpediente === TARGET);
  if (!root) throw new Error('the base has no root expediente');
  const before = { observaciones: root.observaciones, importecontratacion: root.importecontratacion };
  const baseInstant = payload.meta.generatedAt;
  payload.meta.generatedAt = instant;
  root.observaciones = `${before.observaciones} [${mark}]`;
  root.importecontratacion = amount;
  const out = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return {
    out,
    receipt: {
      base: path.basename(BASE),
      baseBytes: content(baseBytes).length,
      baseSha256: baseHash,
      outputBytes: out.length,
      outputSha256: hash(out),
      generationTime: { before: baseInstant, after: instant },
      changed: [
        { field: 'observaciones', before: before.observaciones, after: root.observaciones },
        { field: 'importecontratacion', before: before.importecontratacion, after: root.importecontratacion },
      ],
      untouchedSiblingIds: payload.data.filter(r => r.idexpediente !== TARGET).map(r => r.idexpediente),
    },
  };
}

// The payload of the file that is newer.
function buildNew(baseBytes = fs.readFileSync(BASE)) {
  return buildOne(baseBytes, {
    instant: NEW_INSTANT,
    mark: 'RF15 2026-11-16: fichero nuevo del guard de orden',
    amount: 555555.55,
  });
}

// The payload of the file that is older and must not overwrite the new one.
function buildOld(baseBytes = fs.readFileSync(BASE)) {
  return buildOne(baseBytes, {
    instant: OLD_INSTANT,
    mark: 'RF16 2026-11-16: fichero viejo del guard de orden',
    amount: 111222.33,
  });
}

function write(newOutput = NEW_OUT, oldOutput = OLD_OUT) {
  const newer = buildNew();
  const older = buildOld();
  fs.mkdirSync(path.dirname(newOutput), { recursive: true });
  fs.writeFileSync(newOutput, newer.out);
  fs.writeFileSync(oldOutput, older.out);
  return {
    new: { output: path.basename(newOutput), ...newer.receipt },
    old: { output: path.basename(oldOutput), ...older.receipt },
  };
}

if (require.main === module) {
  console.log(JSON.stringify(write(), null, 2));
}

module.exports = {
  BASE, BASE_SHA256, NEW_OUT, OLD_OUT, TARGET, NEW_INSTANT, OLD_INSTANT,
  buildNew, buildOld, write, hash,
};
