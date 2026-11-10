const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const { prepareSource, branch, guard, guardName, titleExpression } = require('./prepare.cjs');
const { prepareDevSource, assertDevSite, siteParameter, expectedSiteDefault } = require('./prepare-dev.cjs');

test('DEV source boundary refuses arbitrary bytes', () => {
  assert.throws(() => prepareDevSource(Buffer.from('{}')), /DEV source fingerprint changed/);
});

test('DEV site precondition accepts only the reviewed CERT default', () => {
  assertDevSite({ parameters: { [siteParameter]: { defaultValue: expectedSiteDefault } } });
  for (const site of [undefined, 'https://example.invalid/sites/dev',
    'https://telefonicacorp.sharepoint.com/sites/DyS350.prod.OCETF']) {
    assert.throws(() => assertDevSite({ parameters: { [siteParameter]: { defaultValue: site } } }),
      /DEV site default changed/);
  }
  assert.throws(() => assertDevSite({}), /DEV site default changed/);
});

const devPath = process.env.FLOW_DEV_DEFINITION_PATH;
test('actual reviewed DEV snapshot preserves every unrelated DEV field', { skip: !devPath }, () => {
  const raw = fs.readFileSync(devPath);
  const input = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, ''));
  const before = structuredClone(input);
  const output = prepareDevSource(raw);
  const actions = branch(output);
  assert.deepEqual(input, before, 'DEV input mutated');
  assert.deepEqual(actions[guardName], guard);
  assert.deepEqual(actions.Expediente_ya_Aprovisionado.runAfter, { [guardName]: ['Succeeded'] });
  assert.equal(actions.Expediente_ya_Aprovisionado.actions.Actualizar_Expediente_Sistema
    .inputs.parameters['item/Title'], titleExpression);

  const systemSchema = output.actions['Try_-_Procesar_ExpedientesJSON']
    .actions.Obtener_ExpedientesSistema.inputs.schema;
  assert(systemSchema.items.required.includes('{Thumbnail}'));
  assert.equal(systemSchema.items.required.length, 24);
  for (const name of ['INI_ContadorTotal', 'INI_ContadorFallidos', 'INI_ContadorNuevos', 'INI_ContadorActualizados']) {
    assert(!Object.hasOwn(output.actions[name].inputs.variables[0], 'value'));
  }
  const roles = actions.Comprobar_que_hay_RolesUsuario.actions;
  assert(!Object.hasOwn(roles, 'Responsable_Seguridad_no_vacio_1'));
  assert(Object.hasOwn(roles.Por_cada_Responsable_2.actions, 'Responsable_Seguridad_no_vacio_1'));
  assertDevSite(output);

  delete actions[guardName];
  actions.Expediente_ya_Aprovisionado.runAfter = structuredClone(branch(input).Expediente_ya_Aprovisionado.runAfter);
  delete actions.Expediente_ya_Aprovisionado.actions.Actualizar_Expediente_Sistema.inputs.parameters['item/Title'];
  assert.deepEqual(output, input, 'Unrelated DEV settings or logic changed');
});

test('PRO entry point still refuses actual DEV bytes', { skip: !devPath }, () => {
  assert.throws(() => prepareSource(fs.readFileSync(devPath)), /Source fingerprint changed/);
});

test('DEV refuses changed bindings, unrelated source drift and already patched bytes', { skip: !devPath }, () => {
  const raw = fs.readFileSync(devPath);
  const input = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, ''));
  const bindingDrift = structuredClone(input);
  bindingDrift.parameters[siteParameter].defaultValue = 'https://example.invalid/sites/other';
  assert.throws(() => prepareDevSource(Buffer.from(JSON.stringify(bindingDrift))), /DEV source fingerprint changed/);
  const logicDrift = structuredClone(input);
  logicDrift.actions.unreviewedAction = { type: 'Compose', inputs: 'drift' };
  assert.throws(() => prepareDevSource(Buffer.from(JSON.stringify(logicDrift))), /DEV source fingerprint changed/);
  assert.throws(() => prepareDevSource(Buffer.concat([raw, Buffer.from('\n')])), /DEV source fingerprint changed/);
  assert.throws(() => prepareDevSource(Buffer.from(JSON.stringify(prepareDevSource(raw)))), /DEV source fingerprint changed/);
});

test('DEV entry point refuses actual PRO bytes', { skip: !process.env.FLOW_DEFINITION_PATH }, () => {
  assert.throws(() => prepareDevSource(fs.readFileSync(process.env.FLOW_DEFINITION_PATH)), /DEV source fingerprint changed/);
});
