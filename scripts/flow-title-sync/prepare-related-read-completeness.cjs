'use strict';
// Offline candidate preparation only. This module never authenticates or deploys.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const ROOT = path.resolve(__dirname,'../..');
const DIRECTORY = path.join(ROOT,'.atl/project-title-sync/read-completeness-20261107');
const ENVIRONMENT = 'aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b';
const FLOW = 'a9928111-cd13-f111-8341-7c1e5233f7d8';
const BASELINE_HASH = '485e7a2eb03c1b0a14f334354f5e3be0c9309d2e543b87ba675171469213ab72';
const FRESH_BYTES_HASH = 'b7485a8b5e38c96ad79836eb7c0f8d1df4aa4583bd38272a7b633d8f4f0d6990';
const OLD_BYTES_HASH = '24687d872a5ff820ead6ee085047889ef9edff24fed00d5e18db74668b4083cc';
const READS = ['Obtener_ExpedienteJSON','Obtener_Hitos','Obtener_Suministradores','Obtener_Roles_usuario'];
const GUARD = 'Validar_Limite_Snapshots';
const OUTPUTS = ['candidate-definition.json','guard-clipboard.json','diagnostic-4999-clipboard.json','diagnostic-5000-clipboard.json'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sort = value => Array.isArray(value) ? value.map(sort) : value && typeof value==='object' ?
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,sort(value[key])])) : value;
const definitionHash = value => hash(JSON.stringify(sort(value)));
const work = snapshot => snapshot.definition.actions.Comprobar_que_el_archivo_es_JSON.actions['Try_-_Procesar_ExpedientesJSON'].actions;
const schema = () => ({type:'array',minItems:4,maxItems:4,items:{type:'integer',minimum:0,maximum:4999}});

