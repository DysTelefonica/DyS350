const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const baseline = require('./baseline.json');
const { guard, titleExpression, branch } = require('./prepare.cjs');
const { prepare, prepareSource, certSite } = require('./runtime-harness.cjs');

function source() {
  const update = structuredClone(baseline.update);
  update.inputs.parameters['item/Title'] = titleExpression;
  return { $schema: 'test-schema', contentVersion: '1.0.0.0', parameters: {
    $connections: { type: 'Object', defaultValue: {} },
    'E2E_ConexionEntorno (cr435_E2E_ConexionEntorno)': { type: 'String', defaultValue: certSite, metadata: { schemaName: 'cr435_E2E_ConexionEntorno' } },
    'E2E_ListaExpedientes (cr435_E2E_ListaExpedientes)': { type: 'String', defaultValue: 'd38eb17e-6b71-4100-85ab-26442190fb7f', metadata: { schemaName: 'cr435_E2E_ListaExpedientes' } }
  }, actions: { 'Try_-_Procesar_ExpedientesJSON': { actions: { Existe_ExpedienteJSON: { actions: {
    Obtener_Expediente_del_Sistema: structuredClone(baseline.lookup),
    Validate_Expediente_Title_Sync: structuredClone(guard),
    Expediente_ya_Aprovisionado: { type: 'If', expression: structuredClone(baseline.condition),
      runAfter: { Validate_Expediente_Title_Sync: ['Succeeded'] }, else: { actions: {} },
      actions: { Actualizar_Expediente_Sistema: update } }
  } } } } } };
}

function config(definition = source()) {
  const names = Object.keys(branch(definition).Expediente_ya_Aprovisionado.actions.Actualizar_Expediente_Sistema.inputs.parameters)
    .filter(key => key.startsWith('item/')).map(key => key.slice(5));
  return {
    testList: { siteUrl: certSite, title: 'TitleSyncTest_20261103_review', id: '11111111-2222-3333-4444-555555555555' },
    connectionReferences: { shared_sharepointonline: { connectionName: 'existing-reviewed-reference', apiName: 'shared_sharepointonline' } },
    fields: ['IDExpediente', ...names].map(InternalName => ({ InternalName,
      TypeAsString: InternalName === 'IDExpediente' ? 'Number' : InternalName === 'CadenaPecal' ? 'Boolean' : 'Text', MaxLength: 255 }))
  };
}

test('copies exact guard, condition and all 36 update mappings; only lookup dependency changes', () => {
  const original = source();
  const before = structuredClone(original);
  const settings = config();
  const output = prepare(original, settings);
  assert.deepEqual(original, before);
  const copied = output.definition.actions;
  assert.deepEqual(copied.Validate_Expediente_Title_Sync, branch(original).Validate_Expediente_Title_Sync);
  assert.deepEqual(copied.Expediente_ya_Aprovisionado, branch(original).Expediente_ya_Aprovisionado);
  const expectedLookup = structuredClone(branch(original).Obtener_Expediente_del_Sistema);
  expectedLookup.runAfter = { INI_ArrayResponsables: ['Succeeded'] };
  assert.deepEqual(copied.Obtener_Expediente_del_Sistema, expectedLookup);
  assert.equal(Object.keys(output.expectedFields).length, 37);
  assert.equal(output.cases.length, 7);
  assert(output.cases.every(item => item.plannedOnly));
  assert.deepEqual(output.connectionReferences, settings.connectionReferences);
  assert.equal(Object.keys(copied).length, 5);
  assert.equal(output.preseed.Title.includes('OLD'), true);
  assert.equal(output.expectedFields.Title.includes('NEW'), true);
  for (const [name, parameter] of Object.entries(output.definition.parameters)) {
    if (name !== '$connections') assert.equal(Object.hasOwn(parameter, 'metadata'), false);
  }
  assert.equal(output.expectedFields.CodProyecto, 'TEST CodProyecto');
  assert.equal(output.expectedFields.CodExp, 'TEST CodExp');
});

for (const [name, mutate] of [
  ['wrong site', c => { c.testList.siteUrl = 'https://example.com'; }],
  ['business list', c => { c.testList.id = 'd38eb17e-6b71-4100-85ab-26442190fb7f'; }],
  ['nonisolated title', c => { c.testList.title = 'Expedientes'; }],
  ['missing field', c => { c.fields.pop(); }],
  ['person field', c => { c.fields[1].TypeAsString = 'User'; }],
  ['extra connector', c => { c.connectionReferences.dataverse = {}; }],
  ['credential', c => { c.connectionReferences.shared_sharepointonline.token = 'do-not-save'; }],
  ['unknown override', c => { c.fieldValues = { Unmapped: 'TEST' }; }]
]) test('fails closed: ' + name, () => { const c = config(); mutate(c); assert.throws(() => prepare(source(), c)); });

test('refuses drifted source bytes before reading config or creating outputs', () => {
  assert.throws(() => prepareSource(Buffer.from('{}'), {}), /fingerprint/);
});

test('accepts live metadata wrapper and discloses Text/boolean coercion without editing mapping', () => {
  const c = config();
  c.fields.find(field => field.InternalName === 'CadenaPecal').TypeAsString = 'Text';
  c.fields = { site: certSite, sourceList: { Id: 'd38eb17e-6b71-4100-85ab-26442190fb7f', BaseTemplate: 100 }, fields: c.fields };
  const output = prepare(source(), c);
  assert.equal(output.preseed.CadenaPecal, 'false');
  assert.deepEqual(output.cases[0].payload.pecal, []);
  assert(output.representationChecks.some(note => note.includes('boolean false')));
  const title = c.fields.fields.find(field => field.InternalName === 'Title');
  delete title.MaxLength;
  title.SchemaXml = '<Field MaxLength="4" />';
  assert.throws(() => prepare(source(), c), /MaxLength/);
});

test('actual reviewed DEV candidate uses the same scoped copy boundary', {
  skip: !process.env.FLOW_HARNESS_DEFINITION_PATH
}, () => {
  const raw = fs.readFileSync(process.env.FLOW_HARNESS_DEFINITION_PATH);
  const definition = JSON.parse(raw.toString('utf8'));
  const output = prepareSource(raw, config(definition));
  assert.deepEqual(output.definition.actions.Expediente_ya_Aprovisionado, branch(definition).Expediente_ya_Aprovisionado);
  for (const name of ['E2E_ConexionEntorno (cr435_E2E_ConexionEntorno)', 'E2E_ListaExpedientes (cr435_E2E_ListaExpedientes)']) {
    assert(definition.parameters[name].metadata.schemaName, 'Real source must exercise metadata-bearing parameters');
    assert.equal(Object.hasOwn(output.definition.parameters[name], 'metadata'), false);
  }
});
