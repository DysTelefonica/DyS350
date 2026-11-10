'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createHash} = require('node:crypto');
const target = path.join(__dirname,'prepare-responsible-filter.cjs');
const production = require(target);
const {filterResponsibles} = production;
const TRY = 'Try_-_Procesar_ExpedientesJSON';
const CATCH = 'Catch_-_Procesar_ExpedientesJSON';
const RESPONSE = 'Respond_to_a_Power_App_or_flow';
const QUERY = 'Filtrar_Responsables_Validos';
const TAIL = 'Advertir_Responsables_Omitidos';
const OLD = "@body('ExpedienteJSON')?['responsables']";
const paths = [
  ['Por_cada_MiembroResponsable'],
  ['Existe_ExpedienteJSON','actions','Comprobar_que_hay_RolesUsuario','actions','Por_cada_Responsable_2'],
  ['Existe_ExpedienteJSON','actions','Comprobar_que_hay_RolesUsuario','else','actions','Por_cada_Responsable_Sin_RolesUsuario'],
  ['Existe_ExpedienteJSON','else','actions','Tiene_ExpedientePadre','actions','Expediente_con_Padre_en_el_sistema','actions','Por_cada_Responsable_3'],
  ['Existe_ExpedienteJSON','else','actions','Tiene_ExpedientePadre','else','actions','Por_cada_Responsable'],
];
const get = (root, path) => path.reduce((node, key) => node[key], root);
function fixture() {
  const actions = {
    ExpedienteJSON: {type:'ParseJson',inputs:{schema:{properties:{content:{},schema:{}}}}},
    Obtener_ExpedientesSistema: {type:'ParseJson',runAfter:{ExpedienteJSON:['Succeeded']}},
    ResponsableCalidad: {type:'Compose',inputs:"@body('ExpedienteJSON')?['responsableCalidad']"},
    ResponsableSeguridad: {type:'Compose',inputs:"@body('ExpedienteJSON')?['responsableSeguridad']"},
    Eliminar_RolesUsuario: {type:'OpenApiConnection',runtimeConfiguration:{staticResult:{staticResultOptions:'Enabled',name:'Eliminar_RolesUsuario0'}}},
  };
  for (const path of paths) {
    let node=actions;
    for (const key of path.slice(0,-1)) node=node[key]??=( {} );
    node[path.at(-1)]={type:'Foreach',foreach:OLD,runAfter:{},actions:{}};
  }
  return {environment:'aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b',flow:'1ca49582-ae1e-f111-8342-6045bde02c54',definition:{
    staticResults:{Eliminar_RolesUsuario0:{status:'Succeeded'}},outputs:{unchanged:true},actions:{
      [TRY]:{type:'Scope',actions},
      [CATCH]:{type:'Scope',runAfter:{[TRY]:['Failed']},actions:{Set_Resultado_Error_Expediente:{type:'SetVariable',inputs:{name:'Resultado',value:'original catch expression'}}}},
      [RESPONSE]:{type:'Response',runAfter:{[CATCH]:['Succeeded','Skipped']},inputs:{body:{resultadoexpediente:"@variables('Resultado')",fallidos:"@variables('ContadorFallidos')"}}},
  }}};
}

const sort = value => Array.isArray(value)?value.map(sort):value && typeof value==='object'?
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,sort(value[key])])):value;
const sha = value => createHash('sha256').update(value).digest('hex').toUpperCase();
// Substitute only the test trust anchors in a same-realm module copy. The production
// API has no caller-supplied baseline/hash override; no private flow data is read here.
const fixtureBytes = JSON.stringify(fixture());
const syntheticCode = fs.readFileSync(target,'utf8')
  .replace(/const BASELINE_HASH = '[A-F0-9]+';/,`const BASELINE_HASH = '${sha(JSON.stringify(sort(fixture().definition)))}';`)
  .replace(/const SOURCE_HASH = '[A-F0-9]+';/,`const SOURCE_HASH = '${sha(fixtureBytes)}';`);
