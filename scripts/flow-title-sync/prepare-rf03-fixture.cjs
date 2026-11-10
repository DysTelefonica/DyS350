'use strict';
// Offline fixture preparation only: no authentication, cloud client, upload or deployment.
// Derives the November 10 DEV/CERT controlled cases (RF03) from the pinned November 6 RF01 payload.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const DEFAULT_BASE_PATH = 'C:/Users/tfx0596/AppData/Local/Temp/vscode-agent-codex-sandbox-7bz2fL/dev-responsible-filter-20261106/900611231_26_20261106_RF01.json';
const BASE_HASH = 'A31CE6A43FD8BBABFafdBA3210FD406F49672D406648BA3BC4BBF50575D54ED7'.toUpperCase();
const DIRECTORY = path.resolve(__dirname, '../../.atl/project-title-sync/rf03-20261110');
const OUTPUTS = ['rf03a-create.json', 'rf03b-update.json', 'rf03-receipt.json'];

const NEW_IDS = { root: 900611501, child: 900611502, leaf: 900611503 };
const NEW_ORDINALS = [990064, 990065, 990066];
const LEAF_INDEX = 2;
const UPDATE_TITLE = 'DEV RF03 update validation - 900611503';
const UPDATE_DATE = '2026-11-10T00:00:00Z';

const IDENTIFIER_PATHS = [
  'idexpediente', 'idexpedientepadre', 'OrdinalE2E', 'nemotecnico', 'codexp', 'codexplargo',
];
// The controlled leaf carries one extra valid responsible, copied verbatim from the base root,
// so the retest exercises the engineering creation path that the base leaf never reached.
const ENGINEER_SOURCE = { record: 0, index: 0 };

const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();

function readBase(basePath = process.env.RF03_BASE_PATH ?? DEFAULT_BASE_PATH) {
  const bytes = fs.readFileSync(basePath);
  assert.equal(hash(bytes), BASE_HASH, 'base fixture bytes differ from the reviewed fingerprint');
  return JSON.parse(bytes.toString('utf8'));
}

function diffPaths(left, right, prefix = '$', out = []) {
  if (JSON.stringify(left) === JSON.stringify(right)) return out;
  if (Array.isArray(left) && Array.isArray(right)) {
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      if (index >= left.length || index >= right.length) {
        out.push(`${prefix}[${index}]`);
        continue;
      }
      diffPaths(left[index], right[index], `${prefix}[${index}]`, out);
    }
    return out;
  }
  const leftIsObject = left && typeof left === 'object' && !Array.isArray(left);
  const rightIsObject = right && typeof right === 'object' && !Array.isArray(right);
  if (!leftIsObject || !rightIsObject) {
    out.push(prefix || '$');
    return out;
  }
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of [...keys].sort()) diffPaths(left[key], right[key], `${prefix}.${key}`, out);
  return out;
}

function replaceId(value, oldId, newId) {
  if (typeof value !== 'string') return value;
  return value.split(String(oldId)).join(String(newId));
}

// Rebuilds the whole hierarchy with new identifiers. Only identifier leaves may change.
function prepareCreate(base) {
  assert.ok(base && Array.isArray(base.data) && base.data.length === 3, 'base payload must hold three records');
  const result = structuredClone(base);
  const ids = [NEW_IDS.root, NEW_IDS.child, NEW_IDS.leaf];
  const oldIds = result.data.map(record => record.idexpediente);
  const oldRootId = oldIds[0];
  assert.equal(new Set(ids).size, 3, 'new identifiers must be distinct');
  for (const id of ids) assert.ok(!oldIds.includes(id), 'new identifier collides with the base payload');

  result.data.forEach((record, index) => {
    const oldId = oldIds[index];
    const newId = ids[index];
    const parentId = record.idexpedientepadre;
    record.idexpediente = newId;
    record.idexpedientepadre = parentId === null || parentId === undefined
      ? parentId
      : ids[oldIds.indexOf(parentId)];
    record.OrdinalE2E = NEW_ORDINALS[index];
    record.nemotecnico = replaceId(record.nemotecnico, oldRootId, NEW_IDS.root);
    record.codexp = replaceId(record.codexp, oldId, newId);
    record.codexplargo = replaceId(record.codexplargo, oldId, newId);
  });

  const source = result.data[ENGINEER_SOURCE.record].responsables[ENGINEER_SOURCE.index];
  assert.ok(source && source.correousuario && source.nombre, 'the engineer source responsible must be complete');
  assert.equal(source.esjefeproyecto, 'No', 'the copied responsible must be the engineering one');
  assert.equal(source.esPreventa, 'No', 'the copied responsible must not be a Preventa one');
  const leaf = result.data[LEAF_INDEX];
  const before = leaf.responsables.length;
  leaf.responsables.push(structuredClone(source));
  assert.equal(leaf.responsables.length, before + 1, 'the leaf must gain exactly one responsible');
  const addedPath = `responsables[${before}]`;

  const actual = diffPaths(base, result);
  for (const changedPath of actual) {
    const leaf = changedPath.split('.').pop();
    const allowed = IDENTIFIER_PATHS.includes(leaf) || leaf === addedPath;
    assert.ok(allowed, `create payload changed a leaf outside the allowed set: ${changedPath}`);
  }
  assert.equal(result.data[0].idexpedientepadre, null, 'root must stay without parent');
  assert.equal(result.data[1].idexpedientepadre, NEW_IDS.root, 'child must point to the new root');
  assert.equal(result.data[2].idexpedientepadre, NEW_IDS.child, 'leaf must point to the new child');
  assert.ok(result.data.every(record => record.nemotecnico.includes(String(NEW_IDS.root))), 'nemotecnico must follow the new root');
  return result;
}

