// Offline DEV preparation only. This entry point never contacts a cloud service.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { prepare } = require('./prepare.cjs');

const sourceSha256 = 'e8b962d9059c7fa1e557dd4e18c50747403dd8f176eca66cee3fb7f1358cf633';
const siteParameter = 'E2E_ConexionEntorno (cr435_E2E_ConexionEntorno)';
const expectedSiteDefault = 'https://telefonicacorp.sharepoint.com/sites/DyS350.cert.OCETF';

function assertDevSite(definition) {
  assert.equal(definition.parameters?.[siteParameter]?.defaultValue, expectedSiteDefault,
    'DEV site default changed: review effective bindings and the source before preparation');
}

function prepareDevSource(raw) {
  assert.equal(createHash('sha256').update(raw).digest('hex'), sourceSha256,
    'DEV source fingerprint changed: a separately reviewed DEV baseline is required');
  const definition = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, ''));
  assertDevSite(definition);
  // Reviewed DEV action excerpts match the existing structural assertions. Clone
  // this DEV definition, never the PRO definition or its generated candidate.
  return prepare(definition);
}

if (require.main === module) {
  try {
    const [, , input, output] = process.argv;
    assert(input && output && process.argv.length === 4,
      'Usage: node prepare-dev.cjs input.definition.json output.definition.json');
    const allowed = path.resolve(__dirname, '../../.atl/project-title-sync') + path.sep;
    assert(path.resolve(output).startsWith(allowed), 'Output must stay in ignored .atl/project-title-sync/');
    const raw = fs.readFileSync(input);
    const result = prepareDevSource(raw);
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log('LOCAL DEV REVIEW ONLY. No cloud operation performed.');
    console.log('Input SHA-256: ' + sourceSha256);
    console.log('Reviewed site DEFAULT: ' + expectedSiteDefault + ' (effective bindings not verified)');
  } catch (error) {
    console.error('DEV preparation refused: ' + error.message);
    process.exitCode = 1;
  }
}

// assertDevSite() is a unit-test seam, not a source-fingerprint bypass.
module.exports = { prepareDevSource, assertDevSite, sourceSha256, siteParameter, expectedSiteDefault };
