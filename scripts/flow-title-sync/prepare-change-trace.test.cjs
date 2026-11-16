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
  traceExpression, comparisonOf, buildComparisons, chunkComparisons, chunkExpression,
  patchedColumns, ITEM_ID, BEFORE_ACTION, AFTER_ACTION, PATCH_ACTION, COUNTER_ACTION,
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

test('the trace is computed after the write, from the row that the write leaves', () => {
  assert.deepEqual(
    branch['Actualizar_ExpedienteJSON'].runAfter,
    { [BEFORE_ACTION]: ['Succeeded'] },
    'the write waits for the row it overwrites',
  );
  assert.deepEqual(branch[BEFORE_ACTION].runAfter, {}, 'the row before the write is read at the start of the branch');
  assert.deepEqual(
    branch[AFTER_ACTION].runAfter,
    { Actualizar_ExpedienteJSON: ['Succeeded'] },
    'the row after the write is read once the write is done',
  );
  for (const name of chunkNames) {
    assert.deepEqual(
      branch[name].runAfter,
      { [BEFORE_ACTION]: ['Succeeded'], [AFTER_ACTION]: ['Succeeded'] },
      'the trace waits for both reads, because the platform refuses an expression that reads an action it does not wait for',
    );
    assert.equal(branch[name].type, 'Compose');
  }
  assert.deepEqual(
    branch[LOG_ACTION].runAfter,
    {
      ...Object.fromEntries(chunkNames.map(name => [name, ['Succeeded']])),
      [BEFORE_ACTION]: ['Succeeded'],
      [AFTER_ACTION]: ['Succeeded'],
    },
    'the log waits for every chunk and for both reads',
  );
  assert.deepEqual(
    branch['Increment_ContadorActualizados'].runAfter,
    { [LOG_ACTION]: ['Succeeded'] },
    'the counter waits for the log',
  );
});

test('both reads of the trace point at the item that the write patches', () => {
  const parameters = get(candidate.definition, `${BRANCH}.Actualizar_ExpedienteJSON.inputs.parameters`);
  assert.equal(parameters.id, `@${ITEM_ID}`, 'the write patches the row of the dump of the parent');
  assert.equal(
    branch[BEFORE_ACTION].inputs.parameters.$filter,
    `ID eq @{${ITEM_ID}}`,
    'the row before the write is the same item',
  );
  assert.equal(
    branch[AFTER_ACTION].inputs.parameters.$filter,
    `ID eq @{${ITEM_ID}}`,
    'the row after the write is the same item',
  );
});

test('both reads of the trace are reads of the list', () => {
  for (const name of [BEFORE_ACTION, AFTER_ACTION]) {
    assert.equal(branch[name].type, 'OpenApiConnection');
    assert.equal(branch[name].inputs.host.operationId, 'GetItems');
    assert.ok(branch[name].inputs.parameters.$filter.startsWith('ID eq '));
  }
});

test('the reads use the connection and the list of the write', () => {
  const patch = get(candidate.definition, `${BRANCH}.Actualizar_ExpedienteJSON.inputs`);
  for (const name of [BEFORE_ACTION, AFTER_ACTION]) {
    const read = branch[name].inputs;
    assert.equal(read.host.connectionName, patch.host.connectionName);
    assert.equal(read.host.apiId, patch.host.apiId);
    assert.equal(read.host.operationId, 'GetItems');
    assert.equal(read.parameters.dataset, patch.parameters.dataset);
    assert.equal(read.parameters.table, patch.parameters.table);
    assert.deepEqual(read.authentication, patch.authentication);
  }
});

test('the log of an ingestion carries the trace', () => {
  const value = branch[LOG_ACTION].inputs.value;
  assert.ok(value.Log, 'the log keeps its message');
  assert.equal(
    value.Cambios,
    `@concat(${chunkNames.map(name => `coalesce(outputs('${name}'),'')`).join(',')})`,
    'the log concatenates the chunks',
  );
});

