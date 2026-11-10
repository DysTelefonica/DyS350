// Offline preparation only: never imports, saves, enables or executes a cloud flow.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const baseline = require('./baseline.json');

const guardName = 'Validate_Expediente_Title_Sync';
const titleExpression = "@if(empty(trim(coalesce(body('ExpedienteJSON')?['titulo'], ''))), first(outputs('Obtener_Expediente_del_Sistema')?['body/value'])?['Title'], body('ExpedienteJSON')?['titulo'])";
const guard = {
  type: 'ParseJson',
  runAfter: { Obtener_Expediente_del_Sistema: ['Succeeded'] },
  inputs: {
    content: {
      incoming: "@body('ExpedienteJSON')",
      existing: "@outputs('Obtener_Expediente_del_Sistema')?['body/value']"
    },
    schema: {
      type: 'object', required: ['incoming', 'existing'],
      properties: {
        incoming: {
          type: 'object',
          properties: {
            titulo: { type: ['string', 'null'] }
          }
        },
        existing: {
          type: 'array', maxItems: 1,
          items: {
            type: 'object',
            properties: {
              Title: { type: ['string', 'null'] }
            }
          }
        }
      }
    }
  }
};

function branch(definition) {
  return definition.actions['Try_-_Procesar_ExpedientesJSON']
    .actions.Existe_ExpedienteJSON.actions;
}

function prepare(definition) {
  const original = branch(definition);
  const provisioned = original.Expediente_ya_Aprovisionado;
  assert(!Object.hasOwn(original, guardName), 'Already patched: review instead of stacking patches');
  assert.equal(provisioned.type, 'If');
  assert.deepEqual(original.Obtener_Expediente_del_Sistema, baseline.lookup, 'Lookup changed');
  assert.deepEqual(provisioned.expression, baseline.condition, 'Existing-record condition changed');
  assert.deepEqual(provisioned.runAfter, baseline.conditionRunAfter, 'Dependencies changed');
  assert.deepEqual(Object.keys(provisioned.actions), ['Actualizar_Expediente_Sistema']);
  assert.deepEqual(provisioned.else, { actions: {} }, 'New/unprovisioned path changed');
  assert.deepEqual(provisioned.actions.Actualizar_Expediente_Sistema, baseline.update, 'Update changed');
  assert.deepEqual(definition.actions['Catch_-_Procesar_ExpedientesJSON'].runAfter,
    baseline.catchRunAfter, 'Error handling changed');
  assert.equal(original.Actualizar_ExpedienteJSON.inputs.parameters['item/Title'],
    "@body('ExpedienteJSON')?['titulo']", 'Incoming title mapping changed');
  const result = structuredClone(definition);
  const actions = branch(result);
  actions[guardName] = structuredClone(guard);
  actions.Expediente_ya_Aprovisionado.runAfter = { [guardName]: ['Succeeded'] };
  actions.Expediente_ya_Aprovisionado.actions.Actualizar_Expediente_Sistema
    .inputs.parameters['item/Title'] = titleExpression;
  return result;
}

function prepareSource(raw) {
  // Hash exact bytes, including any BOM; never silently rebaseline a fresh export.
  const fingerprint = createHash('sha256').update(raw).digest('hex');
  assert.equal(fingerprint, baseline.sourceSha256,
    'Source fingerprint changed: compare and review a new baseline before preparation');
  const definition = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, ''));
  return prepare(definition);
}

if (require.main === module) {
  try {
    const [, , input, output] = process.argv;
    assert(input && output && process.argv.length === 4, 'Usage: node prepare.cjs input.definition.json output.definition.json');
    const allowed = path.resolve(__dirname, '../../.atl/project-title-sync') + path.sep;
    assert(path.resolve(output).startsWith(allowed), 'Output must stay in ignored .atl/project-title-sync/');
    const raw = fs.readFileSync(input);
    const result = prepareSource(raw);
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log('LOCAL REVIEW ONLY. No cloud operation performed.');
    console.log('Input SHA-256: ' + createHash('sha256').update(raw).digest('hex'));
  } catch (error) {
    console.error('Preparation refused: ' + error.message);
    process.exitCode = 1;
  }
}

// prepare() is the structural transformation for unit tests; the CLI always uses
// prepareSource() so source fingerprint verification cannot be skipped there.
module.exports = { prepareSource, prepare, branch, guard, guardName, titleExpression };
