'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const generator = require('./prepare-ordering-guard.cjs');

const {
  META_BASE64,
  BASE_HASH, CHILD_HASH, SCOPE, LOOP, GUARD_SCOPE, GUARD_TRY, GUARD_CATCH, GUARD_IF, KEY_CURRENT,
  READ_STATE, READ_STORED, DELETE_STATE, CREATE_STATE, DECIDE, DECIDE_FALLBACK, APPEND_APPLIED, APPEND_OLD,
  LOOP_APPLIED,
  COUNT_OLD, VAR_APPLY, VAR_OLD,
  STATE_COLUMN, CHAIN, keyOf, prepare, compare, readBase, definitionHash, diffPaths, dependencyCycles,
} = generator;

const base = readBase();
const candidate = prepare(base);
const loop = generator.get(candidate.definition, `${SCOPE}.Por_cada_Expediente.actions`);
const guard = loop[GUARD_SCOPE];

test('the base is the published parent of DEV/CERT and the child is not touched', () => {
  assert.equal(definitionHash(base.definition), BASE_HASH);
  const child = readBase(generator.CHILD_PATH, CHILD_HASH);
  assert.equal(definitionHash(child.definition), CHILD_HASH);
  const comparison = compare(base, candidate);
  assert.equal(comparison.childIsUntouched, true, 'the phase does not change the child flow');
});

test('the candidate closes no dependency cycle', () => {
  assert.deepEqual(dependencyCycles(candidate.definition), []);
});

test('the guard is a scope with a catch, and the catch applies the file', () => {
  assert.equal(guard.type, 'Scope');
  assert.ok(guard.actions[GUARD_TRY], 'the scope has no try');
  assert.ok(guard.actions[GUARD_CATCH], 'the scope has no catch');
  assert.deepEqual(guard.actions[GUARD_CATCH].runAfter, { [GUARD_TRY]: ['Failed'] });
  assert.equal(
    guard.actions[GUARD_CATCH].actions[DECIDE_FALLBACK].inputs.value,
    1,
    'when the comparison cannot be made the file is applied: a guard that breaks the ingestion ' +
    'is worse than a guard that does nothing',
  );
});

test('the comparison reads the key stored for the expediente and the key of the file', () => {
  const tryActions = guard.actions[GUARD_TRY].actions;
  assert.ok(tryActions[READ_STATE], 'the file of the state is not read');
  assert.ok(tryActions[READ_STATE].inputs.where.includes('estado_'), 'the file of the state is not the one of the expediente');
  assert.ok(tryActions[READ_STORED], 'the key of the state is not read');
  assert.ok(tryActions[READ_STORED].inputs.parameters.id.includes(READ_STATE), 'the key of the state is not the one of the file');
  const keyOfFile = generator.get(candidate.definition, `${SCOPE}.${KEY_CURRENT}`);
  assert.ok(keyOfFile.inputs.includes("body('Parse_JSON')?['meta']?['generatedAt']"), 'the key of the file is not its generation time');
});

