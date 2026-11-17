'use strict';
// Offline candidate preparation only: no authentication, cloud client, upload or deployment.
// Builds the phase E on top of the published parent flow of DEV/CERT (2A2E04E4...):
//
// The ordering guard: an ingestion whose JSON is older than the one already applied to an
// expediente must not overwrite it.
//
// THE GUARD LIVES IN THE PARENT, which orchestrates and decides whether an expediente is
// processed at all. The whole branch of the expediente is skipped when the file is old: the
// staging row, the application list, Dataverse, the roles, the milestones and the suppliers.
// The child flow, which reconciles, is not touched by this phase.
//
// THE STATE is the generation time of the last JSON applied to the expediente, as the number of
// the fourteen digits of the instant. It lives in a FILE of the library of the logs, one file per
// expediente (estado_<idexpediente>.json), because no flow of the environment can write a column
// of the staging list: the definition of the operations of the connection is a copy made before
// the column existed, and the platform refuses the parameter of the write. The parent reads the
// file before the ingestion and writes it after, when the child has applied the file. The content
// of the file is the key, bare, so the answer of the REST is a number that the platform compares
// without failing.
//
// THE COMPARISON is per expediente, never per file: every expediente of a file shares the
// generation time of the export, but the state is the one of each expediente, so a file that is
// partially newer and partially older is applied only where it is newer.
//
// The instants are ISO 8601 UTC, so the comparison is made with their fourteen digits, as a
// number: int(concat(substring(...))) turns an instant into a number that sorts the way the time
// does. The comparison lives in a scope with a catch: when it cannot be made the file is applied
// (fail open), because a guard that breaks the ingestion is worse than a guard that does nothing.
//
// THE READ of the state is a REST of the site: the connector of the library answers with the
// items of the library without the name of the file in any field, so the file is asked by its
// name, with the form the REST accepts:
//     _api/web/lists/getByTitle(<biblioteca>)/RootFolder/Files('<nombre>')/$value
// The form without the parenthesis answers 404, and the form with the complete URL answers 400
// (the path of the server relative cannot have the host).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { dependencyCycles } = require('./prepare-role-scoped-delete.cjs');

const DIRECTORY = path.resolve(__dirname, '../../.atl/project-title-sync/ordering-guard-20261116');
const BASE_PATH = path.join(DIRECTORY, 'a9928111-cd13-f111-8341-7c1e5233f7d8.definition.json');
const BASE_HASH = '2A2E04E46A5350C9D35D74E2C3F12CC7F61A3D03F6A70FECD366434EFD2FF1E3';
const CHILD_PATH = path.join(DIRECTORY, '1ca49582-ae1e-f111-8342-6045bde02c54.definition.json');
const CHILD_HASH = '062C26A11FAB4AA8B0E44441C13E739F28EBD28FD072BCCD0AB5E904BF6856BD';
const OUTPUTS = ['candidate-definition.json', 'candidate-comparison.json'];

// The paths of the actions of the parent.
const IF_ACTION = 'Comprobar_que_el_archivo_es_JSON';
const SCOPE = `actions.${IF_ACTION}.actions.Try_-_Procesar_ExpedientesJSON.actions`;
const LOOP = `${SCOPE}.Por_cada_Expediente.actions`;

