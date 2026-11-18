'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const port = require('./prepare-prod-duplicate-removal.cjs');
const phase = require('./prepare-role-duplicate-removal.cjs');

const live = port.readJson(port.LIVE_PATH, port.LIVE_HASH);
const source = port.readJson(port.SOURCE_PATH, port.SOURCE_HASH);
const candidate = port.prepare(live, source);
const loop = (definition) => definition.actions['Try_-_Procesar_ExpedientesJSON'].actions['Existe_ExpedienteJSON']
  .actions['Comprobar_que_hay_RolesUsuario'].actions['Por_cada_RolUsuario_Eliminar'];

test('the live definition of PROD is the reviewed one', () => {
  assert.equal(port.definitionHash(live), port.LIVE_HASH);
});

test('the source of the logic is the candidate published in DEV/CERT', () => {
  assert.equal(port.definitionHash(source), port.SOURCE_HASH);
});

test('a base that is not the reviewed one is rejected', () => {
  const other = JSON.parse(JSON.stringify(live));
  other.parameters['E2E_ListaRolesUsuario (cr435_E2E_ListaRolesUsuario)'].defaultValue = 'not-the-reviewed-one';
  assert.throws(() => port.readJson(port.LIVE_PATH, '0'.repeat(64)), /not the reviewed one/);
  assert.notEqual(port.definitionHash(other), port.LIVE_HASH);
});

test('the candidate of PROD carries the two actions of the rule of the copy', () => {
  const acciones = loop(candidate.definition).actions;
  assert.ok(acciones[phase.BUSCAR], 'the query of the copy is missing');
  assert.ok(acciones[phase.COPIA], 'the guard of the copy is missing');
  const donde = acciones[phase.BUSCAR].inputs.where;
  assert.match(donde, /items\('Por_cada_RolUsuario_Eliminar'\)\?\['usuario'\]/);
  assert.match(donde, /items\('Por_cada_RolUsuario_Eliminar'\)\?\['IDRol'\]/);
  assert.match(donde, /less\(item\(\)\?\['ID'\],items\('Por_cada_RolUsuario_Eliminar'\)\?\['ID'\]\)/);
  assert.equal(acciones[phase.BUSCAR].inputs.from, "@body('Recoger_RolesUsuario')");
});

test('the guard of the copy measures the search and asks for a row the JSON describes', () => {
  const guard = loop(candidate.definition).actions[phase.COPIA];
  const texto = JSON.stringify(guard.expression);
  assert.match(texto, /body\('Buscar_Copia_De_Una_Fila_Igual'\)/);
  assert.doesNotMatch(texto, /\?\['value'\]/);
  assert.match(texto, /RolesUsuarioDeseados/);
});

test('the copy is deleted with the delete of the row and it does not leave the group', () => {
  const borrar = loop(candidate.definition).actions[phase.COPIA].actions['Eliminar_Copia_RolesUsuario'];
  assert.equal(borrar.type, 'OpenApiConnection');
  assert.equal(borrar.inputs.host.operationId, 'DeleteItem');
  assert.equal(borrar.inputs.parameters.id, "@items('Por_cada_RolUsuario_Eliminar')?['ID']");
  assert.equal(borrar.inputs.parameters.table, "@parameters('E2E_ListaRolesUsuario (cr435_E2E_ListaRolesUsuario)')");
  const contenido = JSON.stringify(loop(candidate.definition).actions[phase.COPIA]);
  assert.doesNotMatch(contenido, /Quitar_el_miembro_del_grupo/);
});

test('the difference against the definition that is live in PROD is exactly the paths of the phase', () => {
  const comparison = port.compare(live, candidate);
  assert.ok(comparison.changedPathCount > 0);
  for (const changed of comparison.changedPaths) {
    assert.ok(port.ALLOWED.some(prefix => changed === prefix || changed.startsWith(prefix + '.')), changed);
  }
  for (const allowed of port.ALLOWED) {
    assert.ok(comparison.changedPaths.some(changed => changed === allowed || changed.startsWith(allowed + '.')), allowed);
  }
});

test('the parameters of the environment are the ones of PROD', () => {
  const parametros = candidate.definition.parameters;
  assert.equal(parametros['E2E_ListaRolesUsuario (cr435_E2E_ListaRolesUsuario)'].defaultValue, 'b15bcf7c-b994-4e58-a541-61a9ebc160f0');
  assert.equal(parametros['E2E_ListaExpedientesJSON (cr435_E2E_ListaExpedientesJSON)'].defaultValue, 'e5076497-ce45-41f1-852e-75deda0938db');
  assert.equal(parametros['E2E_ListaHitos (cr435_E2E_ListaHitos)'].defaultValue, 'bd50b05b-0d5d-4226-9638-3f25f6cbb100');
  assert.equal(parametros['E2E_ConexionEntorno (cr435_E2E_ConexionEntorno)'].defaultValue, 'https://telefonicacorp.sharepoint.com/sites/DyS350.prod.OCETF');
});

test('the authentication of the actions is the one of PROD', () => {
  assert.ok(candidate.removedAuthenticationBlocks > 0);
  const texto = JSON.stringify(candidate.definition);
  assert.doesNotMatch(texto, /X-MS-APIM-Tokens/);
});

test('the candidate is deterministic', () => {
  const again = port.prepare(live, source);
  assert.equal(port.definitionHash(again.definition), port.definitionHash(candidate.definition));
});

test('the outputs stay inside the ignored subtree', () => {
  assert.throws(() => port.validateDestination(path.resolve(__dirname, '../../docs/probe.json')), /ignored candidate subtree/);
});
