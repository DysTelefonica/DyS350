'use strict';
// Offline candidate preparation only: no authentication, cloud client, save or deployment.
// The removal of the member of the group of a deleted role row (the rule R6 of the phase F).
//
// The rule: the person of a role row that the JSON no longer describes leaves the group of that
// kind, and only when she holds no row of that kind in another expediente.
//
// The endpoint that answers is `DELETE /_api/web/sitegroups/getbyid(<group>)/users/getById(<id>)`:
// the member is removed by the identifier of the member of the group, not by the login. The flow
// has the login of the row, so the candidate asks for the member of the group first, with the
// same filter of the collection, and removes it by the identifier that the answer carries.
//
// The request of the removal only runs when the member was found, so an ingestion whose person was
// never in the group does not break: a request that fails breaks the ingestion of the expediente.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const BASE_PATH = path.resolve(__dirname, '../../.atl/project-title-sync/role-group-removal-20261117/base-definition.json');
const BASE_DEFINITION_HASH = '2D1C16687BB67BE45EE9A33AA6877B8DC25297C4E2515DC3F3290A372368C9D9';
const ENVIRONMENT = 'aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b';
const FLOW = '1ca49582-ae1e-f111-8342-6045bde02c54';
const DIRECTORY = path.resolve(__dirname, '../../.atl/project-title-sync/role-group-removal-20261117');
const OUTPUTS = ['candidate-definition.json', 'candidate-comparison.json'];

const TRY = 'Try_-_Procesar_ExpedientesJSON';
const EXISTE = 'Existe_ExpedienteJSON';
const COMPROBAR = 'Comprobar_que_hay_RolesUsuario';
const ELIMINAR = 'Por_cada_RolUsuario_Eliminar';
const GUARDIA = 'Es_Rol_No_Deseado';
const CRUCE = 'Buscar_Otros_Expedientes_Con_El_Mismo_Rol';
const GUARDIA_PATH = `actions.${TRY}.actions.${EXISTE}.actions.${COMPROBAR}.actions.${ELIMINAR}.actions.${GUARDIA}.actions`;

// The two kinds that own a group, with the action that resolves the group and the catalog that
// resolves the kind. The identifiers are read by title, never as a literal.
const GRUPOS = [
  {
    clave: 'jefes',
    grupo: 'Obtener_ID_Grupo_Jefes_de_Proyecto',
    catalogo: 'Rol_Jefe_de_Proyecto',
    adicion: 'usuario_a_grupo_SP_Jefes_de_Proyecto$',
  },
  {
    clave: 'calidad',
    grupo: 'Obtener_ID_Grupo_Calidad',
    catalogo: 'Rol_Tecnico_de_Calidad',
    adicion: 'Crear_Tecnico_de_Calidad_en_Grupo_Sharepoint$',
  },
];

// The login of the row that is deleted, as the filter of the collection of the members. The filter
// is by the email and not by the login name of the claim: the connector decodes the URI before it
// sends it, and the '#' of the claim would cut the query of the URI (SharePoint answers a 400 and
// the ingestion of the expediente fails).
// The expression of the login of the row that is deleted. In a URI it has to be wrapped in
// braces: a value of a parameter that is a string is a literal, and the connector sends it as it
// is (the request fails in milliseconds, without reaching SharePoint).
const LOGIN = "@{items('Por_cada_RolUsuario_Eliminar')?['usuario']}";

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

// The first action of the definition whose name matches the pattern. The name of the action of
// the flow carries an accent, so it is found by a pattern instead of being written twice here.
function findAction(definition, pattern) {
  const matcher = new RegExp(pattern);
  let found = null;
  const walk = (node, path) => {
    if (found || !node || typeof node !== 'object') return;
    if (node.actions && typeof node.actions === 'object') {
      for (const [name, action] of Object.entries(node.actions)) {
        if (matcher.test(name)) { found = { name, action, path: path + '.actions.' + name }; break; }
        walk(action, path + '.actions.' + name);
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'actions') continue;
      walk(node[key], path + '.' + key);
    }
  };
  walk(definition, '$');
  return found;
}