// The names of the actions of the guard.
const GUARD_SCOPE = 'Comprobar_el_orden_del_JSON';
const GUARD_TRY = 'Try_Comprobar_el_orden';
const GUARD_CATCH = 'Catch_Comprobar_el_orden';
const KEY_CURRENT = 'Calcular_la_clave_del_JSON';
const READ_STORED = 'Leer_la_Clave_guardada';
const FILTER_ERROR = 'Filtrar_el_Error_del_Orden';
const DECIDE = 'Calcular_el_orden';
const DECIDE_FALLBACK = 'Calcular_el_orden_por_fallo';
const GUARD_IF = 'Guardar_el_orden_del_JSON';
const APPEND_APPLIED = 'Anexar_Expediente_Aplicado';
const APPEND_OLD = 'Append_ResultadoJSON_Antiguo';
const COUNT_OLD = 'Incrementar_Antiguos';
const READ_AFTER = 'Leer_ExpedientesJSON_Despues';
const LOOP_APPLIED = 'Por_cada_Expediente_Aplicado';
const FILTER_ROW = 'Filtrar_la_fila_del_Expediente';
const WRITE_STATE = 'Actualizar_la_Fecha_de_Generacion';
const READ_STATE = 'Leer_el_Estado_del_Expediente';
const COMPOSE_STORED = 'Calcular_la_clave_guardada';
const READ_LOGS = 'Leer_la_Biblioteca_de_Logs';
const DELETE_STATE = 'Eliminar_el_Estado_anterior';
const CREATE_STATE = 'Crear_el_Estado_del_Expediente';
const WRITE_SCOPE = 'Guardar_la_Clave_de_Generacion';
const WRITE_TRY = 'Try_Guardar_la_Clave';
const WRITE_CATCH = 'Catch_Guardar_la_Clave';
const META_BASE64 = 'JSON_Meta_Base64';
const APPEND_DIAGNOSTIC = 'Append_ResultadoJSON_Orden';

// The variables of the guard.
const VAR_APPLY = 'AplicarElExpediente';
const VAR_APPLIED = 'ExpedientesAplicados';
const VAR_OLD = 'ContadorAntiguos';
const VAR_DIAGNOSTIC = 'OrdenJSON';

// The column of the staging row that holds the key of the generation time of the last applied JSON.
const STATE_COLUMN = 'ClaveGeneracionJSON';
// The instant that stands for "nothing stored": it sorts before every real instant.
const EMPTY_INSTANT = '0000-00-00T00:00:00.000Z';
// The parts of an ISO 8601 UTC instant that make it comparable as a number.
const INSTANT_PARTS = [[0, 4], [5, 2], [8, 2], [11, 2], [14, 2], [17, 2]];

const sort = value => Array.isArray(value)
  ? value.map(sort)
  : (value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])]))
    : value);
const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const definitionHash = definition => hash(JSON.stringify(sort(definition)));
const get = (root, key) => key.split('.').reduce((node, part) => node?.[part], root);

function readBase(basePath = BASE_PATH, expected = BASE_HASH) {
  const definition = JSON.parse(fs.readFileSync(basePath, 'utf8'));
  assert.equal(definitionHash(definition), expected, 'the base is not the published parent of DEV/CERT');
  return { definition };
}

// The key of an instant: its fourteen digits as a number. The comparison of two instants is then
// the comparison of two numbers, which the platform answers without failing.
function keyOf(expression) {
  const parts = INSTANT_PARTS.map(([start, length]) => `substring(${expression},${start},${length})`);
  return `int(concat(${parts.join(',')}))`;
}

// The expression of the generation time of the file, with the empty instant as the default.
const currentInstant = `coalesce(body('Parse_JSON')?['meta']?['generatedAt'],'${EMPTY_INSTANT}')`;
// The expression of the key stored for the expediente. An expediente that is not in the list has
// no state: the key of the empty instant is zero, and the file is applied.
const storedKey = `coalesce(first(body('Filtrar_resultados_por_Expediente'))?['${STATE_COLUMN}'],0)`;

// The action that reads the file: it is the one the parent parses with the envelope.
function assertParentIsTheReviewedOne(definition) {
  const parse = get(definition, `actions.${IF_ACTION}.actions.Try_-_Validacion_JSON.actions.Parse_JSON`);
  assert.ok(parse, 'the parent does not parse the uploaded file');
  assert.equal(parse.type, 'ParseJson', 'the parent does not parse the uploaded file');
  const meta = get(parse, 'inputs.schema.properties.meta.properties.generatedAt');
  assert.deepEqual(meta, { type: 'string' }, 'the envelope of the file does not carry the generation time');
  const loop = get(definition, `actions.${IF_ACTION}.actions.Try_-_Procesar_ExpedientesJSON.actions.Por_cada_Expediente`);
  assert.ok(loop, 'the parent does not loop over the expedientes of the file');
  assert.equal(loop.foreach, "@body('Parse_JSON')?['data']", 'the loop is over the data of the file');
  const call = get(definition, `${LOOP}.Ejecutar_Flujo_E2E_Alta_Expedientes_Modulo1`);
  assert.ok(call, 'the parent does not call the child flow');
  assert.equal(call.type, 'Workflow', 'the call to the child is not a workflow action');
  assert.equal(
    call.inputs.host.workflowReferenceName,
    '1ca49582-ae1e-f111-8342-6045bde02c54',
    'the parent does not call the child of the reconciliation',
  );
}

