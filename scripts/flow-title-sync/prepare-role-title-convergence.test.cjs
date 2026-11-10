'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  prepare, compare, readBase, definitionHash, validateDestination,
  BASE_PATH, BASE_DEFINITION_HASH, DIRECTORY, KINDS,
} = require('./prepare-role-title-convergence.cjs');

const base = readBase();
const candidate = prepare(base);
const get = (root, key) => key.split('.').reduce((node, part) => node?.[part], root);

test('the pinned source is the reviewed phase 1 candidate', () => {
  assert.equal(definitionHash(base.definition), BASE_DEFINITION_HASH);
});

test('readBase refuses a source that is not the reviewed phase 1 candidate', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'role-title-'));
  const tampered = path.join(directory, 'source.json');
  const definition = JSON.parse(fs.readFileSync(BASE_PATH, 'utf8'));
  definition.actions['Try_-_Procesar_ExpedientesJSON'].actions['Filtrar_Responsables_Validos'].inputs.where = '@true';
  fs.writeFileSync(tampered, JSON.stringify(definition));
  assert.throws(() => readBase(tampered), /reviewed phase 1 candidate/);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('the candidate changes only the five reviewed guard branches', () => {
  const comparison = compare(base, candidate);
  assert.equal(comparison.changedPathCount, KINDS.length * 2);
  for (const kind of KINDS) {
    assert.ok(comparison.changedPaths.includes(`$.${kind.guard}.actions.Buscar_Rol_Existente_${kind.id}`));
    assert.ok(comparison.changedPaths.includes(`$.${kind.guard}.actions.Actualizar_Rol_Existente_${kind.id}`));
  }
});

test('every guard looks the role up by the same normalized key and rewrites title and user', () => {
  for (const kind of KINDS) {
    const guard = get(candidate.definition, kind.guard);
    const search = guard.actions[`Buscar_Rol_Existente_${kind.id}`];
    assert.equal(search.type, 'Query');
    assert.equal(search.inputs.from, "@body('Recoger_RolesUsuario')");
    assert.ok(search.inputs.where.startsWith('@equals('));
    assert.ok(search.inputs.where.includes("item()?['usuario']"), 'the stored row key must be normalized too');
    assert.ok(search.inputs.where.includes(kind.key), 'the search must use the guard key');
    const update = guard.actions[`Actualizar_Rol_Existente_${kind.id}`];
    assert.equal(update.expression.greaterOrEquals[0], "@length(body('Buscar_Rol_Existente_" + kind.id + "'))");
    const patch = update.actions[`Actualizar_${kind.id}`];
    assert.equal(patch.inputs.host.operationId, 'PatchItem');
    assert.equal(patch.inputs.parameters.id, `@first(body('Buscar_Rol_Existente_${kind.id}'))?['ID']`);
    assert.equal(patch.inputs.parameters['item/Title'], kind.title);
    assert.equal(patch.inputs.parameters['item/usuario'], kind.usuario);
    assert.ok(patch.inputs.parameters.table.includes('E2E_ListaRolesUsuario'));
  }
});

test('the guard key and the search key are the same expression', () => {
  for (const kind of KINDS) {
    const guard = get(candidate.definition, kind.guard);
    const search = guard.actions[`Buscar_Rol_Existente_${kind.id}`];
    assert.ok(search.inputs.where.includes(kind.key),
      `${kind.id}: the search key and the guard key must match`);
  }
});

test('the candidate keeps the role deletion simulated', () => {
  const deletion = get(candidate.definition,
    'actions.Try_-_Procesar_ExpedientesJSON.actions.Existe_ExpedienteJSON.actions.Comprobar_que_hay_RolesUsuario.actions.Por_cada_RolUsuario_Eliminar.actions.Eliminar_RolesUsuario');
  assert.equal(deletion.runtimeConfiguration.staticResult.name, 'Eliminar_RolesUsuario0');
});

test('the candidate preserves the phase 1 guards and the creation writes', () => {
  for (const kind of KINDS) {
    const before = get(base.definition, kind.guard);
    const after = get(candidate.definition, kind.guard);
    assert.deepEqual(after.expression, before.expression, `${kind.id}: the guard expression must not change`);
    assert.deepEqual(after.else, before.else, `${kind.id}: the creation branch must not change`);
  }
});

test('validateDestination confines the output and refuses to overwrite', () => {
  assert.throws(() => validateDestination(path.resolve(DIRECTORY, '..', 'escape.json')), /must stay inside/);
  const inside = path.join(DIRECTORY, 'not-created.json');
  fs.mkdirSync(DIRECTORY, { recursive: true });
  fs.writeFileSync(inside, '{}');
  try {
    assert.throws(() => validateDestination(inside), /refusing to overwrite/);
    assert.equal(validateDestination(inside, false), inside);
  } finally {
    fs.rmSync(inside, { force: true });
  }
});
