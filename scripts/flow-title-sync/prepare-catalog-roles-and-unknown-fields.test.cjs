'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  prepare, compare, readBase, definitionHash, dependencyCycles, validateDestination,
  BASE_DEFINITION_HASH, DIRECTORY, OUTPUTS, SCHEMA_PATH, CATALOG_ROLES, INGENIERIA, DOCUMENTACION,
} = require('./prepare-catalog-roles-and-unknown-fields.cjs');

const base = readBase();
const candidate = prepare(base);
const get = (root, key) => key.split('.').reduce((node, part) => node?.[part], root);
const scope = candidate.definition.actions['Try_-_Procesar_ExpedientesJSON'];

test('the pinned source is the applied completeness guard', () => {
  assert.equal(definitionHash(base.definition), BASE_DEFINITION_HASH);
});

test('the candidate does not close a dependency cycle', () => {
  assert.deepEqual(dependencyCycles(candidate.definition), []);
});

test('the schema rejects a key the flow does not know', () => {
  const schema = get(candidate.definition, SCHEMA_PATH);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.required.length, 50, 'the fifty keys stay required');
});

test('the two role identifiers are resolved by name from the catalog', () => {
  for (const role of CATALOG_ROLES) {
    const action = scope.actions[role.action];
    assert.equal(action.type, 'Query');
    assert.equal(action.inputs.from, "@body('Obtener_Roles')");
    assert.ok(action.inputs.where.includes(role.title));
    assert.deepEqual(action.runAfter, { Obtener_Roles: ['Succeeded'] });
    assert.deepEqual(scope.actions['Existe_ExpedienteJSON'].runAfter[role.action], ['Succeeded'], 'the scope waits for the lookup');
  }
});

test('no literal role identifier is left in the definition', () => {
  const raw = JSON.stringify(candidate.definition.actions);
  assert.ok(!raw.includes('E2E_IDRol_Ingenieria'), 'the parameter that held the literal 3 must not be used by any action');
  assert.ok(candidate.definition.parameters['E2E_IDRol_Ingenieria (cr435_E2E_IDRol_Ingenieria)'], 'the parameter itself stays in the definition, it is simply not used');
  assert.ok(!/"item\/IDRol":5/.test(raw), 'the literal 5 must not be written');
  assert.ok(raw.includes(INGENIERIA));
  assert.ok(raw.includes(DOCUMENTACION));
});

test('nothing else of the flow is touched', () => {
  const comparison = compare(base, candidate);
  assert.equal(comparison.sourceDefinitionSha256, BASE_DEFINITION_HASH);
  assert.ok(comparison.unknownFieldsAreRejected);
  assert.ok(comparison.roleIdentifiersComeFromTheCatalog);
  assert.ok(candidate.definition.actions['INI_RolesUsuarioDeseados'], 'the reconciliation of the roles is preserved');
  const find = (node, name) => {
    for (const [key, action] of Object.entries(node.actions || {})) {
      if (key === name) return action;
      const found = find(action, name);
      if (found) return found;
    }
    if (node.else) return find(node.else, name);
    return null;
  };
  const existe = scope.actions['Existe_ExpedienteJSON'];
  assert.ok(find(existe, 'Es_Rol_No_Deseado'), 'the scoped deletion is preserved');
  assert.ok(find(existe, 'Por_cada_Hito_Eliminar'), 'the deletion of the milestones is preserved');
});

test('a source that is not the reviewed candidate is rejected', () => {
  const tampered = JSON.parse(JSON.stringify(base.definition));
  tampered.actions['INI_ContadorNuevos'] = { type: 'InitializeVariable', inputs: { name: 'x' } };
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-')), 'candidate-definition.json');
  fs.writeFileSync(file, JSON.stringify(tampered));
  assert.throws(() => readBase(file), /the base is not the reviewed completeness guard/);
});

test('the outputs stay inside the ignored subtree', () => {
  assert.ok(DIRECTORY.includes(`${path.sep}.atl${path.sep}`));
  for (const name of OUTPUTS) validateDestination(path.join(DIRECTORY, name), false);
  assert.throws(() => validateDestination(path.join(os.tmpdir(), 'candidate-definition.json'), false), /destination must stay inside/);
  const existing = path.join(DIRECTORY, 'scratch-guard-check.json');
  fs.mkdirSync(DIRECTORY, { recursive: true });
  fs.writeFileSync(existing, 'x');
  assert.throws(() => validateDestination(existing), /refusing to overwrite an existing output/);
  fs.rmSync(existing);
});