const syntheticModule = {exports:{}};
vm.runInThisContext(`(function(require,module,__dirname){${syntheticCode}\n})`,{filename:target})(require,syntheticModule,__dirname);
const {prepare} = syntheticModule.exports;
test('filters entries without both required values', () => {
  assert.deepEqual(filterResponsibles([{ nombre: ' ', correousuario: ' ' }]), []);
});
test('omits missing, null, empty, name-only, mail-only and whitespace fields', () => {
  assert.deepEqual(filterResponsibles([{}, {nombre:null,correousuario:null}, {nombre:'',correousuario:''},
    {nombre:'Name'}, {correousuario:'mail@example.invalid'}, {nombre:'\t\r\n',correousuario:'mail@example.invalid'},
    {nombre:'Name',correousuario:' \t'}]), []);
});
test('preserves original object identity, values, extra fields, duplicates and order without mutation', () => {
  const a=Object.freeze({nombre:' Name ',correousuario:' mail@example.invalid ',extra:{keep:true}});
  const b=Object.freeze({nombre:'Second',correousuario:'second@example.invalid',esPreventa:'S'});
  const list=Object.freeze([a,{},b,a]);
  const before=JSON.stringify(list), filtered=filterResponsibles(list);
  assert.deepEqual(filtered,[a,b,a]); assert.strictEqual(filtered[0],a); assert.strictEqual(filtered[1],b);
  assert.equal(JSON.stringify(list),before);
});
test('missing/null/empty arrays become empty without warning candidates', () => {
  for (const value of [undefined,null,[]]) assert.deepEqual(filterResponsibles(value),[]);
});
test('invalid collection, item and field types fail without coercion', () => {
  for (const value of ['',{},0,false,[false],[1],['x'],[[]],
    [{nombre:1,correousuario:'m'}],[{nombre:'n',correousuario:{}}],
    [{nombre:'',correousuario:1}]]) assert.throws(()=>filterResponsibles(value),TypeError);
});
test('rewires exactly five loops, gates downstream work on one Query, and leaves source untouched', () => {
  const source=fixture(), before=structuredClone(source), result=prepare(source), work=result.definition.actions[TRY].actions;
  for(const path of paths) assert.equal(get(work,path).foreach,`@body('${QUERY}')`);
  assert.deepEqual(work[QUERY],{type:'Query',inputs:{from:"@coalesce(body('ExpedienteJSON')?['responsables'],json('[]'))",
    where:"@and(not(empty(trim(coalesce(item()?['nombre'],'')))),not(empty(trim(coalesce(item()?['correousuario'],'')))))"},runAfter:{ExpedienteJSON:['Succeeded']}});
  assert.deepEqual(work.Obtener_ExpedientesSistema.runAfter,{[QUERY]:['Succeeded']});
  assert.deepEqual(source,before);
});
test('tail is after Catch, guards status separately, and appends aggregate warning before response', () => {
  const source=fixture(), output=prepare(source), actions=output.definition.actions, tail=actions[TAIL];
  assert.deepEqual(tail.runAfter,{[CATCH]:['Succeeded','Skipped']});
  assert.equal(tail.expression,`@equals(actions('${QUERY}')?['status'],'Succeeded')`);
  assert.ok(!tail.expression.includes('length(')); assert.deepEqual(tail.else,{actions:{}});
  const count=tail.actions.Hay_Responsables_Omitidos;
  assert.equal(count.expression,`@greater(sub(length(coalesce(body('ExpedienteJSON')?['responsables'],json('[]'))),length(body('${QUERY}'))),0)`);
  const warning=count.actions.Anexar_Advertencia_Responsables;
  assert.equal(warning.type,'AppendToStringVariable'); assert.equal(warning.inputs.name,'Resultado');
  assert.equal(warning.inputs.value.ID,"@body('ExpedienteJSON')?['idexpediente']");
  assert.ok(warning.inputs.value.Omitidos.includes(`length(body('${QUERY}'))`));
  assert.ok(!JSON.stringify(warning).includes('correousuario'));
  assert.deepEqual(actions[RESPONSE],{...source.definition.actions[RESPONSE],runAfter:{[TAIL]:['Succeeded']}});
  assert.deepEqual(actions[CATCH],source.definition.actions[CATCH]);
});
test('skipped/failed Query does not enter omitted-count branch (structural guard model only)', () => {
  const tail=prepare(fixture()).definition.actions[TAIL];
  function visitIfModel(action,evaluate) {
    const branch=evaluate(action.expression)?action.actions:action.else.actions;
    for(const child of Object.values(branch)) if(child.type==='If') visitIfModel(child,evaluate);
  }
  for (const status of ['Skipped','Failed','TimedOut','Succeeded']) {
    let countReads=0;
    visitIfModel(tail,expression=>{
      if(expression===`@equals(actions('${QUERY}')?['status'],'Succeeded')`) return status==='Succeeded';
      assert.equal(status,'Succeeded','count must not be read for an unavailable Query body');
      countReads++; return false;
    });
    assert.equal(countReads,status==='Succeeded'?1:0);
  }
});
test('warning count is zero for an absent list and reflects omissions, including all-empty lists', () => {
  const cases=[[undefined,0],[null,0],[[],0],[[{}],1],[[{},{}],2],
    [[{nombre:'n',correousuario:'m@example.invalid'},{}],1]];
  for(const [input,count] of cases) assert.equal((input??[]).length-filterResponsibles(input).length,count);
});
test('bounded diff preserves schema, mocks, separate roles, outputs, counters and all other source properties', () => {
  const source=fixture(), output=prepare(source), restored=structuredClone(output), actions=restored.definition.actions, work=actions[TRY].actions;
  delete work[QUERY]; delete actions[TAIL];
  work.Obtener_ExpedientesSistema.runAfter={ExpedienteJSON:['Succeeded']};
  actions[RESPONSE].runAfter={[CATCH]:['Succeeded','Skipped']};
  for(const path of paths) get(work,path).foreach=OLD;
  assert.deepEqual(restored,source);
});
test('preparation is idempotent and conflicting preexisting changes fail closed', () => {
  const output=prepare(fixture()); assert.deepEqual(prepare(output),output);
  output.definition.actions[TRY].actions[QUERY].inputs.where='@true';
  assert.throws(()=>prepare(output),/conflict/i);
});
test('wrong DEV identity, missing/additional consumers and changed dependency contracts fail closed', () => {
  const mutations=[s=>s.environment='PRO',s=>s.flow='other',s=>delete s.definition.actions[TRY].actions.Por_cada_MiembroResponsable,
    s=>s.definition.actions[TRY].actions.Extra={type:'Foreach',foreach:OLD,actions:{}},
    s=>s.definition.actions[TRY].actions.Obtener_ExpedientesSistema.runAfter={},
    s=>s.definition.actions[RESPONSE].runAfter={}];
  for(const mutate of mutations){const source=fixture();mutate(source);assert.throws(()=>prepare(source));}
});

