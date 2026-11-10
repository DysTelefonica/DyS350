'use strict';
// Offline candidate preparation only: no authentication, cloud client, or deployment.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const TRY = 'Try_-_Procesar_ExpedientesJSON';
const CATCH = 'Catch_-_Procesar_ExpedientesJSON';
const RESPONSE = 'Respond_to_a_Power_App_or_flow';
const QUERY = 'Filtrar_Responsables_Validos';
const TAIL = 'Advertir_Responsables_Omitidos';
const OLD = "@body('ExpedienteJSON')?['responsables']";
const FILTERED = `@body('${QUERY}')`;
const FROM = "@coalesce(body('ExpedienteJSON')?['responsables'],json('[]'))";
const COUNT = `sub(length(coalesce(body('ExpedienteJSON')?['responsables'],json('[]'))),length(body('${QUERY}')))`;
const SOURCE_HASH = 'AA66FE1070CBF3BF03BA89450DE0D8AE3B7E1350D84AEA8630BD341728672EE4';
const BASELINE_HASH = 'EF64CD4D4809031CA9B5F8D35EBCDC7FCA9203C93A786F165BB994351C0DF1D5';
const LOOP_PATHS = [
  'Por_cada_MiembroResponsable',
  'Existe_ExpedienteJSON/actions/Comprobar_que_hay_RolesUsuario/actions/Por_cada_Responsable_2',
  'Existe_ExpedienteJSON/actions/Comprobar_que_hay_RolesUsuario/else/actions/Por_cada_Responsable_Sin_RolesUsuario',
  'Existe_ExpedienteJSON/else/actions/Tiene_ExpedientePadre/actions/Expediente_con_Padre_en_el_sistema/actions/Por_cada_Responsable_3',
  'Existe_ExpedienteJSON/else/actions/Tiene_ExpedientePadre/else/actions/Por_cada_Responsable',
];
const get = (root, key) => key.split('/').reduce((node, part) => node?.[part], root);
const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const sort = value => Array.isArray(value)?value.map(sort):value && typeof value==='object'?
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,sort(value[key])])):value;
const definitionHash = definition => hash(JSON.stringify(sort(definition)));

// Behavioral model, NOT a WDL interpreter. Do not stringify malformed inputs.
function filterResponsibles(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new TypeError('responsables must be an array');
  return value.filter(item => {
    if (item != null && (typeof item !== 'object' || Array.isArray(item))) throw new TypeError('responsable must be an object');
    const fields = ['nombre','correousuario'].map(key => {
      const field = item?.[key] ?? '';
      if (typeof field !== 'string') throw new TypeError('responsable field must be a string');
      return field.trim();
    });
    return fields[0] !== '' && fields[1] !== '';
  });
}

function walk(map, visit, prefix = '') {
  for (const [name, action] of Object.entries(map ?? {})) {
    const key = `${prefix}${name}`;
    visit(action, key);
    walk(action.actions, visit, `${key}/actions/`);
    walk(action.else?.actions, visit, `${key}/else/actions/`);
  }
}

function warningTail() {
  return {type:'If', expression:`@equals(actions('${QUERY}')?['status'],'Succeeded')`,
    runAfter:{[CATCH]:['Succeeded','Skipped']}, else:{actions:{}}, actions:{
      Hay_Responsables_Omitidos:{type:'If', expression:`@greater(${COUNT},0)`, runAfter:{}, else:{actions:{}}, actions:{
        Anexar_Advertencia_Responsables:{type:'AppendToStringVariable',runAfter:{},inputs:{name:'Resultado',value:{
          ID:"@body('ExpedienteJSON')?['idexpediente']", Estado:'Advertencia', Omitidos:`@${COUNT}`,
          Log:'Se omitieron responsables sin nombre o correo de usuario.',
        }}},
      }},
    }};
}