test('the log reads the chunks with outputs, because a Compose has no body', () => {
  const value = branch[LOG_ACTION].inputs.value;
  for (const name of chunkNames) {
    assert.ok(
      value.Cambios.includes(`outputs('${name}')`),
      `the log reads ${name} with outputs`,
    );
    assert.ok(
      !value.Cambios.includes(`body('${name}')`),
      `the log does not read ${name} with body: a Compose action has no body and the answer of ` +
      'body() of a Compose is nothing, so the trace of the log came out empty',
    );
  }
});

test('the expression carries the @ only at the start', () => {
  for (const name of chunkNames) {
    const expression = branch[name].inputs;
    assert.ok(expression.startsWith('@'), 'the expression starts with the @');
    assert.equal((expression.match(/@/g) || []).length, 1, 'the @ belongs to the start of the expression only');
  }
});

test('the trace compares every column of the write and nothing else', () => {
  const comparisons = buildComparisons();
  const written = patchedColumns(candidate.definition);
  assert.deepEqual(
    written,
    comparisons.map(comparison => comparison.column).sort(),
    'the trace and the write of the staging list talk about the same columns',
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

test('the comparison of a column is null safe and names the column', () => {
  const column = TABLE.fields.find(entry => entry.columns[GROUP]).columns[GROUP][0];
  const comparison = comparisonOf(column);
  assert.ok(comparison.startsWith('if(equals('), 'the comparison is null safe');
  assert.ok(comparison.includes(`concat('; ${column}: '`), 'the comparison names the column');
  assert.ok(comparison.includes("' -> '"), 'the comparison names the previous and the new value');
  assert.ok(!comparison.includes('@'), 'a nested expression does not carry the @');
});

test('the comparison only uses functions that cannot fail on an empty value', () => {
  const forbidden = ['substring', 'timestamp', 'formatDateTime', 'addHours', 'addDays', 'split', 'length', 'convertTimeZone'];
  for (const comparison of buildComparisons()) {
    for (const name of forbidden) {
      assert.ok(!comparison.expression.includes(`${name}(`), `the comparison of ${comparison.column} uses ${name}`);
    }
    // The text of the literals is removed first: a forbidden name inside a literal is not a call.
    const withoutLiterals = comparison.expression.replace(/'[^']*'/g, "''");
    const functions = withoutLiterals.match(/[a-zA-Z]+\(/g) || [];
    for (const call of functions) {
      assert.ok(['if(', 'equals(', 'string(', 'coalesce(', 'concat(', 'first(', 'outputs('].includes(call), `the comparison uses ${call}`);
    }
  }
});

test('the previous value is the row the flow is about to overwrite', () => {
  const comparisons = buildComparisons();
  for (const comparison of comparisons) {
    assert.ok(comparison.expression.includes(`outputs('${BEFORE_ACTION}')`),
      `the previous value of ${comparison.column} comes from the row before the write`);
    assert.ok(comparison.expression.includes(`outputs('${AFTER_ACTION}')`),
      `the new value of ${comparison.column} comes from the list`);
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

test('the receipt names the reads of the trace', () => {
  const comparison = compare(base, candidate);
  assert.ok(comparison.readsTheRowBeforeTheWrite.startsWith('ID eq '));
  assert.ok(comparison.readsTheRowAfterTheWrite.startsWith('ID eq '));
  assert.ok(comparison.singleExpressionIsOverTheLimit);
  assert.equal(comparison.fieldsCompared, buildComparisons().length);
  assert.equal(comparison.chunkCount, chunkNames.length);
});

test('nothing else of the flow is touched', () => {
  const comparison = compare(base, candidate);
  assert.equal(comparison.sourceDefinitionSha256, BASE_DEFINITION_HASH);
  // The expected paths are built from the names of the actions, so a generator that writes a
  // different set of paths does not pass this test with the paths of another one.
  const expectedPaths = [
    `$.${BRANCH}.${BEFORE_ACTION}`,
    `$.${BRANCH}.${AFTER_ACTION}`,
    `$.${BRANCH}.${PATCH_ACTION}.runAfter.${COUNTER_ACTION}`,
    `$.${BRANCH}.${PATCH_ACTION}.runAfter.${BEFORE_ACTION}`,
    `$.${BRANCH}.${LOG_ACTION}.inputs.value.Cambios`,
    `$.${BRANCH}.${LOG_ACTION}.runAfter.${BEFORE_ACTION}`,
    `$.${BRANCH}.${LOG_ACTION}.runAfter.${AFTER_ACTION}`,
    ...chunkNames.map(name => `$.${BRANCH}.${name}`),
    ...chunkNames.map(name => `$.${BRANCH}.${LOG_ACTION}.runAfter.${name}`),
  ];
  assert.deepEqual(
    comparison.changedPaths.sort(),
    expectedPaths.sort(),
    'the candidate adds the two reads and the chunks, and moves the write and the log',
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
// to prove what the generated expression does with the values of a real ingestion: a column that
// was never filled, a date as SharePoint keeps it and the boolean that the list keeps as text. The
// evaluator refuses to read out of range, the way the platform asks it to, so an expression that
// reads a value it should not would fail here too.
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
      if (value === null || value === undefined) { value = null; continue; }
      // A path with a slash walks the object: outputs('X')?['body/value'].
      value = key.split('/').reduce((node, part) => (node === null || node === undefined ? null : node[part]), value);
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
        if (start >= text.length) throw new Error('the substring reads out of range');
        return text.substr(start, length);
      }
      case 'string': return String(args[0]);
      case 'coalesce': return args[0] === null || args[0] === undefined ? args[1] : args[0];
      // The platform skips the arguments that are nothing, so a concat of a missing value does
      // not write the word "null" in the log.
      case 'concat': return args.filter(value => value !== null && value !== undefined).map(value => String(value)).join('');
      case 'body': return context.body[args[0]];
      case 'outputs': return context.outputs[args[0]];
      case 'first': return args[0][0];
      case 'variables': return context.variables[args[0]];
      default: throw new Error(`the evaluator does not know the function ${name}`);
    }
  };
  const truthy = value => !(value === null || value === undefined || value === false || value === '' || value === 0);
  return parseValue();
}

const comparisonFor = column => comparisonOf(column);

const contextWith = (before, after) => ({
  body: {
    Filtrar_resultados_por_Expediente: [{ ID: 329 }],
  },
  outputs: {
    [BEFORE_ACTION]: { body: { value: [before] } },
    [AFTER_ACTION]: { body: { value: [after] } },
  },
  variables: { ArrayResponsables: '' },
});

test('the comparison reports nothing when the value did not move', () => {
  const comparison = comparisonFor('Title');
  const row = { Title: 'Expediente 1205' };
  assert.equal(evaluate(comparison, contextWith(row, row)), '');
});

test('the comparison names the column, the previous value and the new one', () => {
  const comparison = comparisonFor('Title');
  const before = { Title: 'Expediente 1205' };
  const after = { Title: 'Expediente 1206' };
  assert.equal(evaluate(comparison, contextWith(before, after)), '; Title: Expediente 1205 -> Expediente 1206');
});

test('a date is compared as the list keeps it', () => {
  const comparison = comparisonFor('FechaInicioContrato');
  const row = { FechaInicioContrato: '2026-03-03T23:00:00Z' };
  assert.equal(evaluate(comparison, contextWith(row, row)), '', 'the same day is the same value');
  const moved = { FechaInicioContrato: '2026-04-01T22:00:00Z' };
  assert.equal(
    evaluate(comparison, contextWith(row, moved)),
    '; FechaInicioContrato: 2026-03-03T23:00:00Z -> 2026-04-01T22:00:00Z',
    'another day is a change',
  );
});

test('a column that was never filled is compared as empty on both sides', () => {
  const comparison = comparisonFor('FechaCertificacion');
  assert.equal(evaluate(comparison, contextWith({}, {})), '', 'two empty values are the same');
  assert.equal(
    evaluate(comparison, contextWith({}, { FechaCertificacion: '2026-03-03T23:00:00Z' })),
    '; FechaCertificacion:  -> 2026-03-03T23:00:00Z',
    'a column that was empty and now has a value is a change',
  );
});

test('a column that had a value and now is empty is a change', () => {
  const comparison = comparisonFor('Observaciones');
  const before = { Observaciones: 'El lote 2 lo ha ganado otra empresa' };
  assert.equal(
    evaluate(comparison, contextWith(before, { Observaciones: '' })),
    '; Observaciones: El lote 2 lo ha ganado otra empresa -> ',
  );
});

test('the boolean of the list is the text that the list keeps', () => {
  const comparison = comparisonFor('CadenaPecal');
  const row = { CadenaPecal: 'True' };
  assert.equal(evaluate(comparison, contextWith(row, row)), '', 'the same text is the same value');
  assert.equal(
    evaluate(comparison, contextWith(row, { CadenaPecal: 'False' })),
    '; CadenaPecal: True -> False',
  );
});

test('the number of the list is the number of the list', () => {
  const comparison = comparisonFor('ImporteLicitacion');
  const row = { ImporteLicitacion: 1000 };
  assert.equal(evaluate(comparison, contextWith(row, row)), '');
  assert.equal(
    evaluate(comparison, contextWith(row, { ImporteLicitacion: 2000 })),
    '; ImporteLicitacion: 1000 -> 2000',
  );
});

test('the member list is the text that the list keeps', () => {
  const comparison = comparisonFor('Miembros');
  const row = { Miembros: 'Rosa Maria Fuentes Herrero - rosa@telefonica.com;' };
  assert.equal(evaluate(comparison, contextWith(row, row)), '');
  assert.equal(
    evaluate(comparison, contextWith(row, { Miembros: 'Tatiana Shulca Quinaupa - tatiana@telefonica.com;' })),
    '; Miembros: Rosa Maria Fuentes Herrero - rosa@telefonica.com; -> Tatiana Shulca Quinaupa - tatiana@telefonica.com;',
  );
});

test('the comparison cannot fail on a value that is not there', () => {
  for (const comparison of buildComparisons()) {
    assert.doesNotThrow(
      () => evaluate(comparison.expression, contextWith({}, {})),
      `the comparison of ${comparison.column} failed with empty values`,
    );
  }
});

// The context of the log: the two rows of the list and the result of every chunk. A Compose
// action has no body, so the context of the body of the log does not have the chunks at all:
// that is why "body('Calcular_Cambios_1')" answered nothing and the log said that nothing had
// changed, while the chunks themselves had the right text.
const logContext = (before, after) => ({
  body: {
    Filtrar_resultados_por_Expediente: [{ ID: 329 }],
  },
  outputs: {
    [BEFORE_ACTION]: { body: { value: [before] } },
    [AFTER_ACTION]: { body: { value: [after] } },
    Calcular_Cambios_1: '; Observaciones: antes -> despues',
    Calcular_Cambios_2: '',
    Calcular_Cambios_3: '',
  },
  variables: {},
});

test('the log of the ingestion writes the trace of the chunks', () => {
  const value = branch[LOG_ACTION].inputs.value;
  assert.equal(
    evaluate(value.Cambios.replace(/^@/, ''), logContext({ Observaciones: 'antes' }, { Observaciones: 'despues' })),
    '; Observaciones: antes -> despues',
    'the log writes what the chunks found',
  );
});

test('the trace of the log came out empty when it was read with body', () => {
  const old = `@concat(${chunkNames.map(name => `body('${name}')`).join(',')})`;
  assert.equal(
    evaluate(old.replace(/^@/, ''), logContext({ Observaciones: 'antes' }, { Observaciones: 'despues' })),
    '',
    'the body of a Compose is nothing, so the old expression wrote nothing even with a change',
  );
});
