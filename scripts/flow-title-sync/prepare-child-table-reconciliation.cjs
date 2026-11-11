'use strict';
// Offline candidate preparation only: no authentication, cloud client, upload or deployment.
// Builds the reconciliation of the two child tables of the DEV child flow on top of the applied
// phase 2b candidate: the supplier rows and the milestone rows of an expediente keep their
// identifiers when the JSON still describes them, are rewritten with the values the JSON carries,
// and the rows the JSON no longer describes are deleted. An empty collection never deletes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { dependencyCycles } = require('./prepare-role-scoped-delete.cjs');

const BASE_PATH = path.resolve(__dirname, '../../.atl/project-title-sync/role-scoped-delete-20261110/candidate-definition.json');
const BASE_DEFINITION_HASH = '9FD608336A7B0C78F61D9D8AA6AACD2D7F3306560A11A0268458D201F7565328';
const DIRECTORY = path.resolve(__dirname, '../../.atl/project-title-sync/child-table-reconciliation-20261111');
const OUTPUTS = ['candidate-definition.json', 'candidate-comparison.json'];

const TRY = 'Try_-_Procesar_ExpedientesJSON';
const EXISTE = 'Existe_ExpedienteJSON';
const DATASET = "@parameters('E2E_ConexionEntorno (cr435_E2E_ConexionEntorno)')";
const AUTH = { type: 'Raw', value: "@json(decodeBase64(triggerOutputs().headers['X-MS-APIM-Tokens']))['$ConnectionKey']" };

const num = value => `coalesce(${value},0)`;
const text = value => `toLower(trim(string(coalesce(${value},''))))`;

// The business key of a row and the key of the JSON entry that describes it. The supplier key is
// the four fields the flow writes; the milestone key is the description and the amount, because
// the JSON carries no milestone identifier and the same description can repeat in one project.
const TABLES = [
  {
    name: 'Suministradores',
    jsonArray: 'suministradores',
    snapshot: 'Recoger_Suministradores_Expediente',
    listParameter: 'E2E_ListaSuministradores (cr435_E2E_ListaSuministradores)',
    check: 'Comprobar_que_hay_Suministradores',
    deleteLoop: 'Por_cada_Suministrador_Eliminar',
    createLoop: 'Por_cada_suministrador',
    remove: 'Eliminar_Suministrador',
    create: 'Crear_Suministrador',
    jsonKeyInDeleteLoop: `concat(${num("item()?['idsuministrador']")},'-',${num("item()?['idpadre']")},'-',${num("item()?['idexpedientesuministrador']")})`,
    rowKeyInDeleteLoop: `concat(${num("items('Por_cada_Suministrador_Eliminar')?['IDSuministrador']")},'-',${num("items('Por_cada_Suministrador_Eliminar')?['IDPadre']")},'-',${num("items('Por_cada_Suministrador_Eliminar')?['IDExpedienteSuministrador']")})`,
    rowKeyInCreateLoop: `concat(${num("item()?['IDSuministrador']")},'-',${num("item()?['IDPadre']")},'-',${num("item()?['IDExpedienteSuministrador']")})`,
    jsonKeyInCreateLoop: `concat(${num("items('Por_cada_suministrador')?['idsuministrador']")},'-',${num("items('Por_cada_suministrador')?['idpadre']")},'-',${num("items('Por_cada_suministrador')?['idexpedientesuministrador']")})`,
    patchFields: {
      'item/Title': "@items('Por_cada_suministrador')?['nombre']",
      'item/IDSuministrador': "@items('Por_cada_suministrador')?['idsuministrador']",
      'item/IDProyecto': "@body('ExpedienteJSON')?['idexpediente']",
      'item/IDPadre': "@items('Por_cada_suministrador')?['idpadre']",
      'item/IDExpedienteSuministrador': "@items('Por_cada_suministrador')?['idexpedientesuministrador']",
    },
  },
  {
    name: 'Hitos',
    jsonArray: 'hitos',
    snapshot: 'Recoger_Hitos_del_Expediente',
    listParameter: 'E2E_ListaHitos (cr435_E2E_ListaHitos)',
    check: 'Comprobar_que_hay_Hitos',
    deleteLoop: 'Por_cada_Hito_Eliminar',
    createLoop: 'Por_cada_Hito',
    remove: 'Eliminar_Hito',
    create: 'Crear_Hitos',
    jsonKeyInDeleteLoop: `concat(${text("item()?['descripcion']")},'|',${num("item()?['importe']")})`,
    rowKeyInDeleteLoop: `concat(${text("items('Por_cada_Hito_Eliminar')?['Title']")},'|',${num("items('Por_cada_Hito_Eliminar')?['Importe']")})`,
    rowKeyInCreateLoop: `concat(${text("item()?['Title']")},'|',${num("item()?['Importe']")})`,
    jsonKeyInCreateLoop: `concat(${text("items('Por_cada_Hito')?['descripcion']")},'|',${num("items('Por_cada_Hito')?['importe']")})`,
    patchFields: {
      'item/Title': "@items('Por_cada_Hito')?['descripcion']",
      'item/IDProyecto': "@body('ExpedienteJSON')?['idexpediente']",
      'item/Importe': "@items('Por_cada_Hito')?['importe']",
      'item/FechaHito': "@items('Por_cada_Hito')?['fechahito']",
      'item/FechaGarantiaHito': "@items('Por_cada_Hito')?['fechagarantiahito']",
    },
  },
];

