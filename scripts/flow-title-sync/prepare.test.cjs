const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const baseline = require('./baseline.json');
const { prepareSource, prepare, branch, guard, guardName, titleExpression } = require('./prepare.cjs');

// Synthetic envelope containing the real reviewed action excerpts; not a cloud export.
function fixture() {
  return { actions: {
    'Try_-_Procesar_ExpedientesJSON': { type: 'Scope', actions: {
      Existe_ExpedienteJSON: { type: 'If', else: { untouched: 'new expediente' }, actions: {
        Obtener_Expediente_del_Sistema: structuredClone(baseline.lookup),
        Actualizar_ExpedienteJSON: { inputs: { parameters: {
          'item/Title': "@body('ExpedienteJSON')?['titulo']"
        } } },
        Expediente_ya_Aprovisionado: {
          type: 'If', expression: structuredClone(baseline.condition),
          runAfter: structuredClone(baseline.conditionRunAfter), else: { actions: {} },
          actions: { Actualizar_Expediente_Sistema: structuredClone(baseline.update) }
        },
        downstream: { runAfter: { Expediente_ya_Aprovisionado: ['Succeeded'] } }
      } }
    } },
    'Catch_-_Procesar_ExpedientesJSON': { runAfter: structuredClone(baseline.catchRunAfter) },
    unrelated: { preserved: [false, 42, { folder: 'do-not-touch' }] }
  } };
}

// Deliberately bounded schema harness, NOT a Power Automate/WDL runtime.
function validate(schema, value) {
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' :
    Number.isInteger(value) ? 'integer' : typeof value;
  assert([].concat(schema.type).includes(type), 'Schema type mismatch');
  if (type === 'array') {
    if (schema.maxItems !== undefined) assert(value.length <= schema.maxItems, 'Duplicate IDExpediente');
    value.forEach(item => validate(schema.items, item));
  }
  if (type === 'object') {
    for (const key of schema.required || []) assert(Object.hasOwn(value, key), 'Missing ' + key);
    for (const [key, spec] of Object.entries(schema.properties || {})) {
      if (Object.hasOwn(value, key)) validate(spec, value[key]);
    }
  }
}

function simulate(incoming, existing) {
  validate(guard.inputs.schema, { incoming, existing });
  if (existing.length === 0) return undefined; // Existing provisioning condition remains false.
  return (incoming.titulo ?? '').trim().length === 0 ? (existing[0].Title ?? null) : incoming.titulo;
}
const row = { ID: 56, IDExpediente: 1205, Title: 'Old full project title', Folder: 'unchanged' };

test('only adds guard, rewires its condition, and adds Title to existing PatchItem', () => {
  const input = fixture();
  const before = structuredClone(input);
  const output = prepare(input);
  const actions = branch(output);
  assert.deepEqual(input, before, 'Input mutated');
  assert.deepEqual(actions[guardName], guard);
  assert.deepEqual(actions.Expediente_ya_Aprovisionado.runAfter, { [guardName]: ['Succeeded'] });
  assert.equal(actions.Expediente_ya_Aprovisionado.actions.Actualizar_Expediente_Sistema
    .inputs.parameters['item/Title'], titleExpression);
  delete actions[guardName];
  actions.Expediente_ya_Aprovisionado.runAfter = structuredClone(baseline.conditionRunAfter);
  delete actions.Expediente_ya_Aprovisionado.actions.Actualizar_Expediente_Sistema.inputs.parameters['item/Title'];
  assert.deepEqual(output, before, 'Unrelated branches or existing mappings changed');
});

for (const [label, mutate] of [
  ['wrong list', d => { branch(d).Obtener_Expediente_del_Sistema.inputs.parameters.table = 'wrong'; }],
  ['wrong match key', d => { branch(d).Obtener_Expediente_del_Sistema.inputs.parameters.$filter = 'ID eq 1205'; }],
  ['changed update', d => { branch(d).Expediente_ya_Aprovisionado.actions.Actualizar_Expediente_Sistema.inputs.parameters.id = '1205'; }],
  ['changed catch', d => { d.actions['Catch_-_Procesar_ExpedientesJSON'].runAfter = {}; }],
  ['extra action', d => { branch(d).Expediente_ya_Aprovisionado.actions.unreviewed = {}; }],
  ['missing scope', d => { delete d.actions['Try_-_Procesar_ExpedientesJSON']; }]
]) test('fails closed: ' + label, () => { const d = fixture(); mutate(d); assert.throws(() => prepare(d)); });

