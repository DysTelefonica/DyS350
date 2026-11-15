'use strict';
// Offline candidate preparation only: no authentication, cloud client, upload or deployment.
// Builds the seventh phase on top of the published centralized mapping (84FABEA2):
//
// The log of an ingestion says what changed: the field, the value it had and the value it has.
//
// The comparison is between the row of the staging list as it was BEFORE the write and the same
// row as it is AFTER the write. Both sides are read from SharePoint, so both sides are the value
// that SharePoint keeps: a date is the datetime of the day, a boolean is the text of the list, a
// member list is the text of the list and a number is the number of the list. The comparison does
// not have to guess how SharePoint normalizes a value, and it only uses functions that cannot
// fail on an empty value, so a mistake in the comparison can never break the ingestion.
//
// Both sides are read from the list: the side BEFORE just before the write and the side AFTER
// once the write is done. Both reads point at the same item: the one the write patches.
//
// The trace is written in CHUNKS. The platform accepts at most 8,192 characters per expression
// ("Characters per expression" of the flow definition limits) and the comparison of the thirty
// seven columns of the write is longer than that, so one expression for the whole trace would be
// refused when the flow is saved. The comparison is split into several expressions, each one below
// the limit, and the log concatenates them.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { dependencyCycles } = require('./prepare-role-scoped-delete.cjs');

const TABLE = require('./mapping-table.json');

const BASE_PATH = path.resolve(__dirname, '../../.atl/project-title-sync/centralized-mapping-20261115/candidate-definition.json');
const BASE_DEFINITION_HASH = '84FABEA2E991D95BE867A063DDEF73C0F0D76626BEF1735C8A3B4B8D4629213A';
const DIRECTORY = path.resolve(__dirname, '../../.atl/project-title-sync/change-trace-20261115');
const OUTPUTS = ['candidate-definition.json', 'candidate-comparison.json'];

const TRY = 'Try_-_Procesar_ExpedientesJSON';
const EXISTS = 'Existe_ExpedienteJSON';
const BRANCH = `actions.${TRY}.actions.${EXISTS}.actions`;
const BEFORE_ACTION = 'Leer_ExpedienteJSON_Antes';
const AFTER_ACTION = 'Leer_ExpedienteJSON_Despues';
const TRACE_ACTION = 'Calcular_Cambios';
const LOG_ACTION = 'Log_Actualizando_Expediente';
const PATCH_ACTION = 'Actualizar_ExpedienteJSON';
const PREVIOUS_ACTION = 'Filtrar_resultados_por_Expediente';
const SNAPSHOT_ACTION = 'Obtener_ExpedientesSistema';
const COUNTER_ACTION = 'Increment_ContadorActualizados';
const GROUP = 'staging-patch';

// The item that the write patches. The write takes its id from the row of the dump that the
// parent flow sent, so both reads of the trace point at the same item of the list.
const ITEM_ID = `first(body('${PREVIOUS_ACTION}'))?['ID']`;
// The row before the write, read from the list just before the write. The read is taken with the
// same accessor the flow already uses for the list of the provisioned expedientes:
// outputs('X')?['body/value'].
const BEFORE = `first(outputs('${BEFORE_ACTION}')?['body/value'])`;
// The row after the write, read from the list again.
const AFTER = `first(outputs('${AFTER_ACTION}')?['body/value'])`;

// Limits of the platform, taken from the flow definition limits of Microsoft Learn:
// https://learn.microsoft.com/en-us/power-automate/limits-and-config
const EXPRESSION_LIMIT = 8192;   // characters per expression
const ACTION_NAME_LIMIT = 80;    // length of an action name
// The budget of one chunk. It is under the limit with a margin, so a later edit of one field
// cannot push a chunk over it without the generator noticing.
const CHUNK_BUDGET = 6000;

const sort = value => Array.isArray(value)
  ? value.map(sort)
  : (value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])]))
    : value);
const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const definitionHash = definition => hash(JSON.stringify(sort(definition)));

const get = (root, key) => key.split('.').reduce((node, part) => node?.[part], root);

