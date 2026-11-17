'use strict';
// Offline tests of the candidate of the new scope of the role deletion. No network, no cloud and
// no write outside the ignored subtree of the phase.
const test = require('node:test');
const assert = require('node:assert/strict');
const generator = require('./prepare-role-authoritative-deletion.cjs');

const base = generator.readBase();
const candidate = generator.prepare(base);
const get = (root, key) => key.split('.').reduce((node, part) => node?.[part], root);

const borrar = get(candidate.definition, generator.PATHS.borrar);
const guardia = borrar.actions.Es_Rol_No_Deseado;
const calidad = get(candidate.definition, generator.PATHS.calidad);
const grupos = guardia.actions.Quitar_el_miembro_del_grupo;

test('the base is the definition published in DEV/CERT', () => {
  assert.equal(generator.definitionHash(base.definition), generator.BASE_DEFINITION_HASH);
});

test('the Direccion kind is read from the catalog by title and its row is never deleted', () => {
  const lookup = candidate.definition.actions['Try_-_Procesar_ExpedientesJSON'].actions.Rol_Direccion;
  assert.equal(lookup.type, 'Query');
  assert.equal(lookup.inputs.from, "@body('Obtener_Roles')");
  assert.equal(lookup.inputs.where, "@equals(item()?['Title'], 'Dirección')");
  const exclusion = guardia.expression.and[2];
  assert.ok(exclusion, 'the deletion guard has no condition for the Direccion kind');
  assert.deepEqual(exclusion.not[0].equals, [
    "@items('Por_cada_RolUsuario_Eliminar')?['IDRol']",
    "@body('Rol_Direccion')?[0]?['IDRol']",
  ]);
});

test('the kind of the project managers is read from the catalog by title', () => {
  const lookup = candidate.definition.actions['Try_-_Procesar_ExpedientesJSON'].actions.Rol_Jefe_de_Proyecto;
  assert.equal(lookup.inputs.where, "@equals(item()?['Title'], 'Jefe de proyecto')");
  assert.deepEqual(lookup.runAfter, { Obtener_Roles: ['Succeeded'] });
});

test('the quality row is only created when the JSON describes a quality person', () => {
  assert.ok(!calidad.else.actions.Crear_Tecnico_de_Calidad, 'the unguarded creation of the quality row is still reachable');
  const guard = calidad.else.actions.Si_el_JSON_trae_calidad;
  assert.equal(guard.type, 'If');
  assert.deepEqual(guard.expression.not[0].equals, [
    "@string(coalesce(body('ExpedienteJSON')?['responsableCalidad']?['correousuario'], ''))",
    '',
  ]);
  assert.ok(guard.actions.Crear_Tecnico_de_Calidad, 'the creation of the quality row is lost');
  assert.ok(guard.actions.Crear_Tecnico_de_Calidad_en_Grupo_Sharepoint, 'the addition to the group of the quality is lost');
});

test('the removal from the group is published and only for the kinds that have a group', () => {
  assert.equal(Boolean(grupos), generator.GROUP_REMOVAL_ENABLED);
  if (!grupos) return;
  const jedefes = grupos.actions.Quitar_del_grupo_de_jefes.actions.Quitar_al_jefe_del_grupo;
  const calidadGrupo = grupos.actions.Quitar_del_grupo_de_calidad.actions.Quitar_a_la_calidad_del_grupo;
  assert.ok(jedefes.inputs.parameters['parameters/uri'].endsWith('/removeUser'));
  assert.ok(calidadGrupo.inputs.parameters['parameters/uri'].endsWith('/removeUser'));
  assert.equal(jedefes.runAfter && Object.keys(jedefes.runAfter).length, 0,
    'the removal cannot depend on an action of the scope it was copied from');
  const kinds = grupos.expression.and[1].or.map(branch => branch.equals[1]);
  assert.deepEqual(kinds, [
    "@body('Rol_Jefe_de_Proyecto')?[0]?['IDRol']",
    "@body('Rol_Tecnico_de_Calidad')?[0]?['IDRol']",
  ]);
  assert.deepEqual(grupos.expression.and[0], { equals: ["@length(body('Buscar_Otros_Expedientes_Con_El_Mismo_Rol'))", 0] });
});

test('a row that holds the person and the name of the JSON is not written again', () => {
  for (const update of generator.UPDATES) {
    const branch = get(candidate.definition, update.path);
    assert.equal(branch.type, 'If', `the update of ${update.kind} is not an If`);
    const comparison = branch.expression.and[1].not[0].equals;
    assert.equal(comparison[0], `@string(coalesce(first(body('${update.buscar}'))?['Title'], ''))`);
    assert.equal(comparison[1], `@string(coalesce(${update.name}, ''))`);
  }
});

test('the deletion fails closed with no valid responsible in the JSON', () => {
  assert.deepEqual(guardia.expression.and[0], { greaterOrEquals: ["@length(body('Filtrar_Responsables_Validos'))", 1] });
});

test('the candidate has no dependency cycle', () => {
  assert.deepEqual(generator.dependencyCycles(candidate.definition), []);
});

test('the candidate is deterministic', () => {
  const again = generator.prepare(generator.readBase());
  assert.equal(generator.definitionHash(again.definition), generator.definitionHash(candidate.definition));
});

test('the comparison only allows the intended paths', () => {
  const comparison = generator.compare(base, candidate);
  assert.equal(comparison.direccionIsOutOfScope, true);
  assert.equal(comparison.qualityRowsAreDeletable, true);
  assert.equal(comparison.deletesFailClosed, true);
  assert.equal(comparison.removesTheMemberOfTheGroup, true);
  assert.equal(comparison.groupRemovalIsPublished, true);
  const broken = structuredClone(candidate);
  broken.definition.actions['Try_-_Procesar_ExpedientesJSON'].actions.Obtener_Roles.inputs.where = "@equals(item()?['Title'], 'Inventado')";
  assert.throws(() => generator.compare(base, broken), /unexpected changed path/);
});
