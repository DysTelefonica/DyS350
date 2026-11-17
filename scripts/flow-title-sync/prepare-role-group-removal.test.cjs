'use strict';
// Offline tests of the candidate that rewrites the removal of the member of the group. No network,
// no cloud and no write outside the ignored subtree of the phase.
const test = require('node:test');
const assert = require('node:assert/strict');
const generator = require('./prepare-role-group-removal.cjs');
const phase = require('./prepare-role-authoritative-deletion.cjs');

const base = generator.readBase();
const candidate = generator.prepare(base);
const acciones = generator.guardActions(candidate.definition);

test('the base is the definition published in DEV/CERT', () => {
  assert.equal(generator.definitionHash(base.definition), generator.BASE_DEFINITION_HASH);
});

test('the condition that failed is not there any more', () => {
  assert.ok(!acciones['Quitar_el_miembro_del_grupo'], 'the condition that failed is still in the candidate');
});

test('the removal is one If per kind, in the scope of the guard', () => {
  for (const grupo of generator.GRUPOS) {
    const ifAction = acciones[grupo.if];
    assert.ok(ifAction, `the removal of ${grupo.if} is missing from the candidate`);
    assert.equal(ifAction.type, 'If');
    assert.deepEqual(ifAction.runAfter, {
      Buscar_Otros_Expedientes_Con_El_Mismo_Rol: ['Succeeded'],
      Eliminar_RolesUsuario: ['Succeeded'],
    });
    assert.deepEqual(ifAction.else, { actions: {} });
  }
});

test('the condition of the removal uses the vocabulary of the flow and no or', () => {
  for (const grupo of generator.GRUPOS) {
    const expression = acciones[grupo.if].expression;
    assert.equal(expression.and.length, 2);
    assert.deepEqual(expression.and[0], { equals: ["@length(body('Buscar_Otros_Expedientes_Con_El_Mismo_Rol'))", 0] });
    assert.deepEqual(expression.and[1], {
      equals: ["@items('Por_cada_RolUsuario_Eliminar')?['IDRol']", `@body('${grupo.catalogo}')?[0]?['IDRol']`],
    });
    assert.equal(JSON.stringify(expression).includes('"or"'), false, 'the condition cannot use an or');
  }
});

test('the request of the removal is the addition of the member with the endpoint of the group', () => {
  for (const grupo of generator.GRUPOS) {
    const request = acciones[grupo.if].actions[grupo.accion];
    assert.equal(request.type, 'OpenApiConnection');
    assert.equal(request.inputs.host.operationId, 'HttpRequest');
    assert.ok(request.inputs.parameters['parameters/uri'].endsWith('/removeUser'),
      'the removal does not use the endpoint of the group');
    assert.ok(request.inputs.parameters['parameters/uri'].includes(grupo.grupo),
      'the removal does not use the identifier of its group');
    assert.equal(request.inputs.parameters['parameters/body'],
      '{"userLoginName": "i:0#.f|membership|@items(\'Por_cada_RolUsuario_Eliminar\')?[\'usuario\']"}');
    assert.equal(request.runAfter && Object.keys(request.runAfter).length, 0,
      'the removal cannot depend on an action of the scope it was copied from');
  }
});

test('the cross check of the other expedientes is the query of the phase F', () => {
  const query = acciones['Buscar_Otros_Expedientes_Con_El_Mismo_Rol'];
  assert.equal(query.type, 'Query');
  assert.equal(query.inputs.from, "@body('RolesUsuario')");
  assert.match(query.inputs.where, /items\('Por_cada_RolUsuario_Eliminar'\)\?\['usuario'\]/);
});

test('the candidate only moves the paths of the phase', () => {
  const comparison = generator.compare(base, candidate);
  assert.equal(comparison.changedPathCount, 3);
  for (const path of comparison.changedPaths) {
    assert.ok(path.includes('Es_Rol_No_Deseado.actions'), `unexpected path: ${path}`);
  }
});

test('the comparison rejects a change outside the phase', () => {
  const broken = structuredClone(candidate);
  broken.definition.actions['Try_-_Procesar_ExpedientesJSON'].actions.Obtener_Roles.inputs.where = "@equals(item()?['Title'], 'Inventado')";
  assert.throws(() => generator.compare(base, broken), /unexpected changed path/);
});

test('the candidate has no dependency cycle', () => {
  assert.deepEqual(phase.dependencyCycles(candidate.definition), []);
});

test('the candidate is deterministic', () => {
  const again = generator.prepare(generator.readBase());
  assert.equal(generator.definitionHash(again.definition), generator.definitionHash(candidate.definition));
});
