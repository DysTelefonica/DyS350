'use strict';
// Offline candidate preparation only: no authentication, cloud client, upload or deployment.
// Builds the fourth phase on top of the applied completeness guard (A7CA118D):
//
// 1. The schema of the Parse JSON action declares the fifty keys of the exporter and does not
//    allow any other. A JSON that carries a key the flow does not know is rejected and kept for
//    review instead of being accepted with the new field silently dropped.
// 2. The two role identifiers that were written as literals (the parameter that held 3 for
//    Ingenieros and the literal 5) are resolved by name from the roles catalog the flow already
//    receives, the same mechanism it uses for Jefe de proyecto, Preventa and Calidad.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { dependencyCycles } = require('./prepare-role-scoped-delete.cjs');

const BASE_PATH = path.resolve(__dirname, '../../.atl/project-title-sync/field-completeness-guard-20261114/candidate-definition.json');
const BASE_DEFINITION_HASH = 'A7CA118D769E696BF355960B3E0DACF2F40B39BEB464EB72915480FBC40BB13E';
const DIRECTORY = path.resolve(__dirname, '../../.atl/project-title-sync/catalog-roles-and-unknown-fields-20261115');
const OUTPUTS = ['candidate-definition.json', 'candidate-comparison.json'];

const TRY = 'Try_-_Procesar_ExpedientesJSON';
const PARSE = 'ExpedienteJSON';
const SCHEMA_PATH = `actions.${TRY}.actions.${PARSE}.inputs.schema`;
const CATALOG = 'Obtener_Roles';

// The roles that the flow resolves by name. The identifier of the catalog is the truth: the
// literal 3 and the literal 5 of the previous definition were a copy of it.
const CATALOG_ROLES = [
  { action: 'Rol_Ingenieros', title: 'Ingenieros' },
  { action: 'Rol_Documentacion', title: 'Técnicos de documentación' },
];
const ID = {
  Rol_Ingenieros: "body('Rol_Ingenieros')?[0]?['IDRol']",
  Rol_Documentacion: "body('Rol_Documentacion')?[0]?['IDRol']",
};
const INGENIERIA = '@' + ID.Rol_Ingenieros;
const DOCUMENTACION = '@' + ID.Rol_Documentacion;
const INGENIERIA_PARAMETER = "int(parameters('E2E_IDRol_Ingenieria (cr435_E2E_IDRol_Ingenieria)'))";

const sort = value => Array.isArray(value)
  ? value.map(sort)
  : (value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])]))
    : value);
const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const definitionHash = definition => hash(JSON.stringify(sort(definition)));

const get = (root, key) => key.split('.').reduce((node, part) => node?.[part], root);

function readBase(basePath = BASE_PATH) {
  const bytes = fs.readFileSync(basePath);
  const definition = JSON.parse(bytes.toString('utf8'));
  assert.equal(definitionHash(definition), BASE_DEFINITION_HASH, 'the base is not the reviewed completeness guard');
  return { definition };
}

// Every action of the tree, with its path, so the substitutions can be applied to the whole
// definition and not only to the branches that were read by hand.
function walkActions(node, path, visit) {
  if (!node || typeof node !== 'object') return;
  for (const [name, action] of Object.entries(node.actions || {})) {
    visit(path + ' > ' + name, name, action);
    walkActions(action, path + ' > ' + name, visit);
  }
  if (node.else && node.else.actions) walkActions(node.else, path + ' > else', visit);
}

// Every string of an action, at any depth, is a candidate for the substitution of a role
// identifier: the comparison of a key, the search of an existing row and the write of the role.
function deepReplace(node, from, to, counter) {
  if (typeof node === 'string') {
    if (!node.includes(from)) return node;
    counter.count += node.split(from).length - 1;
    return node.split(from).join(to);
  }
  if (Array.isArray(node)) return node.map(item => deepReplace(item, from, to, counter));
  if (node && typeof node === 'object') {
    for (const key of Object.keys(node)) node[key] = deepReplace(node[key], from, to, counter);
  }
  return node;
}