// The actions that the guard moves into the branch of the expedientes that are applied.
const CHAIN = [
  'JSON_Expediente_Base64',
  'Ejecutar_Flujo_E2E_Alta_Expedientes_Modulo1',
  'Append_ResultadoJSON',
  'Incrementar_Fallidos',
  'Increment_Actualizados',
  'Increment_Nuevos',
];

function compose(inputs, runAfter = {}) {
  return { runAfter, metadata: { operationMetadataId: '00000000-0000-0000-0000-000000000000' }, type: 'Compose', inputs };
}

function setVariable(name, value, runAfter = {}) {
  return { runAfter, metadata: { operationMetadataId: '00000000-0000-0000-0000-000000000000' }, type: 'SetVariable', inputs: { name, value } };
}

function initialize(name, type, value, runAfter = {}) {
  return {
    runAfter,
    metadata: { operationMetadataId: '00000000-0000-0000-0000-000000000000' },
    type: 'InitializeVariable',
    inputs: { variables: [{ name, type, value }] },
  };
}

function prepare(base) {
  const result = JSON.parse(JSON.stringify(base));
  assertParentIsTheReviewedOne(result.definition);

  const loop = get(result.definition, `${SCOPE}.Por_cada_Expediente`);
  const loopActions = loop.actions;
  const scopeActions = get(result.definition, SCOPE);
  const read = scopeActions['Obtener_ExpedienteJSON'];
  assert.ok(read, 'the parent does not read the staging list');
  for (const name of CHAIN) {
    assert.ok(loopActions[name], `the action ${name} is not in the loop of the parent`);
    assert.ok(!loopActions[GUARD_SCOPE], `the action ${GUARD_SCOPE} already exists`);
  }

  // The variables of the guard, next to the counters of the parent.
  result.definition.actions['INI_ContadorAntiguos'] = initialize(VAR_OLD, 'integer', 0, { INI_JSONInvalido: ['Succeeded'] });
  result.definition.actions['INI_ExpedientesAplicados'] = initialize(VAR_APPLIED, 'array', [], { INI_ContadorAntiguos: ['Succeeded'] });
  result.definition.actions['INI_AplicarElExpediente'] = initialize(VAR_APPLY, 'integer', 1, { INI_ExpedientesAplicados: ['Succeeded'] });
  if (process.env.ORDERING_DIAGNOSTIC === '1') {
    result.definition.actions['INI_OrdenJSON'] = initialize(VAR_DIAGNOSTIC, 'string', '', { INI_AplicarElExpediente: ['Succeeded'] });
    result.definition.actions[IF_ACTION].runAfter = { INI_OrdenJSON: ['Succeeded'] };
  } else {
    result.definition.actions[IF_ACTION].runAfter = { INI_AplicarElExpediente: ['Succeeded'] };
  }

  // The comparison, in a scope with a catch: when it cannot be made the file is applied.
  loopActions[GUARD_SCOPE] = {
    runAfter: { Filtrar_resultados_por_Expediente: ['Succeeded'] },
    metadata: { operationMetadataId: '00000000-0000-0000-0000-000000000000' },
    type: 'Scope',
    actions: {
      [GUARD_TRY]: {
        runAfter: {},
        metadata: { operationMetadataId: '00000000-0000-0000-0000-000000000000' },
        type: 'Scope',
        actions: {
          // The state of the expediente is a file of the library of the logs: the flows of the
          // environment cannot write a field of an item, but they do write files without problem.
          [READ_STATE]: {
            runAfter: {},
            metadata: { operationMetadataId: '00000000-0000-0000-0000-000000000000' },
            type: 'OpenApiConnection',
            inputs: {
              parameters: {
                dataset: read.inputs.parameters.dataset,
                'parameters/method': 'GET',
                'parameters/uri': "_api/web/lists/getByTitle(%27@{substring(parameters('E2E_BibliotecaCargaJSON_Logs (cr435_E2E_BibliotecaCargaJSON_Logs)'),1)}%27)/RootFolder/Files(%27estado_@{items('Por_cada_Expediente')?['idexpediente']}.json%27)/$value",
              },
              host: { ...read.inputs.host, operationId: 'HttpRequest' },
            },
          },
          // The file is applied when its instant is newer than the stored one, or when the file
          // does not say when it was generated (the empty instant sorts before everything).
          // The key that is stored is read as a number first, in its own action: the content of
          // the file is the key, bare, so the answer of the REST is a number that the platform
          // compares without failing. Keeping the decision shallow is what the platform accepts:
          // an expression with the comparison inside the condition is invoked with one parameter
          // and the platform refuses it ("The template language function 'if' expects three
          // parameter ... The function was invoked with '1' parameter(s)').
          [COMPOSE_STORED]: compose(
            "@int(coalesce(string(coalesce(body('" + READ_STATE + "'),'0')),'0'))",
            { [READ_STATE]: ['Succeeded'] },
          ),
          [DECIDE]: setVariable(
            VAR_APPLY,
            "@if(or(equals(outputs('" + KEY_CURRENT + "'),0),not(greater(outputs('" + COMPOSE_STORED + "'),outputs('" + KEY_CURRENT + "')))),1,0)",
            { [COMPOSE_STORED]: ['Succeeded'] },
          ),
        },
      },
      [GUARD_CATCH]: {
        runAfter: { [GUARD_TRY]: ['Failed'] },
        metadata: { operationMetadataId: '00000000-0000-0000-0000-000000000000' },
        type: 'Scope',
        actions: {
          // The comparison failed: the file is applied, because a guard that blocks the
          // ingestion is worse than a guard that does nothing.
          [DECIDE_FALLBACK]: setVariable(VAR_APPLY, 1),
          // The error of the comparison, so a case that cannot decide says why.
          [FILTER_ERROR]: {
            runAfter: {},
            metadata: { operationMetadataId: '00000000-0000-0000-0000-000000000000' },
            type: 'Query',
            inputs: {
              from: `@result('${GUARD_TRY}')`,
              where: "@equals(item()?['status'], 'Failed')",
            },
          },
        },
      },
    },
  };

  if (process.env.ORDERING_DIAGNOSTIC === '1') {
    loopActions[GUARD_SCOPE].actions[GUARD_TRY].actions[`${DECIDE}_Diagnostico`] = setVariable(
      VAR_DIAGNOSTIC,
      `@concat('clave del JSON=',string(outputs('${KEY_CURRENT}')),' clave guardada=',string(outputs('${COMPOSE_STORED}')),` +
      `' aplicada=',string(variables('${VAR_APPLY}')))`,
      { [COMPOSE_STORED]: ['Succeeded'] },
    );
    loopActions[GUARD_SCOPE].actions[GUARD_CATCH].actions[`${DECIDE_FALLBACK}_Diagnostico`] = setVariable(
      VAR_DIAGNOSTIC,
      `@concat('La comparacion no se pudo hacer y el JSON se aplica: ',string(coalesce(first(body('${FILTER_ERROR}'))?['error']?['message'],'sin mensaje')))`,
      { [FILTER_ERROR]: ['Succeeded'] },
    );
  }

  // The branch of the expedientes that are applied: the chain that was in the loop moves here.
  const applied = {};
  CHAIN.forEach((name, index) => {
    const action = loopActions[name];
    action.runAfter = index === 0 ? {} : { [CHAIN[index - 1]]: ['Succeeded'] };
    applied[name] = action;
    delete loopActions[name];
  });
  applied[APPEND_APPLIED] = {
    runAfter: { Append_ResultadoJSON: ['Succeeded'] },
    metadata: { operationMetadataId: '00000000-0000-0000-0000-000000000000' },
    type: 'AppendToArrayVariable',
    inputs: { name: VAR_APPLIED, value: "@items('Por_cada_Expediente')?['idexpediente']" },
  };
  if (process.env.ORDERING_DIAGNOSTIC === '1') {
    applied[APPEND_DIAGNOSTIC] = {
      runAfter: { Append_ResultadoJSON: ['Succeeded'] },
      metadata: { operationMetadataId: '00000000-0000-0000-0000-000000000000' },
      type: 'AppendToArrayVariable',
      inputs: {
        name: 'ResultadoJSON',
        value: {
          ID: "@items('Por_cada_Expediente')?['idexpediente']",
          Estado: 'Orden',
          Log: "@variables('" + VAR_DIAGNOSTIC + "')",
        },
      },
    };
  }

  // The branch of the expedientes whose file is old: nothing is written and it is logged.
  const old = {
    [APPEND_OLD]: {
      runAfter: {},
      metadata: { operationMetadataId: '00000000-0000-0000-0000-000000000000' },
      type: 'AppendToArrayVariable',
      inputs: {
        name: 'ResultadoJSON',
        value: {
          ID: "@items('Por_cada_Expediente')?['idexpediente']",
          Estado: 'Antiguo',
          Log: 'El JSON es anterior al que ya se aplico a este expediente: no se aplica',
        },
      },
    },
    [COUNT_OLD]: {
      runAfter: { [APPEND_OLD]: ['Succeeded'] },
      metadata: { operationMetadataId: '00000000-0000-0000-0000-000000000000' },
      type: 'IncrementVariable',
      inputs: { name: VAR_OLD, value: 1 },
    },
  };

  // The decision is a sibling of the try and of the catch: the platform refuses a runAfter that
  // names an action of another level ('the action 'Try_Comprobar_el_orden' must belong to same
  // level as action 'Guardar_el_orden_del_JSON').
  loopActions[GUARD_SCOPE].actions[GUARD_IF] = {
    runAfter: {
      [GUARD_TRY]: ['Succeeded', 'Failed'],
      [GUARD_CATCH]: ['Succeeded', 'Skipped'],
    },
    metadata: { operationMetadataId: '00000000-0000-0000-0000-000000000000' },
    type: 'If',
    expression: { equals: [`@variables('${VAR_APPLY}')`, 1] },
    actions: applied,
    else: { actions: old },
  };

  // The key of the instant of the file is the same for every expediente of the file, so it is
  // computed once, before the loop, and read by the guard and by the write of the state.
  scopeActions[KEY_CURRENT] = compose(`@${keyOf(currentInstant)}`, { Append_Resultado_JSON_Log_inicial: ['Succeeded'] });

  // The envelope of the file travels to the child, which parses it: the key travels inside it.
  // The state of the expediente is written by the parent, as a file of the library of the logs:
  // the connection of the parent cannot write a field of an item, because its definition of the
  // operations does not know the columns of the list.
  scopeActions[META_BASE64] = compose(
    "@base64(string(body('Parse_JSON')?['meta']?['generatedAt']))",
    { [KEY_CURRENT]: ['Succeeded'] },
  );
  // The call to the child reads the envelope, so the envelope has to be in its path.
  loop.runAfter = { [META_BASE64]: ['Succeeded'] };
  assert.ok(scopeActions[META_BASE64], 'the envelope of the file is not prepared');

  // The state of the expedientes that were applied: a file of the library of the logs, with the
  // key of the generation time of the file. The name of the file only depends on the expediente,
  // so there is one state file per expediente and not one per ingestion, and the file is written
  // again (overwritten) every time a newer JSON is applied to that expediente.
  scopeActions[LOOP_APPLIED] = {
    runAfter: { Por_cada_Expediente: ['Succeeded'] },
    metadata: { operationMetadataId: '00000000-0000-0000-0000-000000000000' },
    type: 'Foreach',
    foreach: `@variables('${VAR_APPLIED}')`,
    actions: {
      [CREATE_STATE]: {
        runAfter: {},
        metadata: { operationMetadataId: '00000000-0000-0000-0000-000000000000' },
        type: 'OpenApiConnection',
        inputs: {
          parameters: {
            dataset: read.inputs.parameters.dataset,
            folderPath: "@parameters('E2E_BibliotecaCargaJSON_Logs (cr435_E2E_BibliotecaCargaJSON_Logs)')",
            name: "@concat('estado_',string(items('" + LOOP_APPLIED + "')),'.json')",
            body: `@string(outputs('${KEY_CURRENT}'))`,
          },
          host: { ...read.inputs.host, operationId: 'CreateFile' },
        },
      },
    },
  };

  // The totals of the log carry the expedientes whose file was old.
  const totals = scopeActions['Anexar_Totales_a_ResultadoJSON'];
  assert.ok(totals, 'the parent does not write the totals of the log');
  totals.inputs.value.Antiguos = `@variables('${VAR_OLD}')`;
  totals.runAfter = { [LOOP_APPLIED]: ['Succeeded'] };

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
  const cycles = dependencyCycles(candidate.definition);
  assert.deepEqual(cycles, [], `the candidate must not close a dependency cycle: ${cycles.join(' | ')}`);
  const loop = get(candidate.definition, `${SCOPE}.Por_cada_Expediente.actions`);
  const guard = loop[GUARD_SCOPE];
  assert.ok(guard, 'the candidate does not have the scope of the guard');
  const decide = guard.actions[GUARD_TRY].actions[DECIDE];
  assert.ok(decide, 'the candidate does not decide the order of the file');
  return {
    changedPathCount: changed.length,
    sourceDefinitionSha256: definitionHash(base.definition),
    candidateDefinitionSha256: definitionHash(candidate.definition),
    stateColumn: STATE_COLUMN,
    appliedAction: GUARD_IF,
    oldState: VAR_OLD,
    decision: decide.inputs.value,
    comparison: guard.actions[GUARD_TRY].actions[READ_STATE].inputs,
    keyOfTheFile: get(candidate.definition, `${SCOPE}.${KEY_CURRENT}`).inputs,
    catchDecision: guard.actions[GUARD_CATCH].actions[DECIDE_FALLBACK].inputs,
    childIsUntouched: true,
  };
}