function readBase(basePath = BASE_PATH) {
  const bytes = fs.readFileSync(basePath);
  const definition = JSON.parse(bytes.toString('utf8'));
  assert.equal(definitionHash(definition), BASE_DEFINITION_HASH, 'the base is not the published centralized mapping');
  return { definition };
}

// The value of a column, as the comparison sees it. A missing value is the empty text and never
// an error, so a column that was empty and a column that was never written compare the same.
function normalizedValue(expression) {
  return `string(coalesce(${expression},''))`;
}

// The comparison of one column: nothing when the value did not move, the column otherwise.
function comparisonOf(column) {
  const previous = normalizedValue(`${BEFORE}?['${column}']`);
  const current = normalizedValue(`${AFTER}?['${column}']`);
  return `if(equals(${previous},${current}),'',concat('; ${column}: ',${previous},' -> ',${current}))`;
}

// The columns the write touches in the staging list, in the order of the table.
function buildComparisons() {
  const comparisons = [];
  for (const field of TABLE.fields) {
    const columns = field.columns[GROUP];
    if (!columns) continue;
    for (const column of columns) {
      comparisons.push({ field, column, expression: comparisonOf(column) });
    }
  }
  assert.ok(comparisons.length >= 30, 'the trace has to compare the fields of the write');
  return comparisons;
}

// The expression of a chunk: the comparisons of the chunk, concatenated.
function chunkExpression(comparisons) {
  return `@concat(${comparisons.map(comparison => comparison.expression).join(',')})`;
}

// The whole trace as one expression. It is longer than the platform accepts, which is the reason
// the trace is written in chunks; the generator keeps it to prove that the chunks are needed.
function traceExpression() {
  return chunkExpression(buildComparisons());
}

// The chunks of the trace. Each one stays under the budget of the platform.
function chunkComparisons(comparisons = buildComparisons(), budget = CHUNK_BUDGET) {
  const chunks = [];
  let current = [];
  for (const comparison of comparisons) {
    const candidate = [...current, comparison];
    if (current.length && chunkExpression(candidate).length > budget) {
      chunks.push(current);
      current = [comparison];
    } else {
      current = candidate;
    }
  }
  if (current.length) chunks.push(current);
  for (const chunk of chunks) {
    assert.ok(chunkExpression(chunk).length <= budget, 'a chunk of the trace is over the budget');
  }
  return chunks;
}

// The columns the flow writes in the staging list, read from the published definition.
function patchedColumns(definition) {
  const parameters = get(definition, `${BRANCH}.${PATCH_ACTION}.inputs.parameters`) || {};
  return Object.keys(parameters)
    .filter(key => key.startsWith('item/'))
    .map(key => key.slice('item/'.length))
    .sort();
}

// The previous value has to be the value of the row the flow is about to overwrite.
function assertPreviousSource(definition) {
  const filter = get(definition, `actions.${TRY}.actions.${PREVIOUS_ACTION}`);
  assert.ok(filter, `the action ${PREVIOUS_ACTION} is not in the definition`);
  assert.equal(filter.type, 'Query', `the action ${PREVIOUS_ACTION} is not the query of the previous row`);
  const id = get(definition, `${BRANCH}.${PATCH_ACTION}.inputs.parameters.id`);
  assert.equal(id, `@${ITEM_ID}`, 'the patch does not write the row the trace reads');
}

// The actions of a scope and the actions they wait for, inside that scope.
function dependenciesOf(actions) {
  const names = Object.keys(actions || {});
  const edges = new Map(names.map(name => [
    name,
    Object.keys((actions[name].runAfter || {})).filter(dependency => names.includes(dependency)),
  ]));
  return edges;
}

// Whether an action waits, directly or through others, for another action of the same scope.
function dependsOn(actions, action, dependency) {
  const edges = dependenciesOf(actions);
  const seen = new Set();
  const visit = name => {
    for (const next of edges.get(name) || []) {
      if (next === dependency) return true;
      if (seen.has(next)) continue;
      seen.add(next);
      if (visit(next)) return true;
    }
    return false;
  };
  return visit(action);
}

