'use strict';
// Offline tests of the candidate of the removal of a duplicated role row. No network, no cloud and
// no write outside the ignored subtree of the phase.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const generator = require('./prepare-role-duplicate-removal.cjs');
const phase = require('./prepare-role-authoritative-deletion.cjs');

const base = generator.readBase();
const candidate = generator.prepare(base);
const acciones = generator.loopActions(candidate.definition);
const query = acciones[generator.BUSCAR];
const guard = acciones[generator.COPIA];

test('the base is the published candidate of the removal of the member of the group', () => {
  assert.equal(generator.definitionHash(base.definition), generator.BASE_DEFINITION_HASH);
});

test('the search of the copy is a query over the rows of the expediente', () => {
  assert.ok(query, 'the search of the copy is missing from the candidate');
  assert.equal(query.type, 'Query');
  assert.equal(query.inputs.from, "@body('Recoger_RolesUsuario')");
  assert.equal(query.inputs.where, generator.DETECTION);
  assert.deepEqual(query.runAfter, {});
});

test('the search of the copy looks for the same person and the same kind with a lower identifier', () => {
  const where = query.inputs.where;
  assert.match(where, /equals\(toLower\(trim\(string\(coalesce\(item\(\)\?\['usuario'\]/);
  assert.match(where, /items\('Por_cada_RolUsuario_Eliminar'\)\?\['usuario'\]/);
  assert.match(where, /equals\(item\(\)\?\['IDRol'\],items\('Por_cada_RolUsuario_Eliminar'\)\?\['IDRol'\]\)/);
  assert.match(where, /less\(item\(\)\?\['ID'\],items\('Por_cada_RolUsuario_Eliminar'\)\?\['ID'\]\)/);
  // The person is compared in lower case and without spaces, the same way the desired set is built.
  assert.equal((where.match(/toLower\(trim\(/g) || []).length, 2);
});

test('the guard of the copy is a sibling of the guard of the deletion', () => {
  assert.ok(guard, 'the guard of the copy is missing from the candidate');
  assert.equal(guard.type, 'If');
  assert.deepEqual(guard.else, { actions: {} });
  assert.deepEqual(guard.runAfter, {
    [generator.BUSCAR]: ['Succeeded'],
    [generator.GUARDIA]: ['Succeeded'],
  });
  assert.equal(acciones[generator.GUARDIA].actions[generator.COPIA], undefined,
    'the guard of the copy is not inside the guard of the deletion');
});

test('the condition of the copy measures the search and the key of the desired rows', () => {
  assert.equal(guard.expression.and.length, 2);
  assert.deepEqual(guard.expression.and[0], { greater: [`@length(body('${generator.BUSCAR}'))`, 0] });
  assert.deepEqual(guard.expression.and[1], {
    contains: ["@variables('RolesUsuarioDeseados')", generator.CLAVE],
  });
  assert.equal(JSON.stringify(guard.expression).includes('"or"'), false,
    'the condition of the copy cannot use an or');
});

test('the copy that is deleted is one of the rows that the JSON describes', () => {
  // The guard of the phase F deletes the rows that the JSON does not describe. A row that it
  // already deleted must not be deleted again: a delete of a row that is not there breaks the
  // ingestion of the expediente. The key of the desired rows is the same one the guard of the
  // phase F uses, negated.
  const faseF = acciones[generator.GUARDIA].expression.and[1].not[0].contains;
  assert.deepEqual(faseF, ["@variables('RolesUsuarioDeseados')", generator.CLAVE]);
  assert.deepEqual(guard.expression.and[1].contains, faseF,
    'the two guards read the key of the desired rows the same way');
});

test('the copy is deleted with the delete of the row of the phase F', () => {
  const eliminar = guard.actions[generator.ELIMINAR_COPIA];
  assert.ok(eliminar, 'the deletion of the copy is missing from the candidate');
  assert.equal(eliminar.type, 'OpenApiConnection');
  assert.equal(eliminar.inputs.host.operationId, 'DeleteItem');
  assert.equal(eliminar.inputs.host.connectionName, 'shared_sharepointonline');
  assert.equal(eliminar.inputs.parameters.id, "@items('Por_cada_RolUsuario_Eliminar')?['ID']");
  const borrar = acciones[generator.GUARDIA].actions.Eliminar_RolesUsuario;
  assert.equal(eliminar.inputs.parameters.dataset, borrar.inputs.parameters.dataset);
  assert.equal(eliminar.inputs.parameters.table, borrar.inputs.parameters.table);
  assert.deepEqual(eliminar.inputs.authentication, borrar.inputs.authentication);
  assert.notEqual(eliminar.metadata.operationMetadataId, borrar.metadata.operationMetadataId);
});

test('the copy does not take the person out of the group of SharePoint', () => {
  assert.deepEqual(Object.keys(guard.actions), [generator.ELIMINAR_COPIA]);
  assert.equal(JSON.stringify(guard.actions).includes('sitegroups'), false,
    'the copy must not touch the group of SharePoint');
  assert.equal(JSON.stringify(guard.actions).includes('Quitar'), false,
    'the copy must not touch the group of SharePoint');
});

test('the candidate only moves the paths of the phase', () => {
  const comparison = generator.compare(base, candidate);
  assert.equal(comparison.changedPathCount, 2);
  assert.deepEqual(comparison.changedPaths.sort(), [
    `$.${generator.LOOP_PATH}.actions.${generator.BUSCAR}`,
    `$.${generator.LOOP_PATH}.actions.${generator.COPIA}`,
  ].sort());
});

test('the comparison rejects a change outside the phase', () => {
  const broken = structuredClone(candidate);
  broken.definition.actions['Try_-_Procesar_ExpedientesJSON'].actions.Obtener_Roles.inputs.where = "@equals(item()?['Title'],'Inventado')";
  assert.throws(() => generator.compare(base, broken), /unexpected changed path/);
});

test('the candidate has no dependency cycle', () => {
  assert.deepEqual(phase.dependencyCycles(candidate.definition), []);
});

test('the candidate is deterministic', () => {
  const again = generator.prepare(generator.readBase());
  assert.equal(generator.definitionHash(again.definition), generator.definitionHash(candidate.definition));
});

test('a base that is not the reviewed one is rejected', () => {
  const tampered = JSON.parse(JSON.stringify(base.definition));
  tampered.actions['INI_RolesUsuarioDeseados'] = { type: 'InitializeVariable', inputs: { variables: [] } };
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'duplicate-')), 'candidate-definition.json');
  fs.writeFileSync(file, JSON.stringify(tampered));
  assert.throws(() => generator.readBase(file), /the source definition is not the published one/);
});

test('the outputs stay inside the ignored subtree', () => {
  assert.ok(generator.DIRECTORY.includes(`${path.sep}.atl${path.sep}`));
  for (const name of generator.OUTPUTS) generator.validateDestination(path.join(generator.DIRECTORY, name), false);
  assert.throws(() => generator.validateDestination(path.join(os.tmpdir(), 'candidate-definition.json'), false),
    /destination must stay inside/);
});

// A small evaluator of the template language, only of the functions the generator writes. It is
// here to prove what the expression of the search does with the rows of a real expediente: the
// copy is the row with the greater identifier and the person is compared in lower case and
// without spaces.
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
  const truthy = value => !(value === null || value === undefined || value === false || value === '' || value === 0);
  const call = (name, args) => {
    switch (name) {
      case 'and': return args.every(truthy);
      case 'not': return !truthy(args[0]);
      case 'equals': return args[0] === args[1];
      case 'less': return Number(args[0]) < Number(args[1]);
      case 'greater': return Number(args[0]) > Number(args[1]);
      case 'toLower': return String(args[0]).toLowerCase();
      case 'trim': return String(args[0]).trim();
      case 'string': return String(args[0]);
      case 'coalesce': return args[0] === null || args[0] === undefined ? args[1] : args[0];
      case 'item': return context.item;
      case 'items': return context.items[args[0]];
      case 'length': return String(args[0]).length;
      case 'first': return args[0][0];
      default: throw new Error(`the evaluator does not know the function ${name}`);
    }
  };
  return parseValue();
}

// The rows of an expediente with a duplicated role: one row of the project manager, the pair of
// the same person with the same kind of role and a row of another person. The copy of the pair is
// written with the spaces and in upper case, because the person is compared the way the desired
// set is built.
const rows = [
  { ID: 7, IDRol: 1, usuario: 'jefe@ejemplo.es' },
  { ID: 10, IDRol: 2, usuario: 'dup@ejemplo.es' },
  { ID: 11, IDRol: 2, usuario: ' DUP@ejemplo.es ' },
  { ID: 12, IDRol: 3, usuario: 'otro@ejemplo.es' },
];

const isCopy = (current) => rows.some(candidate => evaluate(query.inputs.where.replace(/^@/, ''), {
  item: candidate,
  items: { Por_cada_RolUsuario_Eliminar: current },
}));

test('the expression of the search marks only the copy of the pair', () => {
  const copies = rows.filter(isCopy).map(row => row.ID);
  assert.deepEqual(copies, [11], 'the row with the greater identifier is the copy');
});

test('the row with the lower identifier of the pair is kept', () => {
  const original = rows.find(row => row.ID === 10);
  assert.equal(isCopy(original), false);
});

test('a row of another person and a row of another kind are never a copy', () => {
  assert.equal(isCopy(rows.find(row => row.ID === 7)), false);
  assert.equal(isCopy(rows.find(row => row.ID === 12)), false);
});