const sort = value => Array.isArray(value)
  ? value.map(sort)
  : (value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])]))
    : value);
const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const definitionHash = definition => hash(JSON.stringify(sort(definition)));

const get = (root, key) => key.split('.').reduce((node, part) => node?.[part], root);
const scope = table => `actions.${TRY}.actions.${EXISTE}.actions`;

function readBase(basePath = BASE_PATH) {
  const bytes = fs.readFileSync(basePath);
  const definition = JSON.parse(bytes.toString('utf8'));
  assert.equal(definitionHash(definition), BASE_DEFINITION_HASH, 'the base is not the reviewed phase 2b candidate');
  return { definition };
}

function searchAction(name, from, where) {
  return { type: 'Query', inputs: { from, where }, runAfter: {} };
}

function patchAction(table, search) {
  return {
    type: 'OpenApiConnection',
    inputs: {
      host: {
        connectionName: 'shared_sharepointonline',
        operationId: 'PatchItem',
        apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline',
      },
      parameters: {
        dataset: DATASET,
        table: `@parameters('${table.listParameter}')`,
        id: `@first(body('${search}'))?['ID']`,
        ...table.patchFields,
      },
      authentication: AUTH,
    },
    runAfter: {},
  };
}

function prepare(base) {
  const result = JSON.parse(JSON.stringify(base));
  for (const table of TABLES) {
    const root = get(result.definition, scope(table));
    const check = root[table.check];
    const deleteLoop = check.actions[table.deleteLoop];
    const createLoop = root[table.createLoop];

    // 1. The deletion only touches the rows the JSON no longer describes, and never with an empty
    //    collection: the flow fails closed instead of emptying the table of an expediente.
    const remove = deleteLoop.actions[table.remove];
    delete deleteLoop.actions[table.remove];
    const searchNotDesired = `Buscar_${table.name}_No_Deseado`;
    const guardNotDesired = `Es_${table.name}_No_Deseado`;
    deleteLoop.actions[searchNotDesired] = searchAction(
      searchNotDesired,
      `@body('ExpedienteJSON')?['${table.jsonArray}']`,
      `@equals(${table.jsonKeyInDeleteLoop},${table.rowKeyInDeleteLoop})`,
    );
    deleteLoop.actions[guardNotDesired] = {
      type: 'If',
      expression: {
        and: [
          { greaterOrEquals: [`@length(coalesce(body('ExpedienteJSON')?['${table.jsonArray}'],createArray()))`, 1] },
          { equals: [`@length(body('${searchNotDesired}'))`, 0] },
        ],
      },
      actions: { [table.remove]: remove },
      else: { actions: {} },
      runAfter: { [searchNotDesired]: ['Succeeded'] },
    };

    // 2. A row the JSON still describes is rewritten instead of being recreated, so its
    //    identifier survives the ingestion and everything that points at it keeps pointing at it.
    const create = createLoop.actions[table.create];
    delete createLoop.actions[table.create];
    const searchExisting = `Buscar_${table.name}_Existente`;
    const guardExisting = `Es_${table.name}_Existente`;
    createLoop.actions[searchExisting] = searchAction(
      searchExisting,
      `@body('${table.snapshot}')`,
      `@equals(${table.rowKeyInCreateLoop},${table.jsonKeyInCreateLoop})`,
    );
    createLoop.actions[guardExisting] = {
      type: 'If',
      expression: { greaterOrEquals: [`@length(body('${searchExisting}'))`, 1] },
      actions: { [`Actualizar_${table.name}_Existente`]: patchAction(table, searchExisting) },
      else: { actions: { [table.create]: create } },
      runAfter: { [searchExisting]: ['Succeeded'] },
    };
  }
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
    const ka = Object.keys(a); const kb = Object.keys(b);
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
  const allowed = [];
  for (const table of TABLES) {
    const root = scope(table);
    allowed.push(`$.${root}.${table.check}.actions.${table.deleteLoop}.actions.Buscar_${table.name}_No_Deseado`);
    allowed.push(`$.${root}.${table.check}.actions.${table.deleteLoop}.actions.Es_${table.name}_No_Deseado`);
    allowed.push(`$.${root}.${table.check}.actions.${table.deleteLoop}.actions.${table.remove}`);
    allowed.push(`$.${root}.${table.createLoop}.actions.Buscar_${table.name}_Existente`);
    allowed.push(`$.${root}.${table.createLoop}.actions.Es_${table.name}_Existente`);
    allowed.push(`$.${root}.${table.createLoop}.actions.Actualizar_${table.name}_Existente`);
    allowed.push(`$.${root}.${table.createLoop}.actions.${table.create}`);
  }
  for (const changedPath of changed) {
    assert.ok(allowed.includes(changedPath), `unexpected changed path: ${changedPath}`);
  }
  const cycles = dependencyCycles(candidate.definition);
  assert.deepEqual(cycles, [], `the candidate must not close a dependency cycle: ${cycles.join(' | ')}`);
  for (const table of TABLES) {
    const root = get(candidate.definition, scope(table));
    const guard = get(candidate.definition, `${scope(table)}.${table.check}.actions.${table.deleteLoop}.actions.Es_${table.name}_No_Deseado`);
    assert.equal(guard.actions[table.remove].inputs.host.operationId, 'DeleteItem');
    assert.equal(guard.expression.and[0].greaterOrEquals[1], 1, 'the deletion must fail closed on an empty collection');
    const create = get(candidate.definition, `${scope(table)}.${table.createLoop}.actions.Es_${table.name}_Existente`);
    assert.equal(create.actions[`Actualizar_${table.name}_Existente`].inputs.host.operationId, 'PatchItem');
    assert.equal(create.else.actions[table.create].inputs.host.operationId, 'PostItem');
    assert.ok(root[table.createLoop].actions[`Buscar_${table.name}_Existente`], 'the existing row search is missing');
  }
  return {
    changedPaths: changed,
    changedPathCount: changed.length,
    sourceDefinitionSha256: definitionHash(base.definition),
    candidateDefinitionSha256: definitionHash(candidate.definition),
    identifiersArePreserved: true,
    deletionFailsClosed: true,
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
  console.log(JSON.stringify({ localOnly: true, outputs: OUTPUTS, changedPathCount: comparison.changedPathCount, candidateDefinitionSha256: comparison.candidateDefinitionSha256 }, null, 2));
}

module.exports = { TABLES, BASE_PATH, BASE_DEFINITION_HASH, DIRECTORY, OUTPUTS, prepare, compare, readBase, diffPaths, definitionHash, validateDestination, writeOutputs, dependencyCycles };