// The trace reads the row of the parent flow and the row of the list after the write. Both have
// to be there before the trace runs, otherwise the comparison is made against a value that is not
// finished yet. Neither dependency is written in the branch, so the generator checks them.
function assertSourcesAreReady(definition) {
  const scope = get(definition, `actions.${TRY}.actions`);
  assert.ok(scope, 'the scope of the ingestion is not in the definition');
  assert.ok(
    dependsOn(scope, EXISTS, PREVIOUS_ACTION),
    'the branch does not wait for the row of the previous ingestion',
  );
  const condition = JSON.stringify(get(definition, `actions.${TRY}.actions.${EXISTS}.expression`) || '');
  assert.ok(condition.includes(PREVIOUS_ACTION), 'the branch does not read the row of the previous ingestion');
}

function prepare(base) {
  const result = JSON.parse(JSON.stringify(base));
  const branch = get(result.definition, BRANCH);
  assert.ok(branch, 'the branch of an existing expediente is not in the definition');
  assertPreviousSource(result.definition);
  assertSourcesAreReady(result.definition);

  const comparisons = buildComparisons();
  const written = patchedColumns(result.definition);
  assert.deepEqual(
    written,
    comparisons.map(comparison => comparison.column).sort(),
    'the trace and the write of the staging list have to talk about the same columns',
  );

  const patch = branch[PATCH_ACTION];
  const patchInputs = patch.inputs;
  assert.ok(patchInputs.parameters.dataset, 'the write does not name the dataset of the list');
  assert.ok(patchInputs.parameters.table, 'the write does not name the table of the list');
  assert.ok(patchInputs.authentication, 'the write does not name the connection of the list');
  assert.ok(!branch[BEFORE_ACTION], `the action ${BEFORE_ACTION} already exists`);
  assert.ok(!branch[AFTER_ACTION], `the action ${AFTER_ACTION} already exists`);

  // The row before the write: the list, just before the write.
  branch[BEFORE_ACTION] = {
    runAfter: {},
    metadata: { operationMetadataId: '00000000-0000-0000-0000-000000000000' },
    type: 'OpenApiConnection',
    inputs: {
      host: {
        connectionName: patchInputs.host.connectionName,
        operationId: 'GetItems',
        apiId: patchInputs.host.apiId,
      },
      parameters: {
        dataset: patchInputs.parameters.dataset,
        table: patchInputs.parameters.table,
        '$filter': `ID eq @{${ITEM_ID}}`,
      },
      authentication: patchInputs.authentication,
    },
  };

  // The write waits for the row it is going to overwrite.
  patch.runAfter = { [BEFORE_ACTION]: ['Succeeded'] };

  // The row after the write: the list again, once the write is done.
  branch[AFTER_ACTION] = {
    runAfter: { [PATCH_ACTION]: ['Succeeded'] },
    metadata: { operationMetadataId: '00000000-0000-0000-0000-000000000000' },
    type: 'OpenApiConnection',
    inputs: {
      host: {
        connectionName: patchInputs.host.connectionName,
        operationId: 'GetItems',
        apiId: patchInputs.host.apiId,
      },
      parameters: {
        dataset: patchInputs.parameters.dataset,
        table: patchInputs.parameters.table,
        '$filter': `ID eq @{${ITEM_ID}}`,
      },
      authentication: patchInputs.authentication,
    },
  };

  const chunks = chunkComparisons(comparisons);
  const names = chunks.map((chunk, index) => `${TRACE_ACTION}_${index + 1}`);
  for (const name of names) {
    assert.ok(name.length <= ACTION_NAME_LIMIT, `the name of the action ${name} is too long`);
    assert.ok(!branch[name], `the action ${name} already exists`);
  }
  assert.equal(new Set(names).size, names.length, 'the names of the chunks have to be unique');

  // The trace is computed after the write, because that is when the row of the list holds the
  // value that the write left. Both reads have to be in the path of the chunk, because the
  // platform refuses an expression that reads an action it does not wait for.
  chunks.forEach((chunk, index) => {
    branch[names[index]] = {
      runAfter: { [BEFORE_ACTION]: ['Succeeded'], [AFTER_ACTION]: ['Succeeded'] },
      metadata: { operationMetadataId: '00000000-0000-0000-0000-000000000000' },
      type: 'Compose',
      inputs: chunkExpression(chunk),
    };
  });

  // The log of the ingestion carries the trace.
  const log = branch[LOG_ACTION];
  assert.ok(log, `the action ${LOG_ACTION} is not in the definition`);
  log.runAfter = {
    ...Object.fromEntries(names.map(name => [name, ['Succeeded']])),
    [BEFORE_ACTION]: ['Succeeded'],
    [AFTER_ACTION]: ['Succeeded'],
  };
  log.inputs.value = {
    ...log.inputs.value,
    Cambios: `@concat(${names.map(name => `body('${name}')`).join(',')})`,
  };
  // The diagnostic is only written when it is asked for. It says how many rows each read returned
  // and which value the row carried, which is what a case needs when the trace comes out empty.
  if (process.env.TRACE_DIAGNOSTIC === '1') {
    log.inputs.value.Diagnostico = `@concat('antes=',string(length(coalesce(outputs('${BEFORE_ACTION}')?['body/value'],createArray()))),`
      + `' despues=',string(length(coalesce(outputs('${AFTER_ACTION}')?['body/value'],createArray()))),`
      + `' obsAntes=',string(coalesce(first(outputs('${BEFORE_ACTION}')?['body/value'])?['Observaciones'],'NUL')),`
      + `' obsDespues=',string(coalesce(first(outputs('${AFTER_ACTION}')?['body/value'])?['Observaciones'],'NUL')))`;
  }
  assert.ok(log.inputs.value.Cambios.length <= EXPRESSION_LIMIT, 'the expression of the log is over the limit');
  return result;
}

