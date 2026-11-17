'use strict';
// Offline candidate preparation only: no authentication, cloud client, save or deployment.
// Rebuilds the base of the phase F2: the definition of the child flow of DEV/CERT that carried the
// removal of the member of the group (the hash `9C85364B...`).
//
// The base of the phase F2 has to be a snapshot and not the file of the live definition: that file
// is overwritten by every read of the environment, and the generator of the phase F2 has to read
// the same definition every time. The snapshot is built from the candidate of the phase F with the
// flag of the removal on, and the hash proves that it is the definition that was published.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const phase = require('./prepare-role-authoritative-deletion.cjs');

const DIRECTORY = path.resolve(__dirname, '../../.atl/project-title-sync/role-group-removal-v2-20261117');
const OUTPUT = path.join(DIRECTORY, 'base-definition.json');
const EXPECTED = '9C85364B92CD38CBDDDCB3F38500B3150BCE9518F9CCFFE0F07AAD4F896ADF4E';
const sort = (v) => Array.isArray(v) ? v.map(sort) : (v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])])) : v);
const hash = (text) => createHash('sha256').update(text).digest('hex').toUpperCase();

const base = phase.readBase();
const candidate = phase.prepare(base);
phase.compare(base, candidate);
const result = hash(JSON.stringify(sort(candidate.definition)));
assert.equal(result, EXPECTED, `the rebuilt base is not the published one: ${result}`);
fs.mkdirSync(DIRECTORY, { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(candidate.definition, null, 2) + '\n');
console.log(JSON.stringify({ base: OUTPUT, baseDefinitionSha256: result }));
