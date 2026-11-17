'use strict';
// The tests of the preparation of the candidates of PROD: the candidate of PROD differs from the
// one of DEV only in the default value of the parameters, and every parameter of the definition
// has a value of PROD.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const generator = require('./prepare-prod-candidates.cjs');
const { PROD, SOURCES, prepareForProd, definitionHash, diffPaths } = generator;

const dev = Object.fromEntries(Object.entries(SOURCES).map(([name, file]) => [name, JSON.parse(fs.readFileSync(file, 'utf8'))]));

test('the candidate of PROD differs from the one of DEV only in the parameters', () => {
  for (const [name, definition] of Object.entries(dev)) {
    const prod = prepareForProd(definition);
    const changed = diffPaths(definition, prod.definition);
    assert.ok(changed.length > 0, 'the candidate of PROD is the same as the one of DEV');
    for (const path of changed) {
      assert.ok(
        /^\$\.parameters\.[^.]+\.defaultValue$/.test(path),
        'the candidate of PROD changes something that is not a parameter: ' + path,
      );
    }
  }
});

test('no parameter of the definition keeps the value of DEV/CERT', () => {
  for (const [name, definition] of Object.entries(dev)) {
    const prod = prepareForProd(definition);
    for (const [parameter, value] of Object.entries(prod.definition.parameters || {})) {
      if (parameter.startsWith('$')) continue;
      assert.ok(parameter in PROD, 'a parameter of ' + name + ' has no value of PROD: ' + parameter);
      assert.equal(value.defaultValue, PROD[parameter], 'the parameter ' + parameter + ' does not carry the value of PROD');
    }
  }
});

test('the site of the environment of PROD is the site of PROD', () => {
  for (const [name, definition] of Object.entries(dev)) {
    const prod = prepareForProd(definition);
    const site = prod.definition.parameters['E2E_ConexionEntorno (cr435_E2E_ConexionEntorno)'].defaultValue;
    assert.equal(site, 'https://telefonicacorp.sharepoint.com/sites/DyS350.prod.OCETF',
      'the candidate of ' + name + ' does not point at the site of PROD');
    assert.ok(!JSON.stringify(prod.definition).includes('DyS350.cert.OCETF'),
      'the candidate of ' + name + ' still mentions the site of DEV/CERT');
  }
});

test('the candidate of PROD has a different hash than the one of DEV', () => {
  for (const [name, definition] of Object.entries(dev)) {
    const prod = prepareForProd(definition);
    assert.notEqual(definitionHash(prod.definition), definitionHash(definition),
      'the candidate of ' + name + ' for PROD has the same hash as the one of DEV');
  }
});

test('the outputs stay inside the ignored subtree', () => {
  const resolved = path.resolve(generator.DIRECTORY);
  const relative = path.relative(generator.CERT, resolved);
  assert.ok(relative && !path.isAbsolute(relative), 'the outputs do not stay inside the ignored subtree');
});
