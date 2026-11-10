// Offline review preparation. No network, deployment, list creation or execution.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { branch, guard, titleExpression } = require('./prepare.cjs');

const sourceSha256 = '0c22186ce4b424c06d54418ab2de91a46c3a8e5c0f02199f9811dfbde43a2432';
const certSite = 'https://telefonicacorp.sharepoint.com/sites/DyS350.cert.OCETF';
const siteParameter = 'E2E_ConexionEntorno (cr435_E2E_ConexionEntorno)';
const listParameter = 'E2E_ListaExpedientes (cr435_E2E_ListaExpedientes)';
const businessId = 2026110301;
const newTitle = 'TEST Title Sync 2026-11-03 — NEW full project title';
const oldTitle = 'TEST Title Sync 2026-11-03 — OLD full project title';
const clone = value => structuredClone(value);
const sha256 = value => createHash('sha256').update(value).digest('hex');

function fieldsArray(input) {
  const fields = input?.fields || input?.value || input?.d?.results || input;
  assert(Array.isArray(fields), 'fields must be a live metadata array/value/d.results');
  assert.equal(new Set(fields.map(field => field.InternalName)).size, fields.length, 'Duplicate field definitions');
  return new Map(fields.map(field => {
    const maximum = /\bMaxLength="(\d+)"/.exec(field.SchemaXml || '');
    return [field.InternalName, { ...field, MaxLength: field.MaxLength || (maximum ? Number(maximum[1]) : undefined) }];
  }));
}

function fieldValue(field, override) {
  assert(field && !field.ReadOnlyField, 'Missing or read-only mapped field');
  const type = field.TypeAsString;
  assert(['Text', 'Note', 'Choice', 'Number', 'Currency', 'Integer', 'Boolean', 'DateTime'].includes(type),
    'Unsupported fixture field type: ' + type);
  const choices = field.Choices?.results || field.Choices || [];
  let value = override;
  if (value === undefined) {
    if (['Number', 'Currency', 'Integer'].includes(type)) value = 0;
    else if (type === 'Boolean') value = false;
    else if (type === 'DateTime') value = '2026-11-03T00:00:00Z';
    else if (type === 'Choice') value = choices[0];
    else value = 'TEST ' + field.InternalName;
  }
  assert(value !== undefined && value !== null, 'Fixture values must be explicit and nonnull: ' + field.InternalName);
  if (['Number', 'Currency', 'Integer'].includes(type)) {
    assert(typeof value === 'number' && Number.isFinite(value), 'Invalid number: ' + field.InternalName);
    if (type === 'Integer') assert(Number.isInteger(value), 'Invalid integer');
    if (field.MinimumValue !== undefined) assert(value >= field.MinimumValue, 'Below field minimum');
    if (field.MaximumValue !== undefined) assert(value <= field.MaximumValue, 'Above field maximum');
  } else if (type === 'Boolean') assert.equal(typeof value, 'boolean');
  else {
    assert.equal(typeof value, 'string');
    if (field.MaxLength) assert(value.length <= field.MaxLength, 'Text exceeds MaxLength: ' + field.InternalName);
    if (type === 'Choice') assert(choices.includes(value), 'Choice not allowed: ' + field.InternalName);
    if (type === 'DateTime') assert(/^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)), 'Invalid date');
  }
  return value;
}