function prepare(snapshot) {
  assert.equal(snapshot.environment,'aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b','DEV environment mismatch');
  assert.equal(snapshot.flow,'1ca49582-ae1e-f111-8342-6045bde02c54','DEV flow mismatch');
  const result = structuredClone(snapshot), actions = result.definition.actions, work = actions[TRY].actions;
  // Idempotence is accepted only when the entire generated patch is canonical.
  if (work[QUERY] || actions[TAIL]) {
    const baseline = structuredClone(result), baseActions = baseline.definition.actions, baseWork = baseActions[TRY].actions;
    delete baseWork[QUERY]; delete baseActions[TAIL];
    baseWork.Obtener_ExpedientesSistema.runAfter = {ExpedienteJSON:['Succeeded']};
    baseActions[RESPONSE].runAfter = {[CATCH]:['Succeeded','Skipped']};
    for (const key of LOOP_PATHS) get(baseWork,key).foreach = OLD;
    const expected = prepare(baseline); // Recursion validates against the independent baseline pin.
    assert.equal(definitionHash(result.definition),definitionHash(expected.definition),'conflicting preexisting responsible-filter patch');
    return result;
  }
  assert.equal(definitionHash(result.definition),BASELINE_HASH,'baseline conflict: complete definition differs from reviewed DEV baseline');
  assert.equal(work.ExpedienteJSON.type,'ParseJson');
  assert.equal(actions[CATCH].type,'Scope'); assert.equal(actions[RESPONSE].type,'Response');
  assert.deepEqual(work.Obtener_ExpedientesSistema.runAfter,{ExpedienteJSON:['Succeeded']},'unexpected parse dependency');
  assert.deepEqual(actions[RESPONSE].runAfter,{[CATCH]:['Succeeded','Skipped']},'unexpected response dependency');
  const found = [];
  walk(actions,(action,key) => {
    if (typeof action.foreach === 'string' && action.foreach.includes("['responsables']")) {
      assert.equal(action.type,'Foreach'); assert.equal(action.foreach,OLD,'unexpected responsible expression'); found.push(key);
    }
    assert.ok(key.split('/').at(-1) !== QUERY && key.split('/').at(-1) !== TAIL,'reserved action name conflict');
  });
  assert.deepEqual(found.sort(),LOOP_PATHS.map(key=>`${TRY}/actions/${key}`).sort(),'expected exactly five known responsible consumers');
  work[QUERY] = {type:'Query',inputs:{from:FROM,
    where:"@and(not(empty(trim(coalesce(item()?['nombre'],'')))),not(empty(trim(coalesce(item()?['correousuario'],'')))))"},
    runAfter:{ExpedienteJSON:['Succeeded']}};
  work.Obtener_ExpedientesSistema.runAfter = {[QUERY]:['Succeeded']};
  for (const key of LOOP_PATHS) get(work,key).foreach = FILTERED;
  actions[TAIL] = warningTail();
  actions[RESPONSE].runAfter = {[TAIL]:['Succeeded']};
  return result;
}

function validateDestination(destination) {
  const allowed = path.resolve(__dirname,'../../.atl/project-title-sync/skip-empty-responsibles-20261106');
  const resolved = path.resolve(destination), relative = path.relative(allowed,resolved);
  assert.ok(relative && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`),'destination must stay inside the ignored candidate subtree');
  assert.ok(relative.split(path.sep).every(part=>!/[.: ]$/.test(part) && !part.includes(':') &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)),'destination contains an unsafe path component');
  const root = path.parse(resolved).root;
  let current = root;
  for (const part of resolved.slice(root.length).split(path.sep)) {
    current = path.join(current,part);
    let stat;
    try { stat = fs.lstatSync(current); } catch (error) { if (error.code === 'ENOENT') break; throw error; }
    assert.ok(!stat.isSymbolicLink(),'destination contains a symbolic link/reparse point');
    assert.equal(path.relative(current,fs.realpathSync.native(current)),'','destination reparse resolution differs');
  }
  return resolved;
}

function writeCandidate(source,destination) {
  const resolved = validateDestination(destination); // Reject escapes before reading private source.
  const bytes = fs.readFileSync(source);
  assert.equal(hash(bytes),SOURCE_HASH,'source snapshot hash mismatch; obtain a fresh reviewed baseline');
  const candidate = prepare(JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,'')));
  const output = `${JSON.stringify(candidate.definition,null,2)}\n`;
  fs.mkdirSync(path.dirname(resolved),{recursive:true});
  validateDestination(resolved); // Recheck newly created ancestors before exclusive creation.
  fs.writeFileSync(resolved,output,{flag:'wx'});
  return hash(output);
}

if (require.main === module) {
  const [source, destination, ...extra] = process.argv.slice(2);
  assert.ok(source && destination && !extra.length,'Usage: node prepare-responsible-filter.cjs source.json candidate-definition.json');
  process.stdout.write(`Local candidate only. SHA256 ${writeCandidate(source,destination)}\n`);
}
module.exports = {filterResponsibles,prepare,writeCandidate};
