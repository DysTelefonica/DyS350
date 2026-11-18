'use strict';
// Offline candidate preparation only: no authentication, cloud client, save or deployment.
// The removal of a duplicated row of roles: a row that is a copy of another row of the same
// expediente, with the same person and the same kind of role, is deleted.
//
// Why the flow cannot do it alone: the set of the desired rows is keyed by `usuario + '-' + IDRol`,
// so a copy answers to the same key as the row it copies and the flow never sees it as a row that
// the JSON does not describe. The guard of the phase F deletes the rows that the JSON does not
// describe, and a copy is not one of them: the JSON describes the pair with a single key.
//
// The copy is the row with the greater identifier: the row with the lower identifier is the
// original and it is kept.
//
// The person does not leave the group of SharePoint: a copy is not a change of person, and the
// person keeps the group through the row that is kept.
//
// Only a copy that the JSON describes is deleted here: a row that the JSON does not describe is
// already deleted by the guard of the phase F (`Es_Rol_No_Deseado`), and deleting the same row
// twice breaks the ingestion of the expediente.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const phase = require('./prepare-role-authoritative-deletion.cjs');

const BASE_PATH = path.resolve(__dirname, '../../.atl/project-title-sync/role-group-removal-20261117/candidate-definition.json');
const BASE_DEFINITION_HASH = 'E4E823CEFCFFCE844FA6590CF556AAAE4B48A3052FC02F8C4AEA01F6D4C40B6F';
const ENVIRONMENT = 'aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b';
const FLOW = '1ca49582-ae1e-f111-8342-6045bde02c54';
const DIRECTORY = path.resolve(__dirname, '../../.atl/project-title-sync/role-duplicate-removal-20261118');
const OUTPUTS = ['candidate-definition.json', 'candidate-comparison.json'];

const TRY = 'Try_-_Procesar_ExpedientesJSON';
const EXISTE = 'Existe_ExpedienteJSON';
const COMPROBAR = 'Comprobar_que_hay_RolesUsuario';
const ELIMINAR = 'Por_cada_RolUsuario_Eliminar';
const GUARDIA = 'Es_Rol_No_Deseado';
const BUSCAR = 'Buscar_Copia_De_Una_Fila_Igual';
const COPIA = 'Es_Copia_De_Una_Fila_Igual';
const ELIMINAR_COPIA = 'Eliminar_Copia_RolesUsuario';
const LOOP_PATH = `actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}.actions.${ELIMINAR}`;
const GUARDIA_PATH = `${LOOP_PATH}.actions.${GUARDIA}`;

// The search of the copy: the rows of this expediente with the same person and the same kind of
// role whose identifier is lower than the identifier of the row of the iteration. The person is
// compared in lower case and without spaces, the same way the set of the desired rows is built.
const DETECTION = "@and(equals(toLower(trim(string(coalesce(item()?['usuario'], '')))),toLower(trim(string(coalesce(items('Por_cada_RolUsuario_Eliminar')?['usuario'], ''))))),equals(item()?['IDRol'],items('Por_cada_RolUsuario_Eliminar')?['IDRol']),less(item()?['ID'],items('Por_cada_RolUsuario_Eliminar')?['ID']))";

// The key of the desired rows, the same expression the guard of the phase F uses.
const CLAVE = "@concat(toLower(trim(items('Por_cada_RolUsuario_Eliminar')?['usuario'])),'-',items('Por_cada_RolUsuario_Eliminar')?['IDRol'])";

// The identifier of the operation of the new delete. The one of the delete of the phase F is
// already used by the action it belongs to.
const OPERATION_ID = 'f3a9c27d-5e14-4b8a-9c03-6d71e8b42f15';

const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const sort = value => Array.isArray(value) ? value.map(sort)
  : (value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])]))
    : value);
const definitionHash = definition => hash(JSON.stringify(sort(definition)));

function diffPaths(left, right, prefix = '$', out = []) {
  if (JSON.stringify(left) === JSON.stringify(right)) return out;
  if (Array.isArray(left) && Array.isArray(right)) {
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      if (index >= left.length || index >= right.length) { out.push(`${prefix}[${index}]`); continue; }
      diffPaths(left[index], right[index], `${prefix}[${index}]`, out);
    }
    return out;
  }
  const leftIsObject = left && typeof left === 'object' && !Array.isArray(left);
  const rightIsObject = right && typeof right === 'object' && !Array.isArray(right);
  if (!leftIsObject || !rightIsObject) { out.push(prefix); return out; }
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of [...keys].sort()) diffPaths(left[key], right[key], `${prefix}.${key}`, out);
  return out;
}

const get = (root, key) => key.split('.').reduce((node, part) => node?.[part], root);

