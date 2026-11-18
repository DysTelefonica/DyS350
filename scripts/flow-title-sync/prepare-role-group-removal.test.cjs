'use strict';
// Offline tests of the candidate of the removal of the member of the group of a deleted role. No
// network, no cloud and no write outside the ignored subtree of the phase.
const test = require('node:test');
const assert = require('node:assert/strict');
const generator = require('./prepare-role-group-removal.cjs');
const phase = require('./prepare-role-authoritative-deletion.cjs');

const base = generator.readBase();
const candidate = generator.prepare(base);
const acciones = generator.guardActions(candidate.definition);

test('the base is the released candidate of the phase F, without the removal', () => {
  assert.equal(generator.definitionHash(base.definition), generator.BASE_DEFINITION_HASH);
});

test('the cross check of the other expedientes is the query of the phase F', () => {
  const query = acciones['Buscar_Otros_Expedientes_Con_El_Mismo_Rol'];
  assert.equal(query.type, 'Query');
  assert.equal(query.inputs.from, "@body('RolesUsuario')");
  assert.match(query.inputs.where, /items\('Por_cada_RolUsuario_Eliminar'\)\?\['usuario'\]/);
  assert.match(query.inputs.where, /not\(equals\(item\(\)\?\['IDExpediente'\]/);
});

test('the removal is one If per kind, in the scope of the guard of the deletion', () => {
  for (const grupo of generator.GRUPOS) {
    const ifAction = acciones[`Quitar_el_miembro_del_grupo_${grupo.clave}`];
    assert.ok(ifAction, `the removal of ${grupo.clave} is missing from the candidate`);
    assert.equal(ifAction.type, 'If');
    assert.deepEqual(ifAction.else, { actions: {} });
    assert.deepEqual(ifAction.runAfter, {
      [`Obtener_el_miembro_del_grupo_${grupo.clave}`]: ['Succeeded'],
      Buscar_Otros_Expedientes_Con_El_Mismo_Rol: ['Succeeded'],
      Eliminar_RolesUsuario: ['Succeeded'],
    });
  }
});

test('the condition of the removal uses the vocabulary of the flow and no or', () => {
  for (const grupo of generator.GRUPOS) {
    const expression = acciones[`Quitar_el_miembro_del_grupo_${grupo.clave}`].expression;
    assert.equal(expression.and.length, 3);
    assert.deepEqual(expression.and[0], { equals: ["@length(body('Buscar_Otros_Expedientes_Con_El_Mismo_Rol'))", 0] });
    assert.deepEqual(expression.and[1], {
      equals: ["@items('Por_cada_RolUsuario_Eliminar')?['IDRol']", `@body('${grupo.catalogo}')?[0]?['IDRol']`],
    });
    assert.match(expression.and[2].greater[0], /length\(coalesce\(/);
    assert.equal(JSON.stringify(expression).includes('"or"'), false, 'the condition cannot use an or');
  }
});

test('the member of the group is asked for with the filter by the email', () => {
  for (const grupo of generator.GRUPOS) {
    const buscar = acciones[`Obtener_el_miembro_del_grupo_${grupo.clave}`];
    assert.equal(buscar.type, 'OpenApiConnection');
    assert.equal(buscar.inputs.parameters['parameters/method'], 'GET');
    assert.equal(buscar.inputs.parameters['parameters/body'], undefined, 'the query cannot carry a body');
    const uri = buscar.inputs.parameters['parameters/uri'];
    assert.match(uri, /sitegroups\/getbyid/);
    assert.match(uri, /\/users\?\$filter=Email%20eq%20%27/);
    // the expression of the login has to be wrapped in braces: outside them it is sent as it is
    assert.match(uri, /%27@\{items\('Por_cada_RolUsuario_Eliminar'\)\?\['usuario'\]\}%27/);
    assert.equal(uri.includes('#'), false, 'the claim of the member would cut the query of the URI');
  }
});

test('the removal is a DELETE by the identifier of the member', () => {
  for (const grupo of generator.GRUPOS) {
    const peticion = acciones[`Quitar_el_miembro_del_grupo_${grupo.clave}`].actions[`Quitar_${grupo.clave}_del_grupo`];
    assert.equal(peticion.type, 'OpenApiConnection');
    assert.equal(peticion.inputs.parameters['parameters/method'], 'DELETE');
    assert.equal(peticion.inputs.parameters['parameters/body'], undefined, 'the removal cannot carry a body');
    assert.match(peticion.inputs.parameters['parameters/uri'], /sitegroups\/getbyid.*\/users\/getById/);
    assert.match(peticion.inputs.parameters['parameters/uri'], /\?\['Id'\]/);
  }
});

test('the candidate only moves the paths of the phase', () => {
  const comparison = generator.compare(base, candidate);
  assert.equal(comparison.changedPathCount, 5);
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
