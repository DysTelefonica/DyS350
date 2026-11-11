'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  prepare, compare, readBase, definitionHash, validateDestination, dependencyCycles,
  BASE_PATH, BASE_DEFINITION_HASH, DIRECTORY, PATHS, VARIABLE,
} = require('./prepare-role-scoped-delete.cjs');

const base = readBase();
const candidate = prepare(base);
const get = (root, key) => key.split('.').reduce((node, part) => node?.[part], root);

test('the pinned source is the reviewed phase 2a candidate', () => {
  assert.equal(definitionHash(base.definition), BASE_DEFINITION_HASH);
});

test('readBase refuses a source that is not the reviewed phase 2a candidate', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'role-delete-'));
  const tampered = path.join(directory, 'source.json');
  const definition = JSON.parse(fs.readFileSync(BASE_PATH, 'utf8'));
  definition.actions['Try_-_Procesar_ExpedientesJSON'].actions['Filtrar_Responsables_Validos'].inputs.where = '@true';
  fs.writeFileSync(tampered, JSON.stringify(definition));
  assert.throws(() => readBase(tampered), /reviewed phase 2a candidate/);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('the candidate changes only the reviewed paths', () => {
  const comparison = compare(base, candidate);
  assert.equal(comparison.changedPathCount, 11);
  assert.ok(comparison.changedPaths.includes('$.actions.INI_' + VARIABLE));
  assert.ok(comparison.changedPaths.includes('$.' + PATHS.borrar + '.actions.Es_Rol_No_Deseado'));
  assert.ok(comparison.changedPaths.includes('$.' + PATHS.borrar + '.runAfter.Por_cada_Responsable_2'));
});

test('the candidate does not close a dependency cycle in the action graph', () => {
  assert.deepEqual(dependencyCycles(candidate.definition), []);
  const selection = get(candidate.definition, PATHS.seleccionar);
  assert.deepEqual(Object.keys(selection.runAfter || {}), [], 'the selection must not depend on the deletion loop');
  const deletion = get(candidate.definition, PATHS.borrar);
  assert.deepEqual(Object.keys(deletion.runAfter || {}), ['Por_cada_Responsable_2'], 'the deletion runs after the responsible loop');
});

test('the desired key set is initialized at the root scope', () => {
  const variable = candidate.definition.actions['INI_' + VARIABLE];
  assert.equal(variable.type, 'InitializeVariable');
  assert.deepEqual(variable.inputs.variables, [{ name: VARIABLE, type: 'array' }]);
});

test('the desired keys are collected for the five role kinds', () => {
  const expected = {
    Jefe: PATHS.jefe + '.Anexar_Rol_Deseado_Jefe',
    Preventa: PATHS.preventa + '.Anexar_Rol_Deseado_Preventa',
    Ingenieria: PATHS.ingenieria + '.Anexar_Rol_Deseado_Ingenieria',
    Calidad: PATHS.calidad + '.actions.Anexar_Rol_Deseado_Calidad',
    Seguridad: PATHS.seguridad + '.Anexar_Rol_Deseado_Seguridad',
  };
  for (const [label, actionPath] of Object.entries(expected)) {
    const action = get(candidate.definition, actionPath);
    assert.ok(action, label + ': the append action is missing');
    assert.equal(action.type, 'AppendToArrayVariable');
    assert.equal(action.inputs.name, VARIABLE);
    assert.ok(action.inputs.value.includes('toLower(trim('), label + ': the key must be normalized');
  }
});

test('the delete is real, scoped to the rows the JSON no longer describes, and fails closed', () => {
  const guard = get(candidate.definition, PATHS.borrar + '.actions.Es_Rol_No_Deseado');
  assert.equal(guard.type, 'If');
  const conditions = guard.expression.and;
  assert.equal(conditions[0].greaterOrEquals[0], "@length(body('Filtrar_Responsables_Validos'))");
  assert.equal(conditions[0].greaterOrEquals[1], 1, 'with no valid responsible nothing may be deleted');
  assert.equal(conditions[1].not[0].contains[0], "@variables('" + VARIABLE + "')");
  assert.ok(conditions[1].not[0].contains[1].includes("items('Por_cada_RolUsuario_Eliminar')?['usuario']"));
  const eliminar = guard.actions.Eliminar_RolesUsuario;
  assert.equal(eliminar.inputs.host.operationId, 'DeleteItem');
  assert.equal(eliminar.runtimeConfiguration, undefined, 'the static result must be gone: this is a real delete');
  assert.equal(eliminar.inputs.parameters.id, "@items('Por_cada_RolUsuario_Eliminar')?['ID']");
});

test('the deletion runs only after the desired set is complete', () => {
  const borrar = get(candidate.definition, PATHS.borrar);
  assert.deepEqual(borrar.runAfter, { Por_cada_Responsable_2: ['Succeeded'] });
  const comprobar = get(candidate.definition,
    'actions.Try_-_Procesar_ExpedientesJSON.actions.Existe_ExpedienteJSON.actions.Comprobar_que_hay_RolesUsuario');
  assert.deepEqual(comprobar.runAfter.Responsable_de_Calidad_ya_Existente, ['Succeeded']);
  assert.deepEqual(comprobar.runAfter.Comprobar_que_hay_Suministradores, ['Succeeded']);
});

test('the candidate preserves the phase 2a guards and the title convergence writes', () => {
  const guards = [PATHS.jefe + '.Contiene_Usuario_ya', PATHS.preventa + '.Contiene_Usuario_ya_2',
    PATHS.ingenieria + '.Contiene_Usuario_ya_Ingenieria', PATHS.seguridad.replace(/\.actions$/, '')];
  for (const guardPath of guards) {
    assert.deepEqual(get(candidate.definition, guardPath).expression, get(base.definition, guardPath).expression,
      guardPath + ': the guard expression must not change');
  }
  const quality = get(candidate.definition, PATHS.calidad);
  assert.ok(quality.else.actions.Crear_Tecnico_de_Calidad, 'the quality creation must stay');
  assert.ok(quality.actions.Buscar_Rol_Existente_Calidad, 'the quality title convergence must stay');
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