function readBase(basePath = BASE_PATH) {
  const bytes = fs.readFileSync(basePath);
  const definition = JSON.parse(bytes.toString('utf8'));
  assert.equal(definitionHash(definition), BASE_DEFINITION_HASH,
    'the source definition is not the published one of the removal of the member of the group');
  return { environment: ENVIRONMENT, flow: FLOW, definition };
}

const loopActions = definition => get(definition, LOOP_PATH).actions;

function prepare(snapshot) {
  const result = structuredClone(snapshot);
  const loop = get(result.definition, LOOP_PATH);
  assert.ok(loop, 'the deletion loop is not where the baseline expects it');
  assert.equal(loop.type, 'Foreach');
  assert.equal(loop.foreach, "@body('Recoger_RolesUsuario')",
    'the loop does not iterate over the rows of the expediente');
  const guard = loop.actions[GUARDIA];
  assert.ok(guard, 'the guard of the deletion is missing from the source');
  assert.equal(guard.type, 'If');
  const borrar = guard.actions.Eliminar_RolesUsuario;
  assert.ok(borrar, 'the deletion of the row is not where the baseline expects it');
  assert.equal(borrar.inputs.host.operationId, 'DeleteItem');
  assert.ok(!loop.actions[COPIA], 'the guard of the copy is already in the source');
  assert.ok(!loop.actions[BUSCAR], 'the search of the copy is already in the source');

  // The search of the copy: a sibling of the guard of the deletion, inside the loop, so it sees
  // the row of the iteration and the rows of the expediente.
  loop.actions[BUSCAR] = {
    type: 'Query',
    inputs: {
      from: "@body('Recoger_RolesUsuario')",
      where: DETECTION,
    },
    runAfter: {},
  };

  // The guard of the copy: the row is a copy when a row with a lower identifier answers to the
  // same person and the same kind of role. The row has to be one of the rows that the JSON
  // describes: a row that the JSON does not describe is already deleted by the guard of the
  // phase F, and deleting the same row twice breaks the ingestion of the expediente.
  const eliminarCopia = structuredClone(borrar);
  eliminarCopia.runAfter = {};
  eliminarCopia.metadata = { operationMetadataId: OPERATION_ID };
  loop.actions[COPIA] = {
    type: 'If',
    expression: {
      and: [
        { greater: [`@length(body('${BUSCAR}'))`, 0] },
        { contains: ["@variables('RolesUsuarioDeseados')", CLAVE] },
      ],
    },
    actions: { [ELIMINAR_COPIA]: eliminarCopia },
    else: { actions: {} },
    runAfter: { [BUSCAR]: ['Succeeded'], [GUARDIA]: ['Succeeded'] },
  };

  return result;
}

function changedPathAllowlist() {
  return [`$.${LOOP_PATH}.actions.${BUSCAR}`, `$.${LOOP_PATH}.actions.${COPIA}`];
}

function compare(base, candidate) {
  const changed = diffPaths(base.definition, candidate.definition);
  const allowed = changedPathAllowlist();
  for (const changedPath of changed) {
    const isAllowed = allowed.some(prefix => changedPath === prefix || changedPath.startsWith(`${prefix}.`));
    assert.ok(isAllowed, `unexpected changed path: ${changedPath}`);
  }
  assert.equal(changed.length, 2, 'the candidate has to add the search of the copy and its guard');

  const acciones = loopActions(candidate.definition);
  const buscar = acciones[BUSCAR];
  assert.ok(buscar, 'the search of the copy is missing from the candidate');
  assert.equal(buscar.type, 'Query');
  assert.equal(buscar.inputs.from, "@body('Recoger_RolesUsuario')");
  assert.equal(buscar.inputs.where, DETECTION);

  const copia = acciones[COPIA];
  assert.ok(copia, 'the guard of the copy is missing from the candidate');
  assert.equal(copia.type, 'If');
  assert.deepEqual(copia.else, { actions: {} });
  assert.equal(copia.expression.and.length, 2);
  assert.deepEqual(copia.expression.and[0], { greater: [`@length(body('${BUSCAR}'))`, 0] });
  assert.deepEqual(copia.expression.and[1], { contains: ["@variables('RolesUsuarioDeseados')", CLAVE] });
  assert.equal(JSON.stringify(copia.expression).includes('"or"'), false,
    'the condition of the copy cannot use an or');
  assert.deepEqual(copia.runAfter, { [BUSCAR]: ['Succeeded'], [GUARDIA]: ['Succeeded'] });

  const eliminar = copia.actions[ELIMINAR_COPIA];
  assert.ok(eliminar, 'the deletion of the copy is missing from the candidate');
  assert.equal(eliminar.type, 'OpenApiConnection');
  assert.equal(eliminar.inputs.host.operationId, 'DeleteItem');
  assert.equal(eliminar.inputs.host.connectionName, 'shared_sharepointonline');
  assert.equal(eliminar.inputs.parameters.id, "@items('Por_cada_RolUsuario_Eliminar')?['ID']");
  const borrar = acciones[GUARDIA].actions.Eliminar_RolesUsuario;
  assert.equal(eliminar.inputs.parameters.dataset, borrar.inputs.parameters.dataset);
  assert.equal(eliminar.inputs.parameters.table, borrar.inputs.parameters.table);
  assert.deepEqual(eliminar.inputs.authentication, borrar.inputs.authentication);
  assert.notEqual(eliminar.metadata.operationMetadataId, borrar.metadata.operationMetadataId,
    'the operation of the copy cannot reuse the identifier of the operation of the phase F');

  // The copy is not a change of person: nothing takes the person out of the group of SharePoint.
  const removals = Object.keys(copia.actions).filter(name => /Quitar|grupo/i.test(name));
  assert.deepEqual(removals, [], 'the copy must not touch the group of SharePoint');
  assert.equal(JSON.stringify(copia.actions).includes('sitegroups'), false,
    'the copy must not touch the group of SharePoint');

  // The guard of the phase F is not touched: the two guards delete each one a different row.
  assert.deepEqual(acciones[GUARDIA], get(base.definition, `${GUARDIA_PATH}`));

  const cycles = phase.dependencyCycles(candidate.definition);
  assert.deepEqual(cycles, [], `the candidate must not close a dependency cycle: ${cycles.join(' | ')}`);

  return {
    changedPaths: changed,
    changedPathCount: changed.length,
    sourceDefinitionSha256: definitionHash(base.definition),
    candidateDefinitionSha256: definitionHash(candidate.definition),
    deletesOnlyTheCopyThatTheJsonDescribes: true,
    keepsTheRowWithTheLowerIdentifier: true,
    removesThePersonFromTheGroup: false,
  };
}