test('already patched source is refused', () => assert.throws(() => prepare(prepare(fixture()))));
test('CLI preparation refuses unreviewed upstream/environment source bytes', () => {
  const input = fixture();
  input.environment = 'unreviewed';
  assert.throws(() => prepareSource(Buffer.from(JSON.stringify(input))), /Source fingerprint changed/);
});
test('valid full title is copied verbatim; repeat is value-idempotent', () => {
  const incoming = { idexpediente: 1205, titulo: 'Full title: intercambio de voz, imágenes y vídeo' };
  const next = simulate(incoming, [row]);
  assert.equal(next, incoming.titulo);
  assert.equal(simulate(incoming, [{ ...row, Title: next }]), next);
  assert.equal(row.Title, 'Old full project title');
});
for (const value of [undefined, null, '', ' \t\n ']) {
  test('blank/missing title preserves current name: ' + String(value), () => {
    const incoming = { idexpediente: 1205 };
    if (value !== undefined) incoming.titulo = value;
    assert.equal(simulate(incoming, [row]), row.Title);
  });
}
for (const titulo of [123, false, {}, []]) test('invalid title type cannot reach update: ' + JSON.stringify(titulo), () => {
  assert.throws(() => simulate({ idexpediente: 1205, titulo }, [row]));
});
test('duplicate system business IDs fail before first() update', () => {
  assert.throws(() => simulate({ idexpediente: 1205, titulo: 'Updated' }, [row, { ...row, ID: 57 }]));
});
test('no provisioned record does not create one', () => {
  assert.equal(simulate({ idexpediente: 1205, titulo: 'Updated' }, []), undefined);
});
test('valid title repairs null/missing destination Title', () => {
  assert.equal(simulate({ titulo: 'Corrected full name' }, [{ ...row, Title: null }]), 'Corrected full name');
  const missingTitle = { ID: 56, IDExpediente: 1205 };
  assert.equal(simulate({ titulo: 'Corrected full name' }, [missingTitle]), 'Corrected full name');
});
test('nonblank title is preserved verbatim rather than trimmed', () => {
  assert.equal(simulate({ titulo: '  Full corrected name  ' }, [row]), '  Full corrected name  ');
});
test('blank source preserves null destination rather than inventing an empty string', () => {
  assert.equal(simulate({ titulo: '  ' }, [{ ...row, Title: null }]), null);
  assert.equal(simulate({}, [{ ID: 56 }]), null); // Missing WDL optional property resolves to null.
});
test('guard does not impose unrelated business ID validation', () => {
  assert.equal(simulate({ titulo: 'Updated' }, [{ Title: 'Old' }]), 'Updated');
  assert.equal(simulate({ idexpediente: 'external-value', titulo: 'Updated' }, [row]), 'Updated');
});

if (process.env.FLOW_DEFINITION_PATH) test('optional actual snapshot: same three changes only', () => {
  const raw = fs.readFileSync(process.env.FLOW_DEFINITION_PATH);
  const input = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, ''));
  const output = prepareSource(raw);
  const actions = branch(output);
  delete actions[guardName];
  actions.Expediente_ya_Aprovisionado.runAfter = structuredClone(baseline.conditionRunAfter);
  delete actions.Expediente_ya_Aprovisionado.actions.Actualizar_Expediente_Sistema.inputs.parameters['item/Title'];
  assert.deepEqual(output, input);
  const drift = structuredClone(input);
  drift.actions.unreviewedEnvironmentChange = { type: 'Compose', inputs: 'drift' };
  assert.throws(() => prepareSource(Buffer.from(JSON.stringify(drift))), /Source fingerprint changed/);
});