test('rejects unrelated drift in both unpatched and already-patched definitions', () => {
  for(const patched of [true,false]) {
    const value=patched?prepare(fixture()):fixture();
    value.definition.outputs={UNRELATED_DRIFT:true};
    assert.throws(()=>prepare(value),/baseline|conflict/i);
  }
});
test('rejects disabling the role-deletion mock in both unpatched and already-patched definitions', () => {
  for(const patched of [true,false]) {
    const value=patched?prepare(fixture()):fixture();
    value.definition.actions[TRY].actions.Eliminar_RolesUsuario.runtimeConfiguration.staticResult.staticResultOptions='Disabled';
    assert.throws(()=>prepare(value),/baseline|conflict/i);
  }
});
test('production API has its own immutable baseline pin rather than trusting synthetic inputs', () => {
  assert.throws(()=>production.prepare(fixture()),/baseline/i);
});
test('writer rejects escaping destinations and preserves exclusive creation using synthetic files only', () => {
  assert.equal(typeof syntheticModule.exports.writeCandidate,'function');
  const allowed=path.resolve(__dirname,'../../.atl/project-title-sync/skip-empty-responsibles-20261106');
  const temp=fs.mkdtempSync(path.join(allowed,'synthetic-test-'));
  try {
    const source=path.join(temp,'source.json');fs.writeFileSync(source,fixtureBytes);
    const write=syntheticModule.exports.writeCandidate;
    for(const destination of [path.resolve(allowed,'../outside.json'),path.join(allowed+'-sibling','leak.json'),allowed,path.join(temp,'NUL.json')]) {
      assert.throws(()=>write(source,destination),/destination/i);
      assert.equal(fs.existsSync(destination)&&fs.statSync(destination).isFile(),false);
    }
    const out=path.join(temp,'nested','candidate.json');write(source,out);
    const before=sha(fs.readFileSync(out));
    assert.throws(()=>write(source,out),/exist/i);assert.equal(sha(fs.readFileSync(out)),before);
    const junction=path.join(temp,'junction');fs.symlinkSync(path.dirname(temp),junction,'junction');
    assert.throws(()=>write(source,path.join(junction,'synthetic-escape.json')),/symbolic|reparse|destination/i);
    const dangling=path.join(temp,'dangling');fs.symlinkSync(path.join(temp,'absent-target'),dangling,'junction');
    assert.throws(()=>write(source,path.join(dangling,'candidate.json')),/symbolic|reparse/i);
  } finally {
    assert.equal(path.dirname(temp),allowed);assert.ok(path.basename(temp).startsWith('synthetic-test-'));
    fs.rmSync(temp,{recursive:true,force:true});
  }
});