function prepare(base) {
  const result = JSON.parse(JSON.stringify(base));
  const scope = get(result.definition, `actions.${TRY}`);

  // 1. The schema does not accept a key the flow does not know.
  const schema = get(result.definition, SCHEMA_PATH);
  schema.additionalProperties = false;

  // 2. The two role identifiers come from the catalog, by name.
  for (const role of CATALOG_ROLES) {
    assert.ok(!scope.actions[role.action], `the action ${role.action} already exists`);
    scope.actions[role.action] = {
      runAfter: { [CATALOG]: ['Succeeded'] },
      metadata: { operationMetadataId: '00000000-0000-0000-0000-000000000000' },
      type: 'Query',
      inputs: { from: `@body('${CATALOG}')`, where: `@equals(item()?['Title'], '${role.title}')` },
    };
  }
  // The scope waits for the two lookups, so the actions inside it can read their output.
  const scopeRunAfter = scope.actions['Existe_ExpedienteJSON'].runAfter || {};
  for (const role of CATALOG_ROLES) scopeRunAfter[role.action] = ['Succeeded'];
  scope.actions['Existe_ExpedienteJSON'].runAfter = scopeRunAfter;

  // The writes of an identifier carry the expression alone, so they keep the @.
  let identifiers = 0;
  walkActions(scope, '', (path, name, action) => {
    const parameters = action.inputs && action.inputs.parameters;
    if (!parameters || !('item/IDRol' in parameters)) return;
    const value = parameters['item/IDRol'];
    if (value === 5) { parameters['item/IDRol'] = DOCUMENTACION; identifiers += 1; }
    else if (typeof value === 'string' && value.includes(INGENIERIA_PARAMETER)) { parameters['item/IDRol'] = INGENIERIA; identifiers += 1; }
  });
  assert.equal(identifiers, 8, 'the eight writes of a role identifier must be resolved by name');

  // The comparisons are nested inside a concat, so they must not carry the @.
  const counter = { count: 0 };
  deepReplace(scope.actions, INGENIERIA_PARAMETER, ID.Rol_Ingenieros, counter);
  const ingenieria = counter.count;
  counter.count = 0;
  deepReplace(scope.actions, "'-',5)", "'-'," + ID.Rol_Documentacion + ')', counter);
  const documentacion = counter.count;
  assert.equal(ingenieria, 3, 'the three comparisons of the identifier of Ingenieros must be resolved by name');
  assert.equal(documentacion, 3, 'the three comparisons of the identifier of the documentation role must be resolved by name');
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
  const allowed = [`$.${SCHEMA_PATH}.additionalProperties`];
  for (const role of CATALOG_ROLES) allowed.push(`$.actions.${TRY}.actions.${role.action}`);
  allowed.push(`$.actions.${TRY}.actions.Existe_ExpedienteJSON.runAfter`);
  for (const role of CATALOG_ROLES) allowed.push(`$.actions.${TRY}.actions.Existe_ExpedienteJSON.runAfter.${role.action}`);
  for (const path of changed) {
    if (allowed.includes(path)) continue;
    // The substitutions of the role identifiers touch the actions that write them.
    if (/\.inputs\.where$/.test(path) || /\.inputs\.value$/.test(path)) continue;
    if (/\.inputs\.parameters\.item\/IDRol$/.test(path) || /\.expression\./.test(path)) continue;
    assert.ok(false, `unexpected changed path: ${path}`);
  }
  const schema = get(candidate.definition, SCHEMA_PATH);
  assert.equal(schema.additionalProperties, false, 'the schema must not accept an unknown key');
  assert.equal(schema.required.length, 50, 'the fifty keys must stay required');
  const scope = get(candidate.definition, `actions.${TRY}`);
  for (const role of CATALOG_ROLES) {
    const action = scope.actions[role.action];
    assert.equal(action.type, 'Query');
    assert.equal(action.inputs.from, `@body('${CATALOG}')`);
    assert.ok(action.inputs.where.includes(role.title), `the lookup of ${role.title} must filter by its title`);
    assert.deepEqual(action.runAfter, { [CATALOG]: ['Succeeded'] });
    assert.deepEqual(scope.actions['Existe_ExpedienteJSON'].runAfter[role.action], ['Succeeded']);
  }
  const cycles = dependencyCycles(candidate.definition);
  assert.deepEqual(cycles, [], `the candidate must not close a dependency cycle: ${cycles.join(' | ')}`);
  return {
    changedPaths: changed,
    changedPathCount: changed.length,
    sourceDefinitionSha256: definitionHash(base.definition),
    candidateDefinitionSha256: definitionHash(candidate.definition),
    unknownFieldsAreRejected: true,
    roleIdentifiersComeFromTheCatalog: true,
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

module.exports = { BASE_PATH, BASE_DEFINITION_HASH, DIRECTORY, OUTPUTS, SCHEMA_PATH, CATALOG_ROLES, INGENIERIA, DOCUMENTACION, prepare, compare, readBase, walkActions, diffPaths, definitionHash, validateDestination, writeOutputs, dependencyCycles };
