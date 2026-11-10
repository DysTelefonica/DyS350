'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  prepare, compare, readBase, definitionHash, validateDestination,
  BASE_PATH, BASE_DEFINITION_HASH, DIRECTORY, ENVIRONMENT, FLOW, TRY, EXISTE, COMPROBAR, POR_CADA_2, PATHS,
} = require('./prepare-role-existence-guard.cjs');

const base = readBase();
const candidate = prepare(base);
const get = (root, key) => key.split('.').reduce((node, part) => node?.[part], root);
const normalized = value => `toLower(trim(${value}))`;

test('the pinned source is the published DEV child reviewed on November 7', () => {
  assert.equal(base.environment, ENVIRONMENT);
  assert.equal(base.flow, FLOW);
  assert.equal(definitionHash(base.definition), BASE_DEFINITION_HASH);
});

test('readBase refuses a source whose definition or identity changed', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'role-guard-'));
  const tampered = path.join(directory, 'source.json');
  const snapshot = JSON.parse(fs.readFileSync(BASE_PATH, 'utf8'));
  snapshot.definition.actions[TRY].actions.Filtrar_Responsables_Validos.inputs.where = '@true';
  fs.writeFileSync(tampered, JSON.stringify(snapshot));
  assert.throws(() => readBase(tampered), /reviewed published child/);
  const other = path.join(directory, 'other-environment.json');
  snapshot.definition = base.definition;
  snapshot.environment = '00000000-0000-0000-0000-000000000000';
  fs.writeFileSync(other, JSON.stringify(snapshot));
  assert.throws(() => readBase(other), /environment mismatch/);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('the candidate changes only the reviewed role creations and key format', () => {
  const comparison = compare(base, candidate);
  assert.equal(comparison.changedPathCount, 9);
  for (const changedPath of comparison.changedPaths) {
    assert.ok(changedPath.startsWith('$.actions.'), `unexpected changed path: ${changedPath}`);
  }
  assert.ok(comparison.changedPaths.includes(`$.${PATHS.anexar}.inputs.value`));
  assert.ok(comparison.changedPaths.includes(`$.${PATHS.calidad}.expression.contains[0]`));
  assert.ok(comparison.changedPaths.includes(`$.${PATHS.ingenieria}.actions.Contiene_Usuario_ya_Ingenieria`));
  assert.ok(comparison.changedPaths.includes(`$.${PATHS.seguridad}.actions.Contiene_Usuario_ya_Seguridad`));
});

test('the role key index is built in the normalized form', () => {
  const anexar = get(candidate.definition, PATHS.anexar);
  assert.equal(anexar.inputs.value,
    `@{${normalized("items('Por_cada_RolesUsuario')?['usuario']")}}-@{items('Por_cada_RolesUsuario')?['IDRol']}`);
});

test('the project lead and Preventa checks compare the normalized key', () => {
  const jefe = get(candidate.definition, PATHS.jefe);
  assert.equal(jefe.expression.contains[0], "@variables('RolesUsuarioPrevios')");
  assert.equal(jefe.expression.contains[1],
    `@concat(${normalized("items('Por_cada_Responsable_2')?['correousuario']")},'-',body('Filter_array_2')?[0]?['IDRol'])`);
  const preventa = get(candidate.definition, PATHS.preventa);
  assert.equal(preventa.expression.contains[0], "@variables('RolesUsuarioPrevios')");
  assert.equal(preventa.expression.contains[1],
    `@concat(${normalized("items('Por_cada_Responsable_2')?['correousuario']")},'-',body('Filter_array_Preventa_2')?[0]?['IDRol'])`);
});

test('the quality technician check reads the role key list and compares the normalized key', () => {
  const calidad = get(candidate.definition, PATHS.calidad);
  assert.equal(calidad.expression.contains[0], "@variables('RolesUsuarioPrevios')");
  assert.equal(calidad.expression.contains[1],
    `@concat(${normalized("body('ExpedienteJSON')?['responsableCalidad']?['correousuario']")},'-',body('Rol_Tecnico_de_Calidad')?[0]?['IDRol'])`);
  assert.ok(calidad.else.actions.Crear_Tecnico_de_Calidad, 'the creation must stay in the else branch');
});

