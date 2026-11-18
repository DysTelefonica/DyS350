'use strict';
// Offline candidate preparation only: no authentication, cloud client, save or deployment.
// Builds the base of the removal of the member of the group: the candidate of the phase F with the
// removal taken out (`2D1C1668...`), which is the logic that is measured and released.
//
// The base has to be a snapshot and not the file of the live definition: that file is overwritten
// by every read of the environment, and the generator has to read the same definition every time.
// The snapshot is built from the candidate of the phase F and the hash proves that it is the
// released one.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const phase = require('./prepare-role-authoritative-deletion.cjs');

const DIRECTORY = path.resolve(__dirname, '../../.atl/project-title-sync/role-group-removal-20261117');
const OUTPUT = path.join(DIRECTORY, 'base-definition.json');
const EXPECTED = '2D1C16687BB67BE45EE9A33AA6877B8DC25297C4E2515DC3F3290A372368C9D9';
const sort = (v) => Array.isArray(v) ? v.map(sort) : (v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])])) : v);
const hash = (text) => createHash('sha256').update(text).digest('hex').toUpperCase();

// The scope of the deletion loop, where the guard of the phase F lives.
const GUARDIA_PATH = 'actions.Try_-_Procesar_ExpedientesJSON.actions.Existe_ExpedienteJSON'
  + '.actions.Comprobar_que_hay_RolesUsuario.actions.Por_cada_RolUsuario_Eliminar'
  + '.actions.Es_Rol_No_Deseado.actions';
const get = (root, key) => key.split('.').reduce((node, part) => node?.[part], root);

const source = phase.readBase();
const candidate = phase.prepare(source);
phase.compare(source, candidate);
const acciones = get(candidate.definition, GUARDIA_PATH);
assert.ok(acciones, 'the deletion guard is not where the baseline expects it');
assert.ok(acciones['Quitar_el_miembro_del_grupo'], 'the candidate does not have the removal of the member of the group');
assert.ok(acciones['Buscar_Otros_Expedientes_Con_El_Mismo_Rol'], 'the candidate does not have the cross check of the other expedientes');
delete acciones['Quitar_el_miembro_del_grupo'];
delete acciones['Buscar_Otros_Expedientes_Con_El_Mismo_Rol'];
const result = hash(JSON.stringify(sort(candidate.definition)));
assert.equal(result, EXPECTED, `the base without the removal is not the released one: ${result}`);
fs.mkdirSync(DIRECTORY, { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(candidate.definition, null, 2) + '\n');
console.log(JSON.stringify({ base: OUTPUT, baseDefinitionSha256: result }));
