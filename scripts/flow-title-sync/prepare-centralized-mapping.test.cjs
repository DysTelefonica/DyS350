'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  prepare, compare, readBase, definitionHash, dependencyCycles, validateDestination,
  BASE_DEFINITION_HASH, DIRECTORY, OUTPUTS, DESTINATIONS, TABLE, buildGroup, expressionOf,
} = require('./prepare-centralized-mapping.cjs');

const base = readBase();
const prepared = prepare(base);
const candidate = prepared.result;
const rebuilt = prepared.rebuilt;
const get = (root, key) => key.split('.').reduce((node, part) => node?.[part], root);

test('the pinned source is the published exact exporter schema', () => {
  assert.equal(definitionHash(base.definition), BASE_DEFINITION_HASH);
});

test('the candidate does not close a dependency cycle', () => {
  assert.deepEqual(dependencyCycles(candidate.definition), []);
});

test('the table writes the same columns as every published destination', () => {
  for (const destination of DESTINATIONS) {
    const action = get(candidate.definition, destination.path);
    const published = Object.keys(action.inputs.parameters).filter((key) => key.startsWith('item/')).sort();
    const table = Object.keys(buildGroup(destination.group)).sort();
    assert.deepEqual(table, published, `the table and ${destination.action} do not write the same columns`);
  }
});

test('the rebuild reproduces the published definition except for the one field that was derived in two ways', () => {
  const comparison = compare(base, candidate);
  assert.equal(comparison.sourceDefinitionSha256, BASE_DEFINITION_HASH);
  assert.equal(comparison.changedPathCount, 2, 'only the two actions that derived the PECAL chain in another way change');
  for (const path of comparison.changedPaths) {
    assert.ok(/item\/(CadenaPecal|cr435_cadenapecal)$/.test(path), `unexpected changed path: ${path}`);
  }
  assert.equal(comparison.fieldsInTheTable, 41);
  assert.equal(comparison.destinationsBuiltFromTheTable, 7);
});

test('the three destinations are equivalent: a field is derived the same way in all of them', () => {
  for (const field of TABLE.fields) {
    const expressions = new Set();
    for (const destination of DESTINATIONS) {
      const columns = field.columns[destination.group];
      if (!columns) continue;
      const action = get(candidate.definition, destination.path);
      for (const column of columns) {
        const expression = action.inputs.parameters['item/' + column];
        assert.equal(expression, expressionOf(field.source), `${destination.action}.${column} does not use the source of the table`);
        expressions.add(expression);
      }
    }
    assert.equal(expressions.size, 1, `the field ${field.source} is derived in more than one way`);
  }
});

test('the derived expressions of the table are the ones of the published flow', () => {
  const published = JSON.stringify(base.definition);
  for (const [source, expression] of Object.entries(TABLE.sources)) {
    assert.ok(published.includes(expression), `the expression of ${source} is not the one of the published flow`);
  }
});

test('the plain reads are the reads of the JSON', () => {
  for (const field of TABLE.fields) {
    if (!field.source.startsWith('json:')) continue;
    const key = field.source.slice('json:'.length);
    assert.equal(expressionOf(field.source), `@body('ExpedienteJSON')?['${key}']`);
  }
});

test('a source that is not the reviewed candidate is rejected', () => {
  const tampered = JSON.parse(JSON.stringify(base.definition));
  tampered.actions['INI_ContadorNuevos'] = { type: 'InitializeVariable', inputs: { name: 'x' } };
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mapping-')), 'candidate-definition.json');
  fs.writeFileSync(file, JSON.stringify(tampered));
  assert.throws(() => readBase(file), /the base is not the published exact exporter schema/);
});

test('the outputs stay inside the ignored subtree', () => {
  assert.ok(DIRECTORY.includes(`${path.sep}.atl${path.sep}`));
  for (const name of OUTPUTS) validateDestination(path.join(DIRECTORY, name), false);
  assert.throws(() => validateDestination(path.join(os.tmpdir(), 'candidate-definition.json'), false), /destination must stay inside/);
  const existing = path.join(DIRECTORY, 'scratch-mapping-check.json');
  fs.mkdirSync(DIRECTORY, { recursive: true });
  fs.writeFileSync(existing, 'x');
  assert.throws(() => validateDestination(existing), /refusing to overwrite an existing output/);
  fs.rmSync(existing);
});