// Same hierarchy, leaf only, exactly two scalar changes: the changed-data update case.
function prepareUpdate(created) {
  assert.ok(created && Array.isArray(created.data) && created.data.length === 3, 'created payload must hold three records');
  const result = structuredClone(created);
  const leaf = structuredClone(created.data[LEAF_INDEX]);
  result.data = [leaf];
  const before = structuredClone(leaf);
  result.data[0].titulo = UPDATE_TITLE;
  result.data[0].fechaoferta = UPDATE_DATE;
  const actual = diffPaths(before, result.data[0]).sort();
  assert.deepEqual(actual, ['$.fechaoferta', '$.titulo'], 'update payload changed leaves outside titulo and fechaoferta');
  assert.deepEqual(result.data[0].responsables, before.responsables, 'responsible list content must be preserved');
  return result;
}

function validateDestination(destination, exclusive = true) {
  const resolved = path.resolve(destination);
  const relative = path.relative(DIRECTORY, resolved);
  assert.ok(relative && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`),
    'destination must stay inside the ignored RF03 subtree');
  let current = path.parse(resolved).root;
  for (const part of resolved.slice(current.length).split(path.sep)) {
    current = path.join(current, part);
    let stat;
    try { stat = fs.lstatSync(current); } catch (error) { if (error.code === 'ENOENT') break; throw error; }
    assert.ok(!stat.isSymbolicLink(), 'destination contains a symbolic link or reparse point');
    assert.equal(path.relative(current, fs.realpathSync.native(current)), '', 'destination reparse resolution differs');
  }
  if (exclusive) assert.ok(!fs.existsSync(resolved), 'refusing to overwrite existing output');
  return resolved;
}

function buildReceipt(base, created, updated, payloadBytes) {
  return {
    status: 'PREPARED_NOT_UPLOADED',
    checkedAt: new Date().toISOString(),
    purpose: 'DEV/CERT controlled retest after the published parent read fix: creation case, changed-data update of its leaf, and the unchanged replay of that update.',
    environment: 'DEV/CERT only',
    basePath: process.env.RF03_BASE_PATH ?? DEFAULT_BASE_PATH,
    baseSha256: BASE_HASH,
    newIds: NEW_IDS,
    // The receipt cannot contain its own hash; it records the two payload files.
    outputs: Object.fromEntries(Object.entries(payloadBytes).map(([name, content]) => [name, {
      bytes: Buffer.byteLength(content),
      sha256: hash(content),
    }])),
    cases: {
      'rf03a-create.json': { records: created.data.length, purpose: 'new hierarchy creation (RF01 shape) against the fixed parent' },
      'rf03b-update.json': { records: updated.data.length, purpose: 'changed-data update of the new leaf (RF02 shape) to exercise the existing-with-roles branch' },
      'rf03c-replay': { file: 'rf03b-update.json', purpose: 'byte-identical resubmission of rf03b-update.json to prove idempotence' },
    },
    checks: {
      baseFingerprintPinned: true,
      allowedLeafPathsOnly: true,
      hierarchyPreserved: true,
      identifiersDistinct: true,
      completePersonsAndArraysPreserved: true,
      exclusiveCreation: true,
    },
    addedResponsible: {
      path: `$.data[${LEAF_INDEX}].${addedResponsiblePath(created)}`,
      copiedFrom: `$.data[${ENGINEER_SOURCE.record}].responsables[${ENGINEER_SOURCE.index}]`,
      reason: 'the base leaf holds no engineering responsible, so the engineering creation path would stay unexercised',
      esjefeproyecto: 'No',
      esPreventa: 'No',
    },
    runtime: { uploaded: false, executed: false },
    limitations: [
      'No upload and no runtime execution: the payloads are prepared only.',
      'The new identifiers must be confirmed absent in CERT before any upload.',
      'The role-deletion mock in the child stays untouched; this fixture does not authorize enabling it.',
    ],
  };
}

function addedResponsiblePath(created) {
  const leaf = created.data[LEAF_INDEX];
  return `responsables[${leaf.responsables.length - 1}]`;
}

function writeOutputs() {
  const destinations = OUTPUTS.map(name => validateDestination(path.join(DIRECTORY, name)));
  const base = readBase();
  const created = prepareCreate(base);
  const updated = prepareUpdate(created);
  const payloadBytes = {
    'rf03a-create.json': `${JSON.stringify(created, null, 2)}\n`,
    'rf03b-update.json': `${JSON.stringify(updated, null, 2)}\n`,
  };
  const receipt = buildReceipt(base, created, updated, payloadBytes);
  payloadBytes['rf03-receipt.json'] = `${JSON.stringify(receipt, null, 2)}\n`;

  fs.mkdirSync(DIRECTORY, { recursive: true });
  return destinations.map((file, index) => {
    validateDestination(file);
    const content = payloadBytes[OUTPUTS[index]];
    fs.writeFileSync(file, content, { flag: 'wx' });
    return { file: path.basename(file), sha256: hash(content) };
  });
}

if (require.main === module) {
  assert.equal(process.argv.length, 2, 'Usage: node prepare-rf03-fixture.cjs (fixed inputs/outputs only)');
  process.stdout.write(`${JSON.stringify({ localOnly: true, outputs: writeOutputs() })}\n`);
}

module.exports = { prepareCreate, prepareUpdate, readBase, diffPaths, validateDestination, buildReceipt,
  addedResponsiblePath,
  writeOutputs, BASE_HASH, DIRECTORY, OUTPUTS, NEW_IDS, LEAF_INDEX, UPDATE_TITLE, UPDATE_DATE, IDENTIFIER_PATHS,
  ENGINEER_SOURCE };