function validateDestination(destination, exclusive = true) {
  const resolved = path.resolve(destination);
  const relative = path.relative(DIRECTORY, resolved);
  assert.ok(relative && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`),
    'destination must stay inside the ignored candidate subtree');
  if (exclusive) assert.ok(!fs.existsSync(resolved), 'refusing to overwrite existing output');
  return resolved;
}

function writeOutputs() {
  const destinations = OUTPUTS.map(name => validateDestination(path.join(DIRECTORY, name)));
  const base = readBase();
  const candidate = prepare(base);
  const comparison = compare(base, candidate);
  const candidateBytes = `${JSON.stringify(candidate.definition, null, 2)}\n`;
  const comparisonBytes = `${JSON.stringify({
    status: 'PREPARED_NOT_APPLIED',
    checkedAt: new Date().toISOString(),
    environment: ENVIRONMENT,
    flow: FLOW,
    basePath: BASE_PATH,
    baseDefinitionSha256: BASE_DEFINITION_HASH,
    candidateBytes: Buffer.byteLength(candidateBytes),
    candidateSha256: hash(candidateBytes),
    changes: [
      'A role row that is a copy of another row of the same expediente, with the same person and the same kind of role, is deleted: the copy is the row with the greater identifier.',
      'The row that is deleted is one of the rows that the JSON describes: a row that the JSON does not describe is already deleted by the guard of the phase F.',
      'The person of the copy does not leave the group of SharePoint: a copy is not a change of person.',
    ],
    outOfScope: [
      'The deletion of the rows that the JSON does not describe, the catalog and the rest of the phase F are not touched.',
      'The parent flow and its ordering guard are not touched.',
      'The addition of a member to a group is not touched: the flow already does it.',
    ],
    comparison,
    runtime: { applied: false, executed: false },
  }, null, 2)}\n`;
  fs.mkdirSync(DIRECTORY, { recursive: true });
  const values = { 'candidate-definition.json': candidateBytes, 'candidate-comparison.json': comparisonBytes };
  return destinations.map((file, index) => {
    validateDestination(file);
    const content = values[OUTPUTS[index]];
    fs.writeFileSync(file, content, { flag: 'wx' });
    return { file: path.basename(file), sha256: hash(content) };
  });
}

if (require.main === module) {
  assert.equal(process.argv.length, 2, 'Usage: node prepare-role-duplicate-removal.cjs (fixed inputs/outputs only)');
  process.stdout.write(`${JSON.stringify({ localOnly: true, outputs: writeOutputs() })}\n`);
}

module.exports = { prepare, compare, readBase, diffPaths, definitionHash, validateDestination, writeOutputs,
  BASE_PATH, BASE_DEFINITION_HASH, DIRECTORY, OUTPUTS, ENVIRONMENT, FLOW, LOOP_PATH, GUARDIA_PATH,
  TRY, EXISTE, COMPROBAR, ELIMINAR, GUARDIA, BUSCAR, COPIA, ELIMINAR_COPIA, DETECTION, CLAVE,
  changedPathAllowlist, loopActions };