test('the comparison is made with the digits of the instant, as a number', () => {
  const key = generator.get(candidate.definition, `${SCOPE}.${KEY_CURRENT}`).inputs;
  assert.ok(key.startsWith('@int(concat('), 'the key is a number');
  assert.equal((key.match(/substring\(/g) || []).length, 6, 'the key is the six parts of the instant');
  assert.ok(!key.includes('tick('), 'the platform is not asked to compare dates');
});

test('the key of an instant sorts the instants the way the time does', () => {
  // A small evaluator of the three functions of the key: concat, substring and int.
  const evaluate = (expression, value) => {
    const parts = [...expression.matchAll(/substring\([^,]+,(\d+),(\d+)\)/g)].map(match => value.slice(Number(match[1]), Number(match[1]) + Number(match[2])));
    return Number(parts.join(''));
  };
  const key = keyOf('body(\'X\')').replace(/^int\(concat\(|\)\)$/g, '');
  const older = evaluate(key, '2026-11-03T08:45:34.000Z');
  const newer = evaluate(key, '2026-11-04T08:45:34.000Z');
  assert.equal(older, 20261103084534);
  assert.equal(newer, 20261104084534);
  assert.ok(older < newer, 'the older instant has the smaller key');
  assert.equal(evaluate(key, '2026-11-04T08:45:34.000Z'), evaluate(key, '2026-11-04T08:45:34.000Z'), 'the same instant has the same key');
});

test('an empty instant sorts before every real instant', () => {
  const key = keyOf('body(\'X\')').replace(/^int\(concat\(|\)\)$/g, '');
  const empty = [...key.matchAll(/substring\([^,]+,(\d+),(\d+)\)/g)].map(match => '0000-00-00T00:00:00.000Z'.slice(Number(match[1]), Number(match[1]) + Number(match[2]))).join('');
  assert.equal(Number(empty), 0);
  assert.ok(Number(empty) < 20261104084534, 'the empty instant is older than any real one');
});

test('the decision applies the file when its instant is newer and skips it when it is older', () => {
  const decision = guard.actions[GUARD_TRY].actions[DECIDE].inputs.value;
  assert.ok(decision.includes(`body('${READ_STORED}')`), 'the stored key is one of the two');
  assert.ok(decision.includes(`outputs('${KEY_CURRENT}')`), 'the instant of the file is the other one');
  assert.ok(decision.includes('greater('), 'the two instants are compared');
  assert.ok(
    decision.includes(`equals(outputs('${KEY_CURRENT}'),0)`),
    'a file without a generation time is applied: its key is zero',
  );
});

test('the branch of the expedientes that are applied keeps the chain that calls the child', () => {
  const applied = loop[GUARD_SCOPE].actions[GUARD_IF].actions;
  for (const name of CHAIN) assert.ok(applied[name], `the action ${name} is not in the branch of the applied expedientes`);
  assert.equal(applied['Ejecutar_Flujo_E2E_Alta_Expedientes_Modulo1'].type, 'Workflow');
  CHAIN.forEach((name, index) => {
    const expected = index === 0 ? {} : { [CHAIN[index - 1]]: ['Succeeded'] };
    assert.deepEqual(applied[name].runAfter, expected, `the chain of ${name} is broken`);
  });
});

test('the branch of the expedientes whose file is old writes nothing and is logged', () => {
  const old = loop[GUARD_SCOPE].actions[GUARD_IF].else.actions;
  assert.ok(old[APPEND_OLD], 'the old expedientes are not logged');
  assert.equal(old[APPEND_OLD].inputs.value.Estado, 'Antiguo');
  assert.ok(old[COUNT_OLD], 'the old expedientes are not counted');
  assert.equal(old[COUNT_OLD].inputs.name, VAR_OLD);
  for (const name of CHAIN) {
    assert.ok(!loop[name], `the action ${name} is still in the loop: it would run for an old file`);
  }
});

test('the branch of the applied expedientes is the one the decision opens', () => {
  assert.deepEqual(loop[GUARD_SCOPE].actions[GUARD_IF].expression, { equals: [`@variables('${VAR_APPLY}')`, 1] });
  assert.deepEqual(loop[GUARD_SCOPE].actions[GUARD_IF].runAfter, {
    [GUARD_TRY]: ['Succeeded', 'Failed'],
    [GUARD_CATCH]: ['Succeeded', 'Skipped'],
  });
});

test('the state is a file of the library of the logs, written after the ingestion', () => {
  const scope = generator.get(candidate.definition, SCOPE);
  assert.ok(scope[KEY_CURRENT], 'the key of the file is not computed');
  assert.ok(scope[KEY_CURRENT].inputs.includes('int(concat('), 'the key of the file is not a number');
  assert.ok(scope[LOOP_APPLIED], 'the state of the applied expedientes is not written');
  const create = scope[LOOP_APPLIED].actions[CREATE_STATE];
  assert.equal(create.type, 'OpenApiConnection');
  assert.ok(create.inputs.parameters.name.includes('estado_'), 'the file of the state is not named after the expediente');
  assert.ok(create.inputs.parameters.body.includes(KEY_CURRENT), 'the state does not carry the key of the file');
});

test('the totals of the log carry the expedientes whose file was old', () => {
  const totals = generator.get(candidate.definition, `${SCOPE}.Anexar_Totales_a_ResultadoJSON`);
  assert.equal(totals.inputs.value.Antiguos, `@variables('${VAR_OLD}')`);
  assert.deepEqual(totals.runAfter, { [LOOP_APPLIED]: ['Succeeded'] });
});

test('the variables of the guard are initialized before the file is read', () => {
  assert.equal(candidate.definition.actions['INI_AplicarElExpediente'].inputs.variables[0].type, 'integer');
  assert.equal(candidate.definition.actions['INI_ContadorAntiguos'].inputs.variables[0].type, 'integer');
  assert.deepEqual(
    candidate.definition.actions['Comprobar_que_el_archivo_es_JSON'].runAfter,
    { INI_AplicarElExpediente: ['Succeeded'] },
  );
});

test('the diagnostic is only written when it is asked for', () => {
  const without = prepare(base).definition;
  assert.ok(!without.actions['INI_OrdenJSON'], 'the diagnostic is always written');
  process.env.ORDERING_DIAGNOSTIC = '1';
  try {
    const withDiagnostic = prepare(base).definition;
    assert.ok(withDiagnostic.actions['INI_OrdenJSON'], 'the diagnostic is not written when it is asked for');
    const guardOf = generator.get(withDiagnostic, `${SCOPE}.Por_cada_Expediente.actions.${GUARD_SCOPE}`);
    assert.ok(guardOf.actions[GUARD_TRY].actions[`${DECIDE}_Diagnostico`], 'the diagnostic does not say what it compared');
  } finally {
    delete process.env.ORDERING_DIAGNOSTIC;
  }
});

test('nothing else of the parent is touched', () => {
  const comparison = compare(base, candidate);
  assert.ok(comparison.changedPathCount > 0);
  const allowed = [
    '$.actions.INI_ContadorAntiguos',
    '$.actions.INI_ExpedientesAplicados',
    '$.actions.INI_AplicarElExpediente',
    `$.${SCOPE}.Por_cada_Expediente.actions.${GUARD_SCOPE}`,
    `$.${SCOPE}.Por_cada_Expediente.actions.${GUARD_SCOPE}.actions.${GUARD_IF}`,
    `$.${SCOPE}.${KEY_CURRENT}`,
    `$.${SCOPE}.${META_BASE64}`,
    `$.${SCOPE}.${LOOP_APPLIED}`,
    `$.${SCOPE}.Por_cada_Expediente.actions.${GUARD_SCOPE}`,
    `$.${SCOPE}.Por_cada_Expediente.runAfter`,
    `$.${SCOPE}.Anexar_Totales_a_ResultadoJSON`,
    '$.actions.Comprobar_que_el_archivo_es_JSON.runAfter',
  ];
  // The chain of the applied expedientes moves from the loop into the branch of the decision.
  for (const name of CHAIN) {
    allowed.push(`$.${SCOPE}.Por_cada_Expediente.actions.${name}`);
    allowed.push(`$.${SCOPE}.Por_cada_Expediente.actions.${GUARD_SCOPE}.actions.${GUARD_IF}.actions.${name}`);
  }
  const changed = diffPaths(base.definition, candidate.definition);
  for (const path of changed) {
    assert.ok(
      allowed.some(prefix => path === prefix || path.startsWith(`${prefix}.`)),
      `unexpected changed path: ${path}`,
    );
  }
});

test('a source that is not the reviewed parent is rejected', () => {
  const tampered = JSON.parse(JSON.stringify(base.definition));
  tampered.actions['INI_ContadorNuevos'] = { type: 'InitializeVariable', inputs: { name: 'x' } };
  const file = path.join(fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'ordering-')), 'definition.json');
  fs.writeFileSync(file, JSON.stringify(tampered));
  assert.throws(() => readBase(file), /the base is not the published parent of DEV\/CERT/);
});

test('the outputs stay inside the ignored subtree', () => {
  assert.ok(generator.DIRECTORY.includes(`${path.sep}.atl${path.sep}`));
  assert.throws(
    () => generator.validateDestination(path.join(require('node:os').tmpdir(), 'candidate-definition.json'), false),
    /destination must stay inside/,
  );
});
