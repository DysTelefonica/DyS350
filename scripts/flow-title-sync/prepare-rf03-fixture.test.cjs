'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  prepareCreate, prepareUpdate, readBase, diffPaths, validateDestination,
  BASE_HASH, DIRECTORY, NEW_IDS, LEAF_INDEX, UPDATE_TITLE, UPDATE_DATE, ENGINEER_SOURCE,
} = require('./prepare-rf03-fixture.cjs');

const base = readBase();
const created = prepareCreate(base);
const updated = prepareUpdate(created);

test('create payload applies the new identifiers and keeps the hierarchy', () => {
  assert.equal(created.data[0].idexpediente, NEW_IDS.root);
  assert.equal(created.data[1].idexpediente, NEW_IDS.child);
  assert.equal(created.data[2].idexpediente, NEW_IDS.leaf);
  assert.equal(created.data[0].idexpedientepadre, null);
  assert.equal(created.data[1].idexpedientepadre, NEW_IDS.root);
  assert.equal(created.data[2].idexpedientepadre, NEW_IDS.child);
});

test('create payload changes identifier leaves only', () => {
  const changed = diffPaths(base, created);
  assert.ok(changed.length > 0, 'the create payload must differ from the base');
  for (const changedPath of changed) {
    assert.match(changedPath, /^\$\.data\[\d+\]\.(idexpediente|idexpedientepadre|OrdinalE2E|nemotecnico|codexp|codexplargo|responsables\[\d+\])$/,
      `unexpected changed path: ${changedPath}`);
  }
});

test('create payload preserves every other leaf of the source business data', () => {
  base.data.forEach((record, index) => {
    const restored = structuredClone(created.data[index]);
    restored.idexpediente = record.idexpediente;
    restored.idexpedientepadre = record.idexpedientepadre;
    restored.OrdinalE2E = record.OrdinalE2E;
    restored.nemotecnico = record.nemotecnico;
    restored.codexp = record.codexp;
    restored.codexplargo = record.codexplargo;
    restored.responsables = restored.responsables.slice(0, record.responsables.length);
    assert.deepEqual(restored, record, `record ${index} changed beyond the identifier leaves`);
  });
});

test('create payload keeps the complete persons and arrays of the leaf', () => {
  const baseLeaf = base.data[LEAF_INDEX];
  const createdLeaf = created.data[LEAF_INDEX];
  assert.deepEqual(createdLeaf.responsables.slice(0, baseLeaf.responsables.length), baseLeaf.responsables);
  assert.deepEqual(created.data[LEAF_INDEX].suministradores, base.data[LEAF_INDEX].suministradores);
  assert.deepEqual(created.data[LEAF_INDEX].hitos, base.data[LEAF_INDEX].hitos);
});

test('create payload adds the engineering responsible copied verbatim from the base root', () => {
  const baseLeaf = base.data[LEAF_INDEX];
  const createdLeaf = created.data[LEAF_INDEX];
  assert.equal(createdLeaf.responsables.length, baseLeaf.responsables.length + 1);
  const added = createdLeaf.responsables.at(-1);
  assert.deepEqual(added, base.data[ENGINEER_SOURCE.record].responsables[ENGINEER_SOURCE.index]);
  assert.equal(added.esjefeproyecto, 'No');
  assert.equal(added.esPreventa, 'No');
  assert.ok(added.correousuario && added.nombre, 'the added responsible must be complete');
});

test('update payload holds the leaf alone with exactly two scalar changes', () => {
  assert.equal(updated.data.length, 1);
  assert.equal(updated.data[0].idexpediente, NEW_IDS.leaf);
  const changes = diffPaths(created.data[LEAF_INDEX], updated.data[0]).sort();
  assert.deepEqual(changes, ['$.fechaoferta', '$.titulo']);
  assert.equal(updated.data[0].titulo, UPDATE_TITLE);
  assert.equal(updated.data[0].fechaoferta, UPDATE_DATE);
});

test('update payload preserves the complete responsible, supplier and milestone arrays', () => {
  assert.deepEqual(updated.data[0].responsables, created.data[LEAF_INDEX].responsables);
  assert.deepEqual(updated.data[0].suministradores, created.data[LEAF_INDEX].suministradores);
  assert.deepEqual(updated.data[0].hitos, created.data[LEAF_INDEX].hitos);
});

test('readBase refuses bytes that differ from the reviewed fingerprint', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rf03-base-'));
  const tampered = path.join(directory, 'base.json');
  const bytes = fs.readFileSync(process.env.RF03_BASE_PATH ??
    'C:/Users/tfx0596/AppData/Local/Temp/vscode-agent-codex-sandbox-7bz2fL/dev-responsible-filter-20261106/900611231_26_20261106_RF01.json');
  const changed = Buffer.from(bytes.toString('utf8').replace('900611231', '900611299'), 'utf8');
  fs.writeFileSync(tampered, changed);
  assert.throws(() => readBase(tampered), /reviewed fingerprint/);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('validateDestination confines the output to the ignored RF03 subtree', () => {
  assert.throws(() => validateDestination(path.resolve(DIRECTORY, '..', 'escape.json')), /must stay inside/);
  assert.throws(() => validateDestination(path.resolve(process.cwd(), 'docs', 'escape.json')), /must stay inside/);
});

test('validateDestination refuses to overwrite an existing output', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rf03-dest-'));
  const existing = path.join(directory, 'file.json');
  fs.writeFileSync(existing, '{}');
  assert.throws(() => validateDestination(existing), /must stay inside/);
  const inside = path.join(DIRECTORY, 'not-created.json');
  fs.mkdirSync(DIRECTORY, { recursive: true });
  fs.writeFileSync(inside, '{}');
  try {
    assert.throws(() => validateDestination(inside), /refusing to overwrite/);
    assert.equal(validateDestination(inside, false), inside);
  } finally {
    fs.rmSync(inside, { force: true });
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('the pinned base fingerprint is the reviewed November 6 payload', () => {
  assert.equal(BASE_HASH, 'A31CE6A43FD8BBABFAFDBA3210FD406F49672D406648BA3BC4BBF50575D54ED7');
});