function validateDestination(destination, exclusive = true) {
  const resolved = path.resolve(destination);
  const relative = path.relative(DIRECTORY, resolved);
  assert.ok(relative && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`),
    'destination must stay inside the ignored candidate subtree');
  if (exclusive) assert.ok(!fs.existsSync(resolved), 'refusing to overwrite an existing output');
}

function writeOutputs(destination = DIRECTORY) {
  for (const name of OUTPUTS) validateDestination(path.join(destination, name));
  const base = readBase();
  const child = readBase(CHILD_PATH, CHILD_HASH);
  assert.ok(child.definition, 'the child of DEV/CERT is not readable');
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
    stateColumn: comparison.stateColumn,
    candidateDefinitionSha256: comparison.candidateDefinitionSha256,
  }, null, 2));
}

module.exports = {
  BASE_PATH, BASE_HASH, CHILD_PATH, CHILD_HASH, DIRECTORY, OUTPUTS, IF_ACTION, SCOPE, LOOP,
  GUARD_SCOPE, GUARD_TRY, GUARD_CATCH, GUARD_IF, READ_STORED, KEY_CURRENT, FILTER_ERROR,
  DECIDE, DECIDE_FALLBACK, APPEND_APPLIED, APPEND_OLD, APPEND_DIAGNOSTIC, COUNT_OLD, READ_AFTER,
  LOOP_APPLIED, FILTER_ROW, WRITE_STATE, VAR_APPLY, VAR_APPLIED, VAR_OLD, VAR_DIAGNOSTIC,
  META_BASE64, READ_STATE, COMPOSE_STORED, READ_LOGS, DELETE_STATE, CREATE_STATE,
  STATE_COLUMN, EMPTY_INSTANT, INSTANT_PARTS, CHAIN,
  prepare, compare, readBase, diffPaths, definitionHash, validateDestination, writeOutputs,
  dependencyCycles, keyOf, currentInstant, storedKey, get,
};
