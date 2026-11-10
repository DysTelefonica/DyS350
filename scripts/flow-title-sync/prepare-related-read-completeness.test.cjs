'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {prepare, countSnapshots, validateCounts, readBaseline, definitionHash,
  makeGuard, diagnosticClipboards, validateDestination, BASELINE_HASH, OUTPUTS} = require('./prepare-related-read-completeness.cjs');
const root = path.resolve(__dirname, '../..');
const baseline = () => readBaseline();
const work = s => s.definition.actions.Comprobar_que_el_archivo_es_JSON.actions['Try_-_Procesar_ExpedientesJSON'].actions;
const clone = value => structuredClone(value);

test('fresh and independently pinned old definitions agree', () => {
  const old = JSON.parse(fs.readFileSync(path.join(root,'.atl/project-title-sync/skip-empty-responsibles-20261106/parent-source.json'),'utf8'));
  assert.equal(definitionHash(old.definition), BASELINE_HASH);
  assert.equal(definitionHash(baseline().definition), BASELINE_HASH);
});
test('only three settings, one new guard and one dependency change', () => {
  const source = baseline(), result = prepare(source), a = work(result), before = work(source);
  for (const name of ['Obtener_Hitos','Obtener_Suministradores','Obtener_Roles_usuario']) {
    assert.deepEqual(a[name].runtimeConfiguration.paginationPolicy,{minimumItemCount:5000});
    delete a[name].runtimeConfiguration;
  }
  assert.deepEqual(a.Obtener_ExpedienteJSON,before.Obtener_ExpedienteJSON);
  assert.deepEqual(a.Validar_Limite_Snapshots,makeGuard());
  delete a.Validar_Limite_Snapshots;
  assert.deepEqual(a.JSON_Roles_Base64.runAfter,{Validar_Limite_Snapshots:['Succeeded']});
  a.JSON_Roles_Base64.runAfter = clone(before.JSON_Roles_Base64.runAfter);
  assert.deepEqual(result,source,'all inputs/auth/metadata/parameters/triggers/Catch/child references are protected');
});
test('idempotence accepts only the exact canonical candidate', () => {
  const candidate = prepare(baseline());
  assert.deepEqual(prepare(candidate),candidate);
  for (const tamper of [
    s => work(s).Validar_Limite_Snapshots.inputs.schema.items.maximum = 5000,
    s => work(s).Obtener_Roles_usuario.runtimeConfiguration.paginationPolicy.minimumItemCount = 100,
    s => work(s).JSON_Roles_Base64.runAfter = {Obtener_Roles_usuario:['Succeeded']},
    s => s.definition.triggers = {},
  ]) { const changed=clone(candidate); tamper(changed); assert.throws(()=>prepare(changed)); }
});
test('fail closed for wrong identity, non-CERT, drift and partial patches', () => {
  for (const tamper of [
    s => s.flow = 'wrong', s => s.environment = 'production',
    s => s.definition.parameters['E2E_ConexionEntorno (cr435_E2E_ConexionEntorno)'].defaultValue = 'https://example.invalid/prod',
    s => work(s).Obtener_Hitos.inputs.parameters['$top'] = 100,
    s => work(s).Obtener_Hitos.runtimeConfiguration = {secureData:{properties:['inputs']}},
    s => work(s).Obtener_Hitos.runtimeConfiguration = {paginationPolicy:{minimumItemCount:5000}},
  ]) { const s=baseline(); tamper(s); assert.throws(()=>prepare(s)); }
});
test('guard count array validates exact shape, integers and limits', () => {
  assert.deepEqual(validateCounts([0,0,0,0]),[0,0,0,0]);
  assert.deepEqual(validateCounts([4999,4999,4999,4999]),[4999,4999,4999,4999]);
  for (let position=0;position<4;position++) for (const limit of [5000,5001]) {
    const counts=[0,0,0,0];counts[position]=limit;assert.throws(()=>validateCounts(counts));
  }
  for (const invalid of [null,{},'[]',[],Array(4),[0,0,0],[0,0,0,0,0],[0,-1,0,0],[0,1.2,0,0],[0,'1',0,0],[0,null,0,0]]) assert.throws(()=>validateCounts(invalid));
});
test('snapshot model rejects missing/null/non-array snapshots without coercion', () => {
  assert.deepEqual(countSnapshots([[],[],[],[]]),[0,0,0,0]);
  for (const bad of [null,{},[],Array(4),[[],[],[]],[[],[],[],null],[[],[],[],{}],[[],[],[],'']]) assert.throws(()=>countSnapshots(bad));
});
test('100-row false absence versus completed related snapshot', () => {
  const rows=Array.from({length:101},(_,i)=>({IDProyecto:i+1}));
  assert.equal(rows.slice(0,100).some(x=>x.IDProyecto===101),false);
  assert.equal(rows.some(x=>x.IDProyecto===101),true);
  assert.deepEqual(countSnapshots([[],[],rows,rows]),[0,0,101,101]);
});
test('guard dominates every child through unchanged dependency chain', () => {
  const a=work(prepare(baseline()));
  const ancestors = (name,seen=new Set()) => {
    if(seen.has(name))return seen;seen.add(name);
    for(const predecessor of Object.keys(a[name]?.runAfter||{}))ancestors(predecessor,seen);
    return seen;
  };
  assert.ok(ancestors('Por_cada_Expediente').has('Validar_Limite_Snapshots'));
  assert.deepEqual(a.Validar_Limite_Snapshots.runAfter,{Obtener_Roles_usuario:['Succeeded']});
  assert.equal(a.Validar_Limite_Snapshots.inputs.content,"@createArray(length(outputs('Obtener_ExpedienteJSON')?['body/value']),length(outputs('Obtener_Hitos')?['body/value']),length(outputs('Obtener_Suministradores')?['body/value']),length(outputs('Obtener_Roles_usuario')?['body/value']))");
});
test('diagnostic snippets share the exact production guard schema, no connectors', () => {
  const snippets=diagnosticClipboards();
  assert.deepEqual(snippets.map(x=>x.operationDefinition.inputs.content),[[4999,0,0,0],[5000,0,0,0]]);
  for(const snippet of snippets){assert.equal(snippet.operationDefinition.type,'ParseJson');assert.deepEqual(snippet.operationDefinition.inputs.schema,makeGuard().inputs.schema);assert.deepEqual(snippet.connectionReferences,{});}
  assert.deepEqual(snippets[1].operationDefinition.runAfter,{Verify_4999_Passes:['Succeeded']});
});
test('output guard rejects arbitrary names, escapes and existing files', () => {
  const allowed=path.join(root,'.atl/project-title-sync/read-completeness-20261107');
  assert.throws(()=>validateDestination(path.join(root,'candidate-definition.json')));
  assert.throws(()=>validateDestination(path.join(allowed,'unapproved.json')));
  assert.throws(()=>validateDestination(path.join(allowed,'nested','candidate-definition.json')));
  assert.throws(()=>validateDestination(path.join(allowed,'fresh-parent.json')));
  for(const name of OUTPUTS)assert.equal(validateDestination(path.join(allowed,name),false),path.join(allowed,name));
  const probe=path.join(allowed,'diagnostic-5000-clipboard.json');
  const exists=fs.existsSync(probe);
  if(!exists)fs.writeFileSync(probe,'{}',{flag:'wx'});
  try{assert.throws(()=>validateDestination(probe),/overwrite/);}finally{if(!exists)fs.unlinkSync(probe);}
});
test('output guard rejects Windows junction resolution', t => {
  const probe=path.join(root,'.atl/project-title-sync/read-completeness-20261107/diagnostic-4999-clipboard.json');
  if(fs.existsSync(probe)){t.skip('approved output already exists; do not mutate it');return;}
  try{fs.symlinkSync(root,probe,'junction');}catch(error){if(error.code==='EPERM'){t.skip('junction creation unavailable');return;}throw error;}
  try{assert.throws(()=>validateDestination(probe),/symbolic link|reparse/);}finally{fs.unlinkSync(probe);}
});