test('the engineering creation is guarded by the normalized key and keeps the original write', () => {
  const before = get(base.definition, `${PATHS.ingenieria}.actions.Crear_elemento`);
  const after = get(candidate.definition, `${PATHS.ingenieria}.actions.Contiene_Usuario_ya_Ingenieria`);
  assert.equal(after.type, 'If');
  assert.equal(after.expression.contains[0], "@variables('RolesUsuarioPrevios')");
  assert.equal(after.expression.contains[1],
    `@concat(${normalized("items('Por_cada_Responsable_2')?['correousuario']")},'-',@int(parameters('E2E_IDRol_Ingenieria (cr435_E2E_IDRol_Ingenieria)')))`);
  assert.deepEqual(Object.keys(after.actions), [], 'an existing role must not be created again');
  assert.deepEqual(after.else.actions.Crear_elemento, before, 'the original creation must be preserved unchanged');
});

test('the security creation is guarded by the normalized key and keeps the original write', () => {
  const before = get(base.definition, `${PATHS.seguridad}.actions._Crear_Tecnico_Documentacion_Sin_RolesUsuario_1`);
  const after = get(candidate.definition, `${PATHS.seguridad}.actions.Contiene_Usuario_ya_Seguridad`);
  assert.equal(after.type, 'If');
  assert.equal(after.expression.contains[0], "@variables('RolesUsuarioPrevios')");
  assert.equal(after.expression.contains[1],
    `@concat(${normalized("body('ExpedienteJSON')?['responsableSeguridad']?['correousuario']")},'-',5)`);
  assert.deepEqual(Object.keys(after.actions), []);
  assert.deepEqual(after.else.actions._Crear_Tecnico_Documentacion_Sin_RolesUsuario_1, before,
    'the original creation must be preserved unchanged');
  assert.equal(before.inputs.parameters['item/IDRol'], 5, 'the security role id must stay the reviewed literal');
});

test('every guard reads the same key index built in the same normalized form', () => {
  const anexar = get(candidate.definition, PATHS.anexar);
  const normalizedIndex = anexar.inputs.value;
  for (const guardPath of [PATHS.jefe, PATHS.preventa, PATHS.calidad,
    `${PATHS.ingenieria}.actions.Contiene_Usuario_ya_Ingenieria`,
    `${PATHS.seguridad}.actions.Contiene_Usuario_ya_Seguridad`]) {
    const action = get(candidate.definition, guardPath);
    assert.equal(action.expression.contains[0], "@variables('RolesUsuarioPrevios')", `${guardPath} must read the key index`);
    assert.ok(action.expression.contains[1].includes('toLower(trim('), `${guardPath} must compare the normalized key`);
  }
  assert.ok(normalizedIndex.includes('toLower(trim('));
});

test('the candidate keeps the role deletion simulated and never enables it', () => {
  const deletion = get(candidate.definition, PATHS.eliminacion);
  assert.equal(deletion.runtimeConfiguration.staticResult.name, 'Eliminar_RolesUsuario0');
  assert.equal(deletion.inputs.host.operationId, 'DeleteItem');
});

test('the candidate preserves the published responsible filter and the other branches', () => {
  const filter = get(candidate.definition, `actions.${TRY}.actions.Filtrar_Responsables_Validos`);
  assert.equal(filter.type, 'Query');
  assert.ok(filter.inputs.where.includes('correousuario'));
  assert.ok(get(candidate.definition, 'actions.Advertir_Responsables_Omitidos'), 'the warning tail must stay');
  const consumers = ['Por_cada_MiembroResponsable', 'Por_cada_Responsable_Sin_RolesUsuario', 'Por_cada_Responsable_3', 'Por_cada_Responsable'];
  for (const consumer of consumers) {
    const action = [`actions.${TRY}.actions.${consumer}`,
      `actions.${TRY}.actions.${EXISTE}.actions.${consumer}`,
      `actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}.else.actions.${consumer}`,
      `actions.${TRY}.actions.${EXISTE}.else.actions.Tiene_ExpedientePadre.else.actions.${consumer}`,
      `actions.${TRY}.actions.${EXISTE}.else.actions.Tiene_ExpedientePadre.actions.Expediente_con_Padre_en_el_sistema.actions.${consumer}`]
      .map(candidatePath => get(candidate.definition, candidatePath))
      .find(found => found);
    assert.ok(action, `consumer ${consumer} must be preserved`);
    assert.equal(action.foreach, "@body('Filtrar_Responsables_Validos')", `consumer ${consumer} must keep the filtered source`);
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