function readBase(basePath = BASE_PATH) {
  const bytes = fs.readFileSync(basePath);
  const definition = JSON.parse(bytes.toString('utf8'));
  assert.equal(definitionHash(definition), BASE_DEFINITION_HASH,
    'the source definition is not the released one of the phase F');
  return { environment: ENVIRONMENT, flow: FLOW, definition };
}

const guardActions = (definition) => get(definition, GUARDIA_PATH);

// The identifier of the group, the same expression that the addition of a member uses.
const groupId = (grupo) => `@{first(body('${grupo}')?['d']?['Results'])?['Id']}`;
// The members that the answer of the collection carries, with the two shapes of the payload of
// SharePoint, so the expression can never fail.
const membersOf = (accion) => `coalesce(body('${accion}')?['d']?['Results'], body('${accion}')?['value'], createArray())`;

// The request of the removal, derived from the addition of a member that the flow already does:
// the connection, the authentication and the parameters of the site are the same ones. The request
// never carries a body: the connector accepts a GET and a DELETE without it.
function requestFrom(addition, method, uri) {
  const request = structuredClone(addition);
  request.runAfter = {};
  delete request.metadata;
  request.inputs.parameters['parameters/method'] = method;
  request.inputs.parameters['parameters/uri'] = uri;
  delete request.inputs.parameters['parameters/body'];
  return request;
}

function prepare(snapshot) {
  const result = structuredClone(snapshot);
  const acciones = guardActions(result.definition);
  assert.ok(acciones, 'the deletion guard is not where the baseline expects it');
  assert.ok(!acciones[CRUCE], 'the cross check of the other expedientes is already in the source');
  const tryScope = result.definition.actions[TRY].actions;

  // The cross check: the row that is deleted must not be the last row of that kind of that person.
  acciones[CRUCE] = {
    type: 'Query',
    inputs: {
      from: "@body('RolesUsuario')",
      where: "@and(equals(item()?['usuario'],items('Por_cada_RolUsuario_Eliminar')?['usuario']),equals(item()?['IDRol'],items('Por_cada_RolUsuario_Eliminar')?['IDRol']),not(equals(item()?['IDExpediente'],body('ExpedienteJSON')?['idexpediente'])))",
    },
    runAfter: {},
  };

  for (const grupo of GRUPOS) {
    const found = findAction(result.definition, grupo.adicion);
    assert.ok(found, `the addition to the group of ${grupo.clave} is not in the source`);
    assert.ok(tryScope[grupo.catalogo], `the catalog of ${grupo.catalogo} is missing from the source`);
    assert.ok(tryScope[grupo.grupo], `the action that resolves the group ${grupo.grupo} is missing from the source`);

    const buscar = `Obtener_el_miembro_del_grupo_${grupo.clave}`;
    const quitar = `Quitar_el_miembro_del_grupo_${grupo.clave}`;
    const peticion = `Quitar_${grupo.clave}_del_grupo`;

    // The member of the group whose login is the login of the row that is deleted. The answer
    // carries the identifier that the removal needs.
    acciones[buscar] = requestFrom(
      found.action,
      'GET',
      `_api/web/sitegroups/getbyid(${groupId(grupo.grupo)})/users?$filter=Email%20eq%20%27@{items('Por_cada_RolUsuario_Eliminar')?['usuario']}%27`,
    );
    delete acciones[buscar].inputs.parameters['parameters/body'];
    acciones[buscar].runAfter = { [CRUCE]: ['Succeeded'] };

    // The removal: only when the cross check is empty, when the row is of that kind and when the
    // member was found. A request that fails breaks the ingestion of the expediente.
    acciones[quitar] = {
      type: 'If',
      expression: {
        and: [
          { equals: [`@length(body('${CRUCE}'))`, 0] },
          { equals: ["@items('Por_cada_RolUsuario_Eliminar')?['IDRol']", `@body('${grupo.catalogo}')?[0]?['IDRol']`] },
          { greater: [`@length(${membersOf(buscar)})`, 0] },
        ],
      },
      actions: {
        [peticion]: requestFrom(
          found.action,
          'DELETE',
        `_api/web/sitegroups/getbyid(${groupId(grupo.grupo)})/users/getById(@{first(${membersOf(buscar)})?['Id']})`,
        ),
      },
      else: { actions: {} },
      runAfter: { [buscar]: ['Succeeded'], [CRUCE]: ['Succeeded'], Eliminar_RolesUsuario: ['Succeeded'] },
    };
  }

  return result;
}

