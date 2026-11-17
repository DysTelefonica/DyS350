'use strict';
// Builds the candidates of PROD from the verified candidates of DEV/CERT, changing nothing but
// the default value of the parameters of the environment.
//
// The definition of a flow carries, for every parameter of the environment, a default value. Those
// defaults are the ones of the environment the definition was written in, so a definition copied
// as it is would point at the site of DEV/CERT. This generator replaces them with the values read
// from the site of PROD, and refuses to write anything if the result differs in any other path.
//
// The values were read from the site of PROD on 2026-11-17 (read only): the identifiers of the
// lists with the REST of the site, the names of the groups, and the identifiers of the roles.
//
// The effective binding of every parameter in the environment of PROD still has to be checked
// before the publication: the definition carries the defaults and the environment carries the
// values, and the one that wins is what the flow uses.
//
// Offline preparation only: no authentication, no cloud client, upload or deployment.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { diffPaths } = require('./prepare-ordering-guard.cjs');

const DIRECTORY = path.resolve(__dirname, '../../.atl/project-title-sync/prod-promotion-20261117');
const CERT = path.resolve(__dirname, '../../.atl/project-title-sync/ordering-guard-20261116');

// The values of PROD, read from https://telefonicacorp.sharepoint.com/sites/DyS350.prod.OCETF
// on 2026-11-17. The name of the parameter is the one the definitions use.
const PROD = {
  'E2E_ConexionEntorno (cr435_E2E_ConexionEntorno)': 'https://telefonicacorp.sharepoint.com/sites/DyS350.prod.OCETF',
  'E2E_ListaExpedientesJSON (cr435_E2E_ListaExpedientesJSON)': 'e5076497-ce45-41f1-852e-75deda0938db',
  'E2E_ListaRolesUsuario (cr435_E2E_ListaRolesUsuario)': 'b15bcf7c-b994-4e58-a541-61a9ebc160f0',
  'E2E_ListaRoles (cr435_E2E_ListaRoles)': '0472cfba-0b8d-469e-a8dc-ae1c6fae1ee1',
  'E2E_ListaHitos (cr435_E2E_ListaHitos)': 'bd50b05b-0d5d-4226-9638-3f25f6cbb100',
  'E2E_ListaSuministradores (cr435_E2E_ListaSuministradores)': 'b5757db4-7d8b-4ba6-bd8b-79ae84fcfe02',
  'E2E_BibliotecaCargaExpedientesJSON (cr435_E2E_BibliotecaCargaExpedientesJSON)': '3f4ea36c-454a-49bc-98f2-adabca60e3cd',
  'E2E_ListaExpedientes (cr435_E2E_ListaExpedientes)': '4a4bb3ae-f9ff-4597-a15e-5d6c5b061db3',
  'E2E_BibliotecaCargaJSONFallidos (cr435_E2E_BibliotecaCargaJSONFallidos)': '/cargaJSON_fallidos',
  'E2E_BibliotecaCargaJSONProcesados (cr435_E2E_BibliotecaCargaJSONProcesados)': '/cargaJSON_procesados',
  'E2E_BibliotecaCargaJSON_Logs (cr435_E2E_BibliotecaCargaJSON_Logs)': '/cargaJSON_log',
  'E2E_GrupoJefesDeProyecto (cr435_E2E_GrupoJefesDeProyecto)': 'Jefes de Proyecto',
  'E2E_GrupoCalidad (cr435_E2E_GrupoCalidad)': 'Calidad',
  'E2E_IDRol_Ingenieria (cr435_E2E_IDRol_Ingenieria)': '3',
  'E2E_Tabla_ExpedientesDataverse (cr435_E2E_Tabla_ExpedientesDataverse)': 'cr435_expedientes',
};

const SOURCES = {
  parent: path.join(CERT, 'candidate-definition.json'),
  child: path.join(CERT, '1ca49582-ae1e-f111-8342-6045bde02c54.definition.json'),
};
const OUTPUTS = {
  parent: 'prod-parent-definition.json',
  child: 'prod-child-definition.json',
};

const sort = value => Array.isArray(value)
  ? value.map(sort)
  : (value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])]))
    : value);
const hash = text => createHash('sha256').update(text).digest('hex').toUpperCase();
const definitionHash = definition => hash(JSON.stringify(sort(definition)));

// The candidate of PROD: the candidate of DEV with the defaults of the parameters replaced.
function prepareForProd(source) {
  const definition = JSON.parse(JSON.stringify(source));
  const parameters = definition.parameters || {};
  const changed = [];
  for (const [name, value] of Object.entries(PROD)) {
    if (!parameters[name]) continue;
    const before = parameters[name].defaultValue;
    parameters[name].defaultValue = value;
    changed.push({ name, before, after: value });
  }
  // Every parameter that the definition carries has to be in the table: a parameter that is not
  // there would keep the default value of DEV/CERT and would point the flow at the site of CERT.
  const withoutValue = Object.keys(parameters)
    .filter(name => !name.startsWith('$') && !(name in PROD));
  assert.deepEqual(withoutValue, [], 'a parameter of the definition has no value of PROD');
  const changedPaths = diffPaths(source, definition);
  const outside = changedPaths.filter(p => !/^\$\.parameters\.[^.]+\.defaultValue$/.test(p));
  assert.deepEqual(outside, [], 'the candidate of PROD differs from the one of DEV outside the parameters');
  return { definition, changed, changedPaths };
}

function writeOutputs(directory = DIRECTORY) {
  fs.mkdirSync(directory, { recursive: true });
  const receipt = { localOnly: true, readOfProdOn: '2026-11-17', flows: {} };
  for (const [name, source] of Object.entries(SOURCES)) {
    const dev = JSON.parse(fs.readFileSync(source, 'utf8'));
    const prod = prepareForProd(dev);
    const out = path.join(directory, OUTPUTS[name]);
    assert.ok(!fs.existsSync(out), 'refusing to overwrite an existing output');
    fs.writeFileSync(out, JSON.stringify(prod.definition));
    receipt.flows[name] = {
      devDefinitionSha256: definitionHash(dev),
      prodDefinitionSha256: definitionHash(prod.definition),
      changedParameters: prod.changed,
      changedPathCount: prod.changedPaths.length,
    };
  }
  fs.writeFileSync(path.join(directory, 'prod-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}

if (require.main === module) {
  console.log(JSON.stringify(writeOutputs(), null, 2));
}

module.exports = { DIRECTORY, CERT, SOURCES, OUTPUTS, PROD, prepareForProd, writeOutputs, definitionHash, diffPaths };