function diffPaths(a, b, path = '$', out = []) {
  const ta = Array.isArray(a) ? 'array' : (a === null ? 'null' : typeof a);
  const tb = Array.isArray(b) ? 'array' : (b === null ? 'null' : typeof b);
  if (ta !== tb) { out.push(path); return out; }
  if (ta === 'array') {
    if (a.length !== b.length) out.push(path);
    for (let i = 0; i < Math.min(a.length, b.length); i += 1) diffPaths(a[i], b[i], `${path}[${i}]`, out);
    return out;
  }
  if (ta === 'object') {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    for (const key of ka) if (!kb.includes(key)) out.push(`${path}.${key}`);
    for (const key of kb) if (!ka.includes(key)) out.push(`${path}.${key}`);
    for (const key of ka) if (kb.includes(key)) diffPaths(a[key], b[key], `${path}.${key}`, out);
    return out;
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) out.push(path);
  return out;
}

function compare(base, candidate) {
  const changed = diffPaths(base.definition, candidate.definition);
  const branch = get(candidate.definition, BRANCH);
  const chunkNames = Object.keys(branch).filter(name => name.startsWith(`${TRACE_ACTION}_`));
  const allowed = [
    ...chunkNames.map(name => `$.${BRANCH}.${name}`),
    `$.${BRANCH}.${LOG_ACTION}.inputs.value.Cambios`,
    `$.${BRANCH}.${LOG_ACTION}.runAfter`,
    `$.${BRANCH}.${BEFORE_ACTION}`,
    `$.${BRANCH}.${AFTER_ACTION}`,
    `$.${BRANCH}.${PATCH_ACTION}.runAfter`,
  ];
  if (process.env.TRACE_DIAGNOSTIC === '1') allowed.push(`$.${BRANCH}.${LOG_ACTION}.inputs.value.Diagnostico`);
  for (const path of changed) {
    assert.ok(allowed.some((prefix) => path === prefix || path.startsWith(prefix + '.')), `unexpected changed path: ${path}`);
  }
  const cycles = dependencyCycles(candidate.definition);
  assert.deepEqual(cycles, [], `the candidate must not close a dependency cycle: ${cycles.join(' | ')}`);

  const chunks = chunkNames.map(name => {
    const inputs = get(candidate.definition, `${BRANCH}.${name}.inputs`);
    assert.ok(inputs.startsWith('@concat('), 'the trace of a chunk is one expression');
    assert.ok(inputs.length <= EXPRESSION_LIMIT, `the expression of ${name} is over the limit of the platform`);
    return {
      action: name,
      fieldsCompared: (inputs.match(/if\(equals\(/g) || []).length,
      expressionLength: inputs.length,
    };
  });
  const single = traceExpression();
  const comparisons = buildComparisons();
  return {
    changedPaths: changed,
    changedPathCount: changed.length,
    sourceDefinitionSha256: definitionHash(base.definition),
    candidateDefinitionSha256: definitionHash(candidate.definition),
    fieldsCompared: comparisons.length,
    chunks,
    chunkCount: chunks.length,
    maxChunkExpressionLength: Math.max(...chunks.map(chunk => chunk.expressionLength)),
    expressionLimit: EXPRESSION_LIMIT,
    chunkBudget: CHUNK_BUDGET,
    singleExpressionLength: single.length,
    singleExpressionIsOverTheLimit: single.length > EXPRESSION_LIMIT,
    readsTheRowBeforeTheWrite: get(candidate.definition, `${BRANCH}.${BEFORE_ACTION}.inputs.parameters.$filter`),
    readsTheRowAfterTheWrite: get(candidate.definition, `${BRANCH}.${AFTER_ACTION}.inputs.parameters.$filter`),
  };
}

function validateDestination(destination, exclusive = true) {
  const resolved = path.resolve(destination);
  const relative = path.relative(DIRECTORY, resolved);
  assert.ok(relative && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`),
    'destination must stay inside the ignored candidate subtree');
  let current = path.parse(resolved).root;
  for (const part of resolved.slice(current.length).split(path.sep)) {
    current = path.join(current, part);
    let stat;
    try { stat = fs.lstatSync(current); } catch (error) { if (error.code === 'ENOENT') break; throw error; }
    assert.ok(!stat.isSymbolicLink(), 'destination contains a symbolic link or reparse point');
    assert.equal(path.relative(current, fs.realpathSync.native(current)), '', 'destination reparse resolution differs');
  }
  if (exclusive) assert.ok(!fs.existsSync(resolved), 'refusing to overwrite an existing output');
}

function writeOutputs(destination = DIRECTORY) {
  for (const name of OUTPUTS) validateDestination(path.join(destination, name));
  const base = readBase();
  const candidate = prepare(base);
  const comparison = compare(base, candidate);
  fs.mkdirSync(DIRECTORY, { recursive: true });
  fs.writeFileSync(path.join(DIRECTORY, 'candidate-definition.json'), `${JSON.stringify(candidate.definition)}\n`);
  fs.writeFileSync(path.join(DIRECTORY, 'candidate-comparison.json'), `${JSON.stringify(comparison, null, 2)}\n`);
  return comparison;
}

if (require.main === module) {
  const comparison = writeOutputs();
  console.log(JSON.stringify({
    localOnly: true,
    outputs: OUTPUTS,
    changedPathCount: comparison.changedPathCount,
    fieldsCompared: comparison.fieldsCompared,
    chunkCount: comparison.chunkCount,
    maxChunkExpressionLength: comparison.maxChunkExpressionLength,
    expressionLimit: comparison.expressionLimit,
    singleExpressionLength: comparison.singleExpressionLength,
    singleExpressionIsOverTheLimit: comparison.singleExpressionIsOverTheLimit,
    candidateDefinitionSha256: comparison.candidateDefinitionSha256,
  }, null, 2));
}

module.exports = {
  BASE_PATH, BASE_DEFINITION_HASH, DIRECTORY, OUTPUTS, BRANCH, TRACE_ACTION, LOG_ACTION, PATCH_ACTION,
  BEFORE_ACTION, AFTER_ACTION, PREVIOUS_ACTION, SNAPSHOT_ACTION, COUNTER_ACTION, ITEM_ID, BEFORE, AFTER,
  GROUP, TABLE,
  EXPRESSION_LIMIT, ACTION_NAME_LIMIT, CHUNK_BUDGET,
  prepare, compare, readBase, diffPaths, definitionHash, validateDestination, writeOutputs,
  dependencyCycles, traceExpression, comparisonOf, buildComparisons, chunkComparisons,
  chunkExpression, patchedColumns,
  dependenciesOf, dependsOn, assertPreviousSource, assertSourcesAreReady,
};