function changedPathAllowlist() {
  const allowed = [`$.${GUARDIA_PATH}.${CRUCE}`];
  for (const grupo of GRUPOS) {
    allowed.push(`$.${GUARDIA_PATH}.Obtener_el_miembro_del_grupo_${grupo.clave}`);
    allowed.push(`$.${GUARDIA_PATH}.Quitar_el_miembro_del_grupo_${grupo.clave}`);
  }
  return allowed;
}

function compare(base, candidate) {
  const changed = diffPaths(base.definition, candidate.definition);
  const allowed = changedPathAllowlist();
  for (const changedPath of changed) {
    const isAllowed = allowed.some(prefix => changedPath === prefix || changedPath.startsWith(`${prefix}.`));
    assert.ok(isAllowed, `unexpected changed path: ${changedPath}`);
  }
  assert.equal(changed.length, 5, 'the candidate has to add the cross check and the two removals');
  const acciones = guardActions(candidate.definition);
  for (const grupo of GRUPOS) {
    const buscar = acciones[`Obtener_el_miembro_del_grupo_${grupo.clave}`];
    const quitar = acciones[`Quitar_el_miembro_del_grupo_${grupo.clave}`];
    const peticion = acciones[`Quitar_el_miembro_del_grupo_${grupo.clave}`].actions[`Quitar_${grupo.clave}_del_grupo`];
    assert.ok(buscar && buscar.type === 'OpenApiConnection');
    assert.equal(buscar.inputs.parameters['parameters/method'], 'GET');
    assert.match(buscar.inputs.parameters['parameters/uri'], /sitegroups\/getbyid.*\/users\?\$filter=Email/);
    assert.equal(buscar.inputs.parameters['parameters/body'], undefined,
      'the query of the member cannot carry a body');
    assert.ok(quitar && quitar.type === 'If');
    assert.equal(quitar.expression.and.length, 3);
    assert.equal(peticion.type, 'OpenApiConnection');
    assert.equal(peticion.inputs.parameters['parameters/method'], 'DELETE');
    assert.match(peticion.inputs.parameters['parameters/uri'], /sitegroups\/getbyid.*\/users\/getById/);
    assert.equal(peticion.inputs.parameters['parameters/body'], undefined,
      'the removal cannot carry a body');
    assert.equal(JSON.stringify(quitar.expression).includes('"or"'), false,
      'the condition of the removal cannot use an or');
  }
  return {
    changedPaths: changed,
    changedPathCount: changed.length,
    sourceDefinitionSha256: definitionHash(base.definition),
    candidateDefinitionSha256: definitionHash(candidate.definition),
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
      'The person of a deleted row leaves the group of the kind of that row, when she holds no row of that kind in another expediente.',
      'The member of the group is asked for with the filter of the collection and is removed by the identifier that the answer carries.',
      'The removal only runs when the member was found, so an ingestion whose person was never in the group does not break.',
    ],
    outOfScope: [
      'The deletion of the role rows, the catalog and the rest of the phase F are not touched.',
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
  assert.equal(process.argv.length, 2, 'Usage: node prepare-role-group-removal.cjs (fixed inputs/outputs only)');
  process.stdout.write(`${JSON.stringify({ localOnly: true, outputs: writeOutputs() })}\n`);
}

module.exports = { prepare, compare, readBase, diffPaths, definitionHash, validateDestination, writeOutputs,
  BASE_PATH, BASE_DEFINITION_HASH, DIRECTORY, OUTPUTS, ENVIRONMENT, FLOW, GRUPOS, GUARDIA_PATH, CRUCE,
  changedPathAllowlist, guardActions, findAction, requestFrom, groupId, membersOf };