function prepare(definition, config) {
  const list = config.testList;
  assert.equal(list?.siteUrl, certSite, 'Only the exact reviewed CERT site is allowed');
  assert(/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(list.id), 'Invalid test-list GUID');
  assert(/^TitleSyncTest_20261103_[a-z\d_-]+$/i.test(list.title), 'Dedicated test-list title required');
  for (const parameter of Object.values(definition.parameters)) {
    assert(String(parameter.defaultValue).toLowerCase() !== list.id.toLowerCase(), 'Existing business-list GUID refused');
  }
  const refs = config.connectionReferences;
  assert.deepEqual(Object.keys(refs || {}), ['shared_sharepointonline'], 'Only the existing SharePoint reference is allowed');
  assert(refs.shared_sharepointonline && typeof refs.shared_sharepointonline === 'object', 'Missing SharePoint reference');
  assert(!/token|password|authorization|secret/i.test(JSON.stringify(refs)), 'Do not supply credentials');

  const original = branch(definition);
  assert.deepEqual(original.Validate_Expediente_Title_Sync, guard, 'Saved guard changed');
  const lookup = clone(original.Obtener_Expediente_del_Sistema);
  const condition = clone(original.Expediente_ya_Aprovisionado);
  assert.deepEqual(Object.keys(condition.actions), ['Actualizar_Expediente_Sistema']);
  assert.deepEqual(condition.else, { actions: {} });
  const update = condition.actions.Actualizar_Expediente_Sistema;
  assert.equal(update.inputs.parameters['item/Title'], titleExpression);
  assert.equal(lookup.inputs.host.operationId, 'GetItems');
  assert.equal(update.inputs.host.operationId, 'PatchItem');
  for (const action of [lookup, update]) {
    assert.equal(action.inputs.host.connectionName, 'shared_sharepointonline');
    assert.equal(action.inputs.parameters.dataset, `@parameters('${siteParameter}')`);
    assert.equal(action.inputs.parameters.table, `@parameters('${listParameter}')`);
  }
  // Only this copied action dependency changes; connector bindings change via parameters.
  lookup.runAfter = { INI_ArrayResponsables: ['Succeeded'] };
  const fields = fieldsArray(config.fields);
  if (config.fields?.sourceList) {
    assert.equal(config.fields.site, certSite, 'Field metadata must come from reviewed CERT site');
    assert.equal(config.fields.sourceList.Id.toLowerCase(), definition.parameters[listParameter].defaultValue.toLowerCase(),
      'Field metadata source-list mismatch');
    assert.equal(config.fields.sourceList.BaseTemplate, 100, 'Expected generic source list');
  }
  const expected = { IDExpediente: fieldValue(fields.get('IDExpediente'), businessId) };
  const incoming = { idexpediente: businessId };
  const overrides = config.fieldValues || {};
  const mapped = Object.entries(update.inputs.parameters).filter(([key]) => key.startsWith('item/'));
  assert.equal(mapped.length, 36, 'Expected exactly 36 copied field mappings');
  assert(Object.keys(overrides).every(key => mapped.some(([name]) => name === 'item/' + key)), 'Unknown field override');
  for (const [index, [key, expression]] of mapped.entries()) {
    const name = key.slice(5);
    const field = fields.get(name);
    if (name === 'Title') expected[name] = fieldValue(field, newTitle);
    else if (name === 'Miembros') expected[name] = fieldValue(field, '');
    else if (name === 'CadenaPecal') {
      // The live destination column is Text but the unchanged expression returns
      // boolean false. Its actual connector coercion is an explicit runtime check.
      expected[name] = fieldValue(field, field?.TypeAsString === 'Text' ? 'false' : false);
      incoming.pecal = [];
    } else {
      const match = /^@body\('ExpedienteJSON'\)\?\['([^']+)'\](?:\?\['([^']+)'\])?$/.exec(expression);
      assert(match, 'Unknown mapping must be reviewed: ' + key);
      let sentinel = overrides[name];
      if (sentinel === undefined && ['Number', 'Currency', 'Integer'].includes(field?.TypeAsString)) sentinel = 101 + index;
      if (sentinel === undefined && field?.TypeAsString === 'DateTime') {
        sentinel = new Date(Date.UTC(2026, 8, 1 + index)).toISOString().replace('.000Z', 'Z');
      }
      const value = fieldValue(field, sentinel);
      expected[name] = value;
      if (match[2]) (incoming[match[1]] ||= {})[match[2]] = value;
      else incoming[match[1]] = value;
    }
  }
  incoming.titulo = newTitle;
  const parameters = {};
  for (const name of ['$connections', siteParameter, listParameter]) {
    parameters[name] = clone(definition.parameters[name]);
    assert(parameters[name], 'Missing source parameter: ' + name);
  }
  parameters[siteParameter].defaultValue = certSite;
  parameters[listParameter].defaultValue = list.id;
  // Detach these local harness constants from the business environment-variable
  // schema names. The copied connector actions retain their exact expressions.
  delete parameters[siteParameter].metadata;
  delete parameters[listParameter].metadata;
  const harness = {
    $schema: definition.$schema, contentVersion: definition.contentVersion,
    parameters,
    triggers: { manual: { type: 'Request', kind: 'Button', inputs: { schema: {
      type: 'object', properties: { text: { type: 'string', title: 'Fixture JSON', 'x-ms-content-hint': 'TEXT', 'x-ms-dynamically-added': true } },
      required: ['text']
    } } } },
    actions: {
      ExpedienteJSON: { type: 'ParseJson', runAfter: {}, inputs: {
        content: "@json(triggerBody()?['text'])",
        schema: { type: 'object', required: ['idexpediente'], properties: { idexpediente: { type: 'integer' } } }
      } },
      INI_ArrayResponsables: { type: 'InitializeVariable', runAfter: { ExpedienteJSON: ['Succeeded'] },
        inputs: { variables: [{ name: 'ArrayResponsables', type: 'string', value: '' }] } },
      Obtener_Expediente_del_Sistema: lookup,
      Validate_Expediente_Title_Sync: clone(original.Validate_Expediente_Title_Sync),
      Expediente_ya_Aprovisionado: condition
    }, outputs: {}
  };
  const absent = clone(incoming);
  delete absent.titulo;
  const cases = [
    ['corrected', incoming, 'Succeeded', newTitle],
    ['repeat', clone(incoming), 'Succeeded', newTitle],
    ['blank', { ...incoming, titulo: ' \t ' }, 'Succeeded', newTitle],
    ['null', { ...incoming, titulo: null }, 'Succeeded', newTitle],
    ['absent', absent, 'Succeeded', newTitle],
    ['invalid-type', { ...incoming, titulo: 7 }, 'Failed', newTitle],
    ['no-match', { ...incoming, idexpediente: businessId + 1 }, 'Succeeded', null]
  ].map(([name, payload, expectedRunStatus, expectedTitle]) => ({
    name, payload, triggerBody: { text: JSON.stringify(payload) }, expectedRunStatus, expectedTitle,
    plannedOnly: true
  }));
  return {
    scope: 'SCOPED SharePoint/WDL boundary, NOT Module1 end-to-end; no cloud operation performed',
    sourceSha256, testList: clone(list), definition: harness, connectionReferences: clone(refs),
    preseed: { ...expected, Title: fieldValue(fields.get('Title'), oldTitle) }, expectedFields: expected,
    cases,
    substitutions: ['CERT site/test-list parameter values; business environment-variable metadata removed', 'lookup runAfter -> INI_ArrayResponsables',
      'manual JSON text input/ExpedienteJSON + empty ArrayResponsables dependencies'],
    omitted: ['staging writes', 'Dataverse', 'roles/group/security', 'provisioning', 'original catch/response branches'],
    representationChecks: ['Preseed values are planned: independently GET persisted rows before/after every case.',
      'Before execution independently verify effective saved site/list parameters equal CERT and the new test GUID, with no wrapper overrides.',
      'Compare all 35 non-Title mapped columns plus IDExpediente by exact raw persisted before/after values; record missing versus null explicitly; no silent normalization.',
      'CadenaPecal Text receives original boolean false expression; verify exact persisted representation and report any drift.',
      'Miembros empty text may persist as null. Compare actual persisted before/after, not unobserved JSON literals.',
      'DateTime comparisons must disclose any connector/timezone representation difference.'],
    cleanup: 'Inventory and remove only the isolated test flow/list/rows after explicit parent review; no cleanup code included.'
  };
}

function prepareSource(raw, config) {
  assert.equal(sha256(raw), sourceSha256, 'Exact reviewed DEV candidate fingerprint required');
  return prepare(JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, '')), config);
}

if (require.main === module) {
  try {
    const [, , input, configPath, output] = process.argv;
    assert(input && configPath && output && process.argv.length === 5,
      'Usage: node runtime-harness.cjs candidate.json reviewed-config.json ignored-output.json');
    const allowed = path.resolve(__dirname, '../../.atl/project-title-sync/live-test-20261103') + path.sep;
    assert(path.resolve(output).startsWith(allowed), 'Output must stay in ignored dated evidence directory');
    const result = prepareSource(fs.readFileSync(input), JSON.parse(fs.readFileSync(configPath, 'utf8')));
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log('LOCAL REVIEW ONLY. No cloud operation performed. Output SHA-256: ' + sha256(fs.readFileSync(output)));
  } catch (error) {
    console.error('Harness preparation refused: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = { prepare, prepareSource, sourceSha256, certSite, businessId };
