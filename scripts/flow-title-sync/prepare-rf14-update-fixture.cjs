'use strict';
// Builds the payload that measures the change trace of the ingestion over a row that already
// exists: the same payload as the case of RF13 with a fourth value of the two fields, so the run
// finds a row in the list and the trace has to report the change.
//
// The base is the payload of the case of RF08, committed here with the hash it had when it was
// uploaded. The generator refuses any base whose bytes differ. The output goes to the ignored
// directory of the phase D.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const BASE = path.resolve(__dirname, 'fixtures/rf08a-create.json');
const BASE_SHA256 = '9E46AEE0595C5632BAD11F5245242AAF50FF8756D5AF53D8DF653F816CF33068';
const OUT_DIR = path.resolve(__dirname, '../../.atl/project-title-sync/change-trace-20261115');
const OUT = path.join(OUT_DIR, '900611801_26_20261116_RF14-update.json');
const TARGET = 900611801;

const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();

function build(baseBytes = fs.readFileSync(BASE)) {
  const baseHash = hash(baseBytes);
  if (baseHash !== BASE_SHA256) throw new Error(`the base is not the payload of RF08: ${baseHash}`);
  const payload = JSON.parse(baseBytes.toString('utf8'));
  const root = payload.data.find(record => record.idexpediente === TARGET);
  if (!root) throw new Error('the base has no root expediente');
  const before = { observaciones: root.observaciones, importecontratacion: root.importecontratacion };
  root.observaciones = `${before.observaciones} [RF14 2026-11-16: cuarto cambio para medir la fase D]`;
  root.importecontratacion = 111222.33;
  const out = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return {
    out,
    receipt: {
      base: path.basename(BASE),
      baseBytes: baseBytes.length,
      baseSha256: baseHash,
      output: path.basename(OUT),
      outputBytes: out.length,
      outputSha256: hash(out),
      changed: [
        { field: 'observaciones', before: before.observaciones, after: root.observaciones },
        { field: 'importecontratacion', before: before.importecontratacion, after: root.importecontratacion },
      ],
      untouchedSiblingIds: payload.data.filter(r => r.idexpediente !== TARGET).map(r => r.idexpediente),
    },
  };
}

function write(output = OUT) {
  const { out, receipt } = build();
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, out);
  return receipt;
}

if (require.main === module) {
  console.log(JSON.stringify(write(), null, 2));
}

module.exports = { BASE, BASE_SHA256, OUT, TARGET, build, write, hash };
