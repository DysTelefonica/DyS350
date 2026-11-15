'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  prepare, compare, readBase, definitionHash, dependencyCycles, validateDestination,
  BASE_DEFINITION_HASH, DIRECTORY, OUTPUTS, BRANCH, TRACE_ACTION, LOG_ACTION, GROUP, TABLE,
  EXPRESSION_LIMIT, ACTION_NAME_LIMIT, CHUNK_BUDGET,
  traceExpression, comparisonOf, expressionOf, buildComparisons, chunkComparisons, chunkExpression,
  isDateColumn, patchedColumns, snapshotSchemaColumns, PREVIOUS,
  dependsOn,
} = require('./prepare-change-trace.cjs');

const base = readBase();
const candidate = prepare(base);
const get = (root, key) => key.split('.').reduce((node, part) => node?.[part], root);
const branch = get(candidate.definition, BRANCH);
const chunkNames = Object.keys(branch).filter(name => name.startsWith(`${TRACE_ACTION}_`));

test('the pinned source is the published centralized mapping', () => {
  assert.equal(definitionHash(base.definition), BASE_DEFINITION_HASH);
});

test('the candidate does not close a dependency cycle', () => {
  assert.deepEqual(dependencyCycles(candidate.definition), []);
});

test('the trace is computed before anything is written', () => {
  assert.ok(chunkNames.length >= 2, 'the trace has to be written in chunks');
  for (const name of chunkNames) {
    assert.deepEqual(branch[name].runAfter, {}, 'the chunk runs first in the branch');
    assert.equal(branch[name].type, 'Compose');
  }
  assert.deepEqual(
    branch[LOG_ACTION].runAfter,
    Object.fromEntries(chunkNames.map(name => [name, ['Succeeded']])),
    'the log waits for every chunk',
  );
  assert.deepEqual(
    branch['Increment_ContadorActualizados'].runAfter,
    { [LOG_ACTION]: ['Succeeded'] },
    'the counter waits for the log',
  );
  assert.deepEqual(
    branch['Actualizar_ExpedienteJSON'].runAfter,
    { Increment_ContadorActualizados: ['Succeeded'] },
    'the write still waits for the counter',
  );
});

test('the log of an ingestion carries the trace', () => {
  const value = branch[LOG_ACTION].inputs.value;
  assert.ok(value.Log, 'the log keeps its message');
  assert.equal(
    value.Cambios,
    `@concat(${chunkNames.map(name => `body('${name}')`).join(',')})`,
    'the log concatenates the chunks',
  );
});

test('the expression carries the @ only at the start', () => {
  for (const name of chunkNames) {
    const expression = branch[name].inputs;
    assert.ok(expression.startsWith('@'), 'the expression starts with the @');
    assert.equal((expression.match(/@/g) || []).length, 1, 'the @ belongs to the start of the expression only');
  }
});