// Behavioral model only: not a WDL or service JSON-schema interpreter.
function validateCounts(counts) {
  assert.ok(Array.isArray(counts) && counts.length===4,'expected exactly four snapshot counts');
  assert.ok(Array.from(counts).every(n=>Number.isInteger(n) && n>=0 && n<=4999),'snapshot count must be integer 0..4999');
  return counts;
}
function countSnapshots(snapshots) {
  assert.ok(Array.isArray(snapshots) && snapshots.length===4 && Array.from(snapshots).every(Array.isArray),'four complete arrays are required');
  return validateCounts(snapshots.map(rows=>rows.length));
}
function makeGuard() {
  return {type:'ParseJson',inputs:{
    content:`@createArray(${READS.map(name=>`length(outputs('${name}')?['body/value'])`).join(',')})`,
    schema:schema()},runAfter:{Obtener_Roles_usuario:['Succeeded']}};
}
function checkIdentity(snapshot) {
  assert.equal(snapshot.environment,ENVIRONMENT,'DEV environment mismatch');
  assert.equal(snapshot.flow,FLOW,'DEV parent flow mismatch');
  assert.equal(snapshot.definition.parameters['E2E_ConexionEntorno (cr435_E2E_ConexionEntorno)'].defaultValue,
    'https://telefonicacorp.sharepoint.com/sites/DyS350.cert.OCETF','CERT site mismatch');
}
function prepare(snapshot) {
  checkIdentity(snapshot);
  const result=structuredClone(snapshot), actions=work(result);
  if(actions[GUARD]) {
    const baseline=structuredClone(result), original=work(baseline);
    delete original[GUARD];
    for(const name of READS.slice(1))delete original[name].runtimeConfiguration;
    original.JSON_Roles_Base64.runAfter={Obtener_Roles_usuario:['Succeeded']};
    const expected=prepare(baseline);
    assert.equal(definitionHash(result.definition),definitionHash(expected.definition),'conflicting completeness patch');
    return result;
  }
  assert.equal(definitionHash(result.definition),BASELINE_HASH,'complete definition differs from independent reviewed baseline');
  for(const name of READS.slice(1)) {
    assert.equal(actions[name].inputs.host.operationId,'GetItems');
    actions[name].runtimeConfiguration={...actions[name].runtimeConfiguration,
      paginationPolicy:{minimumItemCount:5000}};
  }
  assert.deepEqual(actions.JSON_Roles_Base64.runAfter,{Obtener_Roles_usuario:['Succeeded']});
  actions[GUARD]=makeGuard();
  actions.JSON_Roles_Base64.runAfter={[GUARD]:['Succeeded']};
  return result;
}
function readPinned(file,expected) {
  const bytes=fs.readFileSync(file);
  assert.equal(hash(bytes),expected,'source snapshot bytes differ; obtain independent review before repinning');
  return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
}
function readBaseline() {
  const old=readPinned(path.join(ROOT,'.atl/project-title-sync/skip-empty-responsibles-20261106/parent-source.json'),OLD_BYTES_HASH);
  checkIdentity(old);
  assert.equal(definitionHash(old.definition),BASELINE_HASH);
  const fresh=readPinned(path.join(DIRECTORY,'fresh-parent.json'),FRESH_BYTES_HASH);
  assert.equal(fresh.name,FLOW,'fresh service flow identity mismatch');
  assert.equal(fresh.properties.state,'Started');
  assert.equal(definitionHash(fresh.properties.definition),BASELINE_HASH,'fresh/old complete definition drift');
  return {environment:ENVIRONMENT,flow:FLOW,definition:fresh.properties.definition};
}
function clipboard(name,action) {
  const ids={Validar_Limite_Snapshots:'ef622b41-ef17-4fb9-bb1a-f192cc73d037',
    Verify_4999_Passes:'dc4a63be-8f8b-4ce5-902d-b6b93f391f76',Verify_5000_Fails:'3783cd83-ea71-49c3-aac7-1b5cfbc9aed0'};
  return {id:ids[name],brandColor:'#8c6cbb',connectionReferences:{},connectorDisplayName:'Data Operations',
    icon:'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2232%22%20height%3D%2232%22%3E%3Crect%20width%3D%2232%22%20height%3D%2232%22%20fill%3D%22%238c6cbb%22%2F%3E%3C%2Fsvg%3E',
    isTrigger:false,operationName:name,operationDefinition:action};
}
function diagnosticClipboards() {
  return [4999,5000].map((count,index)=>clipboard(index?'Verify_5000_Fails':'Verify_4999_Passes',{
    type:'ParseJson',inputs:{content:[count,0,0,0],schema:schema()},
    runAfter:index?{Verify_4999_Passes:['Succeeded']}:{}}));
}
function validateDestination(destination,exclusive=true) {
  const resolved=path.resolve(destination);
  assert.equal(path.dirname(resolved),DIRECTORY,'destination must be directly inside the fixed ignored subtree');
  assert.ok(OUTPUTS.includes(path.basename(resolved)),'unapproved output name');
  execFileSync('git',['check-ignore','--quiet','--',path.relative(ROOT,resolved)],{cwd:ROOT,stdio:'pipe'});
  const drive=path.parse(resolved).root;
  let current=drive;
  for(const part of resolved.slice(drive.length).split(path.sep)) {
    current=path.join(current,part);
    let stat;
    try{stat=fs.lstatSync(current);}catch(error){if(error.code==='ENOENT')break;throw error;}
    assert.ok(!stat.isSymbolicLink(),'output contains symbolic link or reparse point');
    assert.equal(path.relative(current,fs.realpathSync.native(current)),'','output reparse resolution differs');
  }
  if(exclusive)assert.ok(!fs.existsSync(resolved),'refusing to overwrite existing output');
  return resolved;
}
function writeOutputs() {
  // Validate every public destination before reading any private source.
  const destinations=OUTPUTS.map(name=>validateDestination(path.join(DIRECTORY,name)));
  const candidate=prepare(readBaseline());
  const values=[candidate.definition,clipboard(GUARD,makeGuard()),...diagnosticClipboards()];
  fs.mkdirSync(DIRECTORY,{recursive:true});
  return destinations.map((file,index)=>{
    validateDestination(file);
    const bytes=`${JSON.stringify(values[index],null,2)}\n`;
    fs.writeFileSync(file,bytes,{flag:'wx'});
    return {file:path.basename(file),sha256:hash(bytes)};
  });
}
if(require.main===module){
  assert.equal(process.argv.length,2,'Usage: node prepare-related-read-completeness.cjs (fixed inputs/outputs only)');
  process.stdout.write(`${JSON.stringify({localOnly:true,outputs:writeOutputs()})}\n`);
}
module.exports={prepare,countSnapshots,validateCounts,readBaseline,definitionHash,makeGuard,diagnosticClipboards,
  validateDestination,writeOutputs,BASELINE_HASH,OUTPUTS};
