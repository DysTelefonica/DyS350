'use strict';
// Builds the two payloads that measure the new scope of the role reconciliation of DEV/CERT:
//
//   rf15a-create.json    the setup. It creates the role rows of the three controlled expedientes.
//                        The root expediente takes Martina as its quality person, so she enters
//                        the group of the quality role only because of that expediente.
//   rf15b-authority.json the case. The JSON of the root expediente no longer describes the quality
//                        role, so its row has to be deleted and its person has to leave the group
//                        of the role. The rows that do not change must not be written at all and
//                        the Direccion row, which the flow never writes, has to survive.
//
// The controlled identifiers are new (900611901..903) so the case starts with no state of a
// previous case: the ordering guard of the parent keeps the generation time of the JSON, and a
// file with an older instant would be skipped as Antiguo.
//
// The base is the payload of the case of RF08, committed here with the hash it had when it was
// uploaded, so the case can be rebuilt and uploaded again. The generator refuses any base whose
// bytes differ. The output goes to the ignored directory of the phase.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const BASE = path.resolve(__dirname, 'fixtures/rf08a-create.json');
const BASE_SHA256 = '9E46AEE0595C5632BAD11F5245242AAF50FF8756D5AF53D8DF653F816CF33068';
const OUT_DIR = path.resolve(__dirname, '../../.atl/project-title-sync/role-authoritative-deletion-20261117');
const OUT_SETUP = path.join(OUT_DIR, '900611901_26_20261117_RF15-create.json');
const OUT_CASE = path.join(OUT_DIR, '900611901_26_20261117_RF15-authority.json');

const TARGET = 900611901;
const SIBLINGS = [900611902, 900611903];
const OLD_IDS = [900611801, 900611802, 900611803];
const QUALITY_PERSON = 'martina.torralbarodriguez@telefonica.com';
const QUALITY_NAME = 'Martina Torralba Rodríguez';
const SETUP_INSTANT = '2026-11-17T12:00:00.000Z';
const CASE_INSTANT = '2026-11-17T13:00:00.000Z';

// The fingerprint and the size are taken over the content with the line endings of the repository:
// a checkout rewrites a file with the line endings of the operating system, and the payload is the
// same one.
const content = bytes => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
const hash = bytes => createHash('sha256').update(content(bytes)).digest('hex').toUpperCase();

function rename(payload, baseId = TARGET) {
  const map = new Map(OLD_IDS.map((oldId, index) => [oldId, baseId + index]));
  for (const record of payload.data) {
    const next = map.get(record.idexpediente);
    record.idexpediente = next;
    record.codexp = `DEV${next}`;
    record.codexplargo = `DEV${next}`;
    record.nemotecnico = `${next}_26`;
    record.ordinal = null;
  }
  return map;
}

function build(baseBytes = fs.readFileSync(BASE), options = {}) {
  const baseId = options.baseId ?? TARGET;
  const quality = options.quality ?? { login: QUALITY_PERSON, name: QUALITY_NAME };
  const baseHash = hash(baseBytes);
  if (baseHash !== BASE_SHA256) throw new Error(`the base is not the payload of RF08: ${baseHash}`);

  const setup = JSON.parse(baseBytes.toString('utf8'));
  rename(setup, baseId);
  setup.meta.generatedAt = SETUP_INSTANT;
  const root = setup.data.find(record => record.idexpediente === baseId);
  if (!root) throw new Error('the base has no root expediente');
  const qualityBefore = { ...root.responsableCalidad };
  root.responsableCalidad = { correousuario: quality.login, nombre: quality.name };

  const setupBytes = Buffer.from(`${JSON.stringify(setup, null, 2)}\n`, 'utf8');

  const instance = JSON.parse(setupBytes.toString('utf8'));
  instance.meta.generatedAt = CASE_INSTANT;
  const caseRoot = instance.data.find(record => record.idexpediente === baseId);
  caseRoot.responsableCalidad = { correousuario: null, nombre: null };
  const caseBytes = Buffer.from(`${JSON.stringify(instance, null, 2)}\n`, 'utf8');

  return {
    setup: setupBytes,
    instance: caseBytes,
    receipt: {
      base: path.basename(BASE),
      baseBytes: content(baseBytes).length,
      baseSha256: baseHash,
      target: baseId,
      siblings: SIBLINGS.map(id => id - 900611901 + baseId),
      setup: {
        output: path.basename(OUT_SETUP),
        outputBytes: setupBytes.length,
        outputSha256: hash(setupBytes),
        generatedAt: SETUP_INSTANT,
        quality: { before: qualityBefore, after: caseRoot ? root.responsableCalidad : null },
      },
      instance: {
        output: path.basename(OUT_CASE),
        outputBytes: caseBytes.length,
        outputSha256: hash(caseBytes),
        generatedAt: CASE_INSTANT,
        quality: { before: root.responsableCalidad, after: { correousuario: null, nombre: null } },
      },
      expected: [
        'The quality row of the root expediente is deleted: the JSON does not describe that role.',
        'Its person leaves the group of the quality role: she holds no other row of that kind.',
        'The quality person of the sibling expedientes stays in the group.',
        'The rows whose person and name do not change are not written.',
        'The Direccion row, which the flow never writes, survives.',
      ],
    },
  };
}

function write(options = {}) {
  const setupOutput = options.setupOutput ?? OUT_SETUP;
  const caseOutput = options.caseOutput ?? OUT_CASE;
  const { setup, instance, receipt } = build(fs.readFileSync(BASE), options);
  receipt.setup.output = path.basename(setupOutput);
  receipt.instance.output = path.basename(caseOutput);
  fs.mkdirSync(path.dirname(setupOutput), { recursive: true });
  fs.writeFileSync(setupOutput, setup);
  fs.writeFileSync(caseOutput, instance);
  return receipt;
}

if (require.main === module) {
  console.log(JSON.stringify(write(), null, 2));
}

module.exports = { BASE, BASE_SHA256, OUT_SETUP, OUT_CASE, TARGET, SIBLINGS, build, write, hash };
