'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TABLES, prepare, compare, readBase, definitionHash, dependencyCycles, BASE_DEFINITION_HASH,
} = require('./prepare-child-table-reconciliation.cjs');

const base = readBase();
const candidate = prepare(base);
const get = (root, key) => key.split('.').reduce((node, part) => node?.[part], root);
const scope = table => `actions.Try_-_Procesar_ExpedientesJSON.actions.Existe_ExpedienteJSON.actions`;

test('the pinned source is the applied phase 2b candidate', () => {
  assert.equal(definitionHash(base.definition), BASE_DEFINITION_HASH);
});

test('the candidate does not close a dependency cycle', () => {
  assert.deepEqual(dependencyCycles(candidate.definition), []);
});

test('both child tables are reconciled', () => {
  const comparison = compare(base, candidate);
  assert.equal(comparison.changedPathCount, 12);
  assert.equal(comparison.sourceDefinitionSha256, BASE_DEFINITION_HASH);
  assert.equal(TABLES.length, 2);
});

test('the deletion is a real delete behind a guard that fails closed', () => {
  for (const table of TABLES) {
    const guard = get(candidate.definition, `${scope(table)}.${table.check}.actions.${table.deleteLoop}.actions.Es_${table.name}_No_Deseado`);
    assert.equal(guard.type, 'If');
    assert.equal(guard.actions[table.remove].inputs.host.operationId, 'DeleteItem');
    assert.equal(guard.expression.and.length, 2, 'the guard needs the empty collection condition and the key condition');
    assert.ok(String(guard.expression.and[0].greaterOrEquals[0]).includes('createArray()'), 'the empty collection must be read safely');
    assert.equal(guard.expression.and[0].greaterOrEquals[1], 1);
    assert.equal(guard.expression.and[1].equals[1], 0);
  }
});

test('an existing row is patched and only a new one is created', () => {
  for (const table of TABLES) {
    const guard = get(candidate.definition, `${scope(table)}.${table.createLoop}.actions.Es_${table.name}_Existente`);
    assert.equal(guard.type, 'If');
    assert.equal(guard.actions[`Actualizar_${table.name}_Existente`].inputs.host.operationId, 'PatchItem');
    assert.equal(guard.else.actions[table.create].inputs.host.operationId, 'PostItem');
    const patch = guard.actions[`Actualizar_${table.name}_Existente`].inputs.parameters;
    assert.ok(patch.id.includes(`body('Buscar_${table.name}_Existente')`), 'the patch must target the row the search found');
    for (const field of Object.keys(table.patchFields)) assert.ok(patch[field], `the patch must write ${field}`);
  }
});

test('the patch only writes the fields the JSON carries', () => {
  const supplier = TABLES.find(table => table.name === 'Suministradores');
  assert.ok(!('item/ContratistaPrincipal' in supplier.patchFields), 'a flag the JSON does not carry must not be overwritten');
  assert.ok(!('item/Subcontratista' in supplier.patchFields));
  assert.ok(!('item/EsJuridica' in supplier.patchFields));
});

test('the keys of the two sides of a table are the same expression', () => {
  for (const table of TABLES) {
    const inDelete = get(candidate.definition, `${scope(table)}.${table.check}.actions.${table.deleteLoop}.actions.Buscar_${table.name}_No_Deseado`).inputs.where;
    const inCreate = get(candidate.definition, `${scope(table)}.${table.createLoop}.actions.Buscar_${table.name}_Existente`).inputs.where;
    assert.ok(inDelete.startsWith('@equals(') && inCreate.startsWith('@equals('));
    assert.ok(inDelete.includes(table.jsonKeyInDeleteLoop) && inDelete.includes(table.rowKeyInDeleteLoop));
    assert.ok(inCreate.includes(table.rowKeyInCreateLoop) && inCreate.includes(table.jsonKeyInCreateLoop));
  }
});

test('nothing else of the flow is touched', () => {
  const roles = get(candidate.definition, 'actions.Try_-_Procesar_ExpedientesJSON.actions.Existe_ExpedienteJSON.actions.Comprobar_que_hay_RolesUsuario');
  assert.deepEqual(Object.keys(roles.actions).sort(), ['Compose', 'Por_cada_Responsable_2', 'Por_cada_RolUsuario_Eliminar', 'Select_concat_correo-idrol']);
  assert.ok(candidate.definition.actions['INI_RolesUsuarioDeseados'], 'the desired role set of phase 2b is preserved');
});