test('the trace compares every column of the patch and nothing else', () => {
  const comparisons = buildComparisons();
  const written = patchedColumns(candidate.definition);
  assert.deepEqual(
    written,
    comparisons.map(comparison => comparison.column).sort(),
    'the trace and the patch of the staging list talk about the same columns',
  );
  const expected = TABLE.fields
    .filter(field => field.columns[GROUP])
    .reduce((count, field) => count + field.columns[GROUP].length, 0);
  assert.equal(comparisons.length, expected, 'the trace compares every field of the group');
  const compared = chunkNames
    .flatMap(name => branch[name].inputs.match(/if\(equals\(/g) || [])
    .length;
  assert.equal(compared, expected, 'every comparison is in one of the chunks');
});

test('the chunks cover every column once, in the order of the table', () => {
  const chunks = chunkComparisons();
  const columns = chunks.flat().map(comparison => comparison.column);
  assert.deepEqual(columns, buildComparisons().map(comparison => comparison.column));
  assert.equal(new Set(columns).size, columns.length, 'a column is compared once');
});

test('every expression of the candidate is under the limit of the platform', () => {
  for (const name of chunkNames) {
    const expression = branch[name].inputs;
    assert.ok(expression.length <= EXPRESSION_LIMIT, `${name} is over the limit of the platform`);
    assert.ok(expression.length <= CHUNK_BUDGET, `${name} is over the budget of a chunk`);
  }
  assert.ok(branch[LOG_ACTION].inputs.value.Cambios.length <= EXPRESSION_LIMIT);
});

test('the whole trace as one expression would be over the limit, so the chunks are needed', () => {
  const single = traceExpression();
  assert.ok(single.length > EXPRESSION_LIMIT, 'the single expression is refused by the platform');
  assert.ok(chunkNames.length > 1, 'the trace is written in more than one expression');
});

test('the comparison of a field is null safe and names the field', () => {
  const field = TABLE.fields.find(entry => entry.columns[GROUP]);
  const column = field.columns[GROUP][0];
  const comparison = comparisonOf(field, column);
  assert.ok(comparison.startsWith('if(equals('), 'the comparison is null safe');
  assert.ok(comparison.includes(`concat('; ${column}: '`), 'the comparison names the column');
  assert.ok(comparison.includes("' -> '"), 'the comparison names the previous and the new value');
  assert.ok(!comparison.includes('@'), 'a nested expression does not carry the @');
});

test('a date column is compared by its day, so a stored datetime is not a change', () => {
  const field = TABLE.fields.find(entry => (entry.columns[GROUP] || []).includes('FechaInicioContrato'));
  assert.ok(field, 'the staging patch carries a date column');
  const comparison = comparisonOf(field, 'FechaInicioContrato');
  assert.equal((comparison.match(/substring\(/g) || []).length, 4, 'the date is compared by its first ten characters');
  assert.equal((comparison.match(/if\(less\(/g) || []).length, 4, 'every read of the day is guarded');
  assert.ok(comparison.includes("substring(string(coalesce(first(body('Filtrar_resultados_por_Expediente'))?['FechaInicioContrato'],'')),0,if("),
    'the day of the previous value is the one of the column');
  assert.ok(comparison.includes("substring(string(coalesce(body('ExpedienteJSON')?['fechainiciocontrato'],'')),0,if("),
    'the day of the new value is the one of the JSON');
  assert.ok(comparison.includes("if(less(length(string(coalesce(body('ExpedienteJSON')?['fechainiciocontrato'],''))),10),length("),
    'the read of the day is as long as the value when the value is shorter than a day');
  assert.ok(isDateColumn('FechaInicioContrato'));
  assert.ok(!isDateColumn('Title'));
});

test('the sources of the table are nested without the @', () => {
  for (const source of Object.keys(TABLE.sources)) {
    assert.ok(!expressionOf(source).startsWith('@'), `the source ${source} is nested without the @`);
  }
});

test('the previous value is the row the flow is about to overwrite', () => {
  const parameters = get(candidate.definition, `${BRANCH}.Actualizar_ExpedienteJSON.inputs.parameters`);
  assert.equal(
    parameters.id,
    "@first(body('Filtrar_resultados_por_Expediente'))?['ID']",
    'the trace reads the same row the patch writes',
  );
  const comparisons = buildComparisons();
  for (const comparison of comparisons) {
    assert.ok(comparison.expression.includes("first(body('Filtrar_resultados_por_Expediente'))"),
      `the previous value of ${comparison.column} comes from the filtered row`);
  }
});

test('the branch waits for the members and for the row of the previous ingestion', () => {
  const scope = get(candidate.definition, 'actions.Try_-_Procesar_ExpedientesJSON.actions');
  assert.ok(dependsOn(scope, 'Existe_ExpedienteJSON', 'Por_cada_MiembroResponsable'),
    'the variable of the members is filled before the branch starts');
  assert.ok(dependsOn(scope, 'Obtener_ID_Grupo_Jefes_de_Proyecto', 'Por_cada_MiembroResponsable'),
    'the members are filled before the group of the chiefs is read');
  assert.ok(!dependsOn(scope, 'Por_cada_MiembroResponsable', 'Existe_ExpedienteJSON'),
    'the members do not wait for the branch');
});

test('the names of the chunks are within the limit of the platform', () => {
  for (const name of chunkNames) {
    assert.ok(name.length <= ACTION_NAME_LIMIT, `${name} is over the limit of the name`);
  }
  assert.equal(new Set(chunkNames).size, chunkNames.length);
});

test('the receipt names the columns the schema of the snapshot does not carry', () => {
  const comparison = compare(base, candidate);
  const snapshot = snapshotSchemaColumns(candidate.definition);
  const gaps = comparison.snapshotSchemaGaps;
  assert.ok(Array.isArray(gaps));
  for (const column of gaps) assert.ok(!snapshot.includes(column));
  assert.ok(comparison.singleExpressionIsOverTheLimit);
  assert.equal(comparison.fieldsCompared, buildComparisons().length);
  assert.equal(comparison.chunkCount, chunkNames.length);
});

test('nothing else of the flow is touched', () => {
  const comparison = compare(base, candidate);
  assert.equal(comparison.sourceDefinitionSha256, BASE_DEFINITION_HASH);
  assert.deepEqual(
    comparison.changedPaths,
    [
      ...chunkNames.map(name => `$.${BRANCH}.${name}`),
      ...chunkNames.map(name => `$.${BRANCH}.${LOG_ACTION}.runAfter.${name}`),
      `$.${BRANCH}.${LOG_ACTION}.inputs.value.Cambios`,
    ],
    'the candidate adds the chunks and nothing else',
  );
  assert.ok(candidate.definition.actions['Try_-_Procesar_ExpedientesJSON'], 'the scope of the work is preserved');
});

test('a source that is not the reviewed candidate is rejected', () => {
  const tampered = JSON.parse(JSON.stringify(base.definition));
  tampered.actions['INI_ContadorNuevos'] = { type: 'InitializeVariable', inputs: { name: 'x' } };
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'trace-')), 'candidate-definition.json');
  fs.writeFileSync(file, JSON.stringify(tampered));
  assert.throws(() => readBase(file), /the base is not the published centralized mapping/);
});

test('the outputs stay inside the ignored subtree', () => {
  assert.ok(DIRECTORY.includes(`${path.sep}.atl${path.sep}`));
  for (const name of OUTPUTS) validateDestination(path.join(DIRECTORY, name), false);
  assert.throws(() => validateDestination(path.join(os.tmpdir(), 'candidate-definition.json'), false), /destination must stay inside/);
  const existing = path.join(DIRECTORY, 'scratch-trace-check.json');
  fs.mkdirSync(DIRECTORY, { recursive: true });
  fs.writeFileSync(existing, 'x');
  assert.throws(() => validateDestination(existing), /refusing to overwrite an existing output/);
  fs.rmSync(existing);
});

test('the chunk expression is the concatenation of its comparisons', () => {
  const chunks = chunkComparisons();
  assert.equal(chunkExpression(chunks[0]), `@concat(${chunks[0].map(c => c.expression).join(',')})`);
  assert.ok(chunkExpression(chunks[0]).length <= CHUNK_BUDGET);
});

// A small evaluator of the template language, only of the functions the generator writes. It is here
// to prove what the generated expression does with the values of a real ingestion: the comparison of
// the day of a date, the empty value of a column that was never filled and the number that the JSON
// sends as a text. The evaluator refuses to read out of range, the way the platform asks it to.
function evaluate(expression, context) {
  let index = 0;
  const skip = () => { while (index < expression.length && /\s/.test(expression[index])) index += 1; };
  const parseString = () => {
    index += 1;
    let value = '';
    while (expression[index] !== "'") {
      if (expression[index] === "'" && expression[index + 1] === "'") { value += "'"; index += 2; continue; }
      value += expression[index];
      index += 1;
    }
    index += 1;
    return value;
  };
  const parseValue = () => {
    skip();
    if (expression[index] === "'") return parseString();
    if (expression[index] === '(') { index += 1; const value = parseValue(); skip(); index += 1; return value; }
    if (/[0-9]/.test(expression[index])) {
      const start = index;
      while (index < expression.length && /[0-9.]/.test(expression[index])) index += 1;
      return Number(expression.slice(start, index));
    }
    const start = index;
    while (index < expression.length && /[A-Za-z_]/.test(expression[index])) index += 1;
    const name = expression.slice(start, index);
    skip();
    const args = [];
    if (expression[index] === '(') {
      index += 1;
      skip();
      if (expression[index] !== ')') {
        for (;;) {
          args.push(parseValue());
          skip();
          if (expression[index] === ',') { index += 1; continue; }
          break;
        }
      }
      skip();
      index += 1;
    }
    let value = call(name, args);
    // The safe accessor: value?['key'].
    for (;;) {
      skip();
      if (expression[index] !== '?' || expression[index + 1] !== '[') break;
      index += 2;
      const key = parseString();
      skip();
      index += 1;
      value = value === null || value === undefined ? null : value[key];
    }
    return value;
  };
  const call = (name, args) => {
    switch (name) {
      case 'if': return truthy(args[0]) ? args[1] : args[2];
      case 'equals': return args[0] === args[1];
      case 'less': return Number(args[0]) < Number(args[1]);
      case 'length': return String(args[0]).length;
      case 'substring': {
        const text = String(args[0]);
        const start = Number(args[1]);
        const length = Number(args[2]);
        if (start + length > text.length) throw new Error('the substring reads out of range');
        return text.substr(start, length);
      }
      case 'string': return String(args[0]);
      case 'coalesce': return args[0] === null || args[0] === undefined ? args[1] : args[0];
      case 'concat': return args.map(value => String(value)).join('');
      case 'body': return context.body[args[0]];
      case 'first': return args[0][0];
      case 'variables': return context.variables[args[0]];
      default: throw new Error(`the evaluator does not know the function ${name}`);
    }
  };
  const truthy = value => !(value === null || value === undefined || value === false || value === '' || value === 0);
  return parseValue();
}

const comparisonFor = column => {
  const field = TABLE.fields.find(entry => (entry.columns[GROUP] || []).includes(column));
  assert.ok(field, `the staging patch carries ${column}`);
  return comparisonOf(field, column);
};

const contextWith = (row, json) => ({
  body: { ExpedienteJSON: json, Filtrar_resultados_por_Expediente: [row] },
  variables: { ArrayResponsables: '' },
});

test('the comparison reports nothing when the value did not move', () => {
  const comparison = comparisonFor('Title');
  const row = { Title: 'Expediente 1205' };
  const json = { titulo: 'Expediente 1205' };
  assert.equal(evaluate(comparison, contextWith(row, json)), '');
});

test('the comparison names the column, the previous value and the new one', () => {
  const comparison = comparisonFor('Title');
  const row = { Title: 'Expediente 1205' };
  const json = { titulo: 'Expediente 1206' };
  assert.equal(evaluate(comparison, contextWith(row, json)), '; Title: Expediente 1205 -> Expediente 1206');
});

test('a date that SharePoint stored in another representation is not a change', () => {
  const comparison = comparisonFor('FechaInicioContrato');
  const row = { FechaInicioContrato: '2026-03-04T00:00:00Z' };
  const json = { fechainiciocontrato: '2026-03-04T00:00:00.000Z' };
  assert.equal(evaluate(comparison, contextWith(row, json)), '', 'the day is the same');
  const moved = { fechainiciocontrato: '2026-03-05T00:00:00.000Z' };
  assert.equal(
    evaluate(comparison, contextWith(row, moved)),
    '; FechaInicioContrato: 2026-03-04 -> 2026-03-05',
    'another day is a change',
  );
});

test('a date that was never filled is read without leaving the text', () => {
  const comparison = comparisonFor('FechaInicioContrato');
  const row = {};
  const json = { fechainiciocontrato: '2026-03-04T00:00:00.000Z' };
  assert.equal(
    evaluate(comparison, contextWith(row, json)),
    '; FechaInicioContrato:  -> 2026-03-04',
    'a column that was empty is a change',
  );
  const empty = { fechainiciocontrato: '' };
  assert.equal(evaluate(comparison, contextWith(row, empty)), '', 'two empty values are the same');
});

test('the read of the day is guarded, an empty value would be read out of range', () => {
  const field = TABLE.fields.find(entry => (entry.columns[GROUP] || []).includes('FechaInicioContrato'));
  const day = expression => `substring(string(coalesce(${expression},'')),0,10)`;
  const unguarded = `if(equals(${day(expressionOf(field.source))},${day(`${PREVIOUS}?['FechaInicioContrato']`)}),'','')`;
  assert.throws(
    () => evaluate(unguarded, contextWith({}, { fechainiciocontrato: '' })),
    /out of range/,
    'without the guard the platform would refuse the expression',
  );
});

test('a number that the JSON sends as a text is not a change', () => {
  const comparison = comparisonFor('ImporteLicitacion');
  const row = { ImporteLicitacion: 1000 };
  const json = { importelicitacion: '1000' };
  assert.equal(evaluate(comparison, contextWith(row, json)), '', 'the number and its text are the same value');
  const moved = { importelicitacion: '2000' };
  assert.equal(evaluate(comparison, contextWith(row, moved)), '; ImporteLicitacion: 1000 -> 2000');
});
