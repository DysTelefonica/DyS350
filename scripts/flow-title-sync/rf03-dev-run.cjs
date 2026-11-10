'use strict';
// DEV/CERT controlled run for the RF03 retest. Uses the tokens captured by .atl/rf03-token.cjs.
// Every step is read-only except the explicit upload step, and every step writes an evidence
// receipt under the ignored .atl tree. PRO is never touched: the site is pinned to CERT.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const SITE = 'https://telefonicacorp.sharepoint.com/sites/DyS350.cert.OCETF';
const SITE_PATH = '/sites/DyS350.cert.OCETF';
const ENVIRONMENT = 'aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b';
const PARENT_FLOW = 'a9928111-cd13-f111-8341-7c1e5233f7d8';
const CHILD_FLOW = '1ca49582-ae1e-f111-8342-6045bde02c54';
const FLOW_API = `https://${ENVIRONMENT}.api.flow.microsoft.com/providers/Microsoft.Flow/environments/${ENVIRONMENT}`;
const LIBRARY = 'Documentos compartidos/cargaJSON_entrada';
const EVIDENCE = path.resolve(__dirname, '../../.atl/project-title-sync/rf03-20261110');
const FIXTURES = path.resolve(__dirname, '../../.atl/project-title-sync/rf03-20261110');

const NEW_IDS = [900611501, 900611502, 900611503];
const LISTS = ['cargaJSON_entrada', 'cargaJSON_procesados', 'cargaJSON_log', 'Expedientes', 'Roles_usuario', 'Suministradores', 'Hitos'];

const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function readTokens() {
  const tokens = {};
  const stale = [];
  for (const [name, file] of [['sp', 'rf03-session-tokens-sp.json'], ['flow', 'rf03-session-tokens-flow.json']]) {
    const candidate = path.resolve(__dirname, '../../.atl', file);
    if (!fs.existsSync(candidate)) continue;
    const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
    if (!parsed.token && !parsed.tokens) continue;
    const ageMinutes = (Date.now() - Date.parse(parsed.obtainedAt ?? 0)) / 60000;
    if (!Number.isFinite(ageMinutes) || ageMinutes > 90) {
      stale.push(`${file} (${Math.round(ageMinutes)} min)`);
      continue;
    }
    if (parsed.tokens?.[name]) tokens[name] = parsed.tokens[name];
    else if (parsed.token && parsed.resource === name) tokens[name] = parsed.token;
  }
  if (stale.length) throw new Error(`stale session tokens: ${stale.join(', ')}; capture a new session`);
  if (!tokens.sp || !tokens.flow) {
    throw new Error('missing session token: run .atl/rf03-token.cjs for the SharePoint and the flow resources');
  }
  return tokens;
}

async function rest(token, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { authorization: `Bearer ${token}`, accept: 'application/json;odata=nometadata', ...(options.headers ?? {}) },
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: response.status, json, text };
}

async function listItems(token, list, select, filter, top = 500) {
  const query = `/_api/web/lists/getbytitle('${encodeURIComponent(list)}')/items?$select=${encodeURIComponent(select)}` +
    (filter ? `&$filter=${encodeURIComponent(filter)}` : '') + `&$top=${top}`;
  const result = await rest(token, `${SITE}${query}`);
  if (result.status !== 200) throw new Error(`list ${list} failed with ${result.status}: ${result.text.slice(0, 200)}`);
  return result.json?.value ?? [];
}

async function identity(token) {
  const result = await rest(token, `${SITE}/_api/web/currentuser?$select=Title,Email`);
  if (result.status !== 200) throw new Error(`currentuser failed with ${result.status}`);
  return result.json;
}

async function inventory(token) {
  const out = { checkedAt: new Date().toISOString(), site: SITE, lists: {}, scoped: {} };
  for (const list of LISTS) {
    try {
      const items = await listItems(token, list, 'Id', null, 1);
      out.lists[list] = { reachable: true, sample: items.length };
    } catch (error) {
      out.lists[list] = { reachable: false, error: error.message };
    }
  }
  const roles = await listItems(token, 'Roles_usuario', 'ID,IDExpediente,IDRol,Title,usuario', null, 2000);
  const scoped = roles.filter(row => NEW_IDS.includes(row.IDExpediente));
  out.scoped.roles = scoped;
  out.roleCountByExpediente = Object.fromEntries(NEW_IDS.map(id => [id, scoped.filter(row => row.IDExpediente === id).length]));
  const suppliers = await listItems(token, 'Suministradores', 'ID,IDProyecto,IDSuministrador,Title', null, 2000);
  out.scoped.suppliers = suppliers.filter(row => NEW_IDS.includes(row.IDProyecto));
  const milestones = await listItems(token, 'Hitos', 'ID,IDProyecto,IDHitoExpediente,Title', null, 2000);
  out.scoped.milestones = milestones.filter(row => NEW_IDS.includes(row.IDProyecto));
  return out;
}

async function upload(token, fileName) {
  const filePath = path.join(FIXTURES, fileName);
  const bytes = fs.readFileSync(filePath);
  const target = `${SITE}/_api/web/GetFolderByServerRelativeUrl('${SITE_PATH}/${LIBRARY}')/Files/add(overwrite=false,url='${encodeURIComponent(fileName)}')`;
  const response = await fetch(target, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: bytes,
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = null; }
  const receipt = {
    checkedAt: new Date().toISOString(),
    fileName,
    bytes: bytes.length,
    sha256: hash(bytes),
    status: response.status,
    created: json?.Name ?? json?.name ?? null,
    itemId: json?.ListItemAllFields?.Id ?? json?.ID ?? null,
    raw: json ? undefined : text.slice(0, 300),
  };
  fs.writeFileSync(path.join(EVIDENCE, `upload-${fileName}.receipt.json`), `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

async function runs(token, flowId, known = []) {
  const result = await rest(token, `${FLOW_API}/flows/${flowId}/runs?api-version=2020-06-01&$top=25`);
  if (result.status !== 200) throw new Error(`runs failed with ${result.status}: ${result.text.slice(0, 200)}`);
  const items = result.json?.value ?? [];
  const fresh = items.filter(run => !known.includes(run.name));
  return fresh.map(run => ({ name: run.name, status: run.properties?.status, startTime: run.properties?.startTime, endTime: run.properties?.endTime }));
}

async function runDetails(token, flowId, runName) {
  const result = await rest(token, `${FLOW_API}/flows/${flowId}/runs/${runName}?api-version=2020-06-01`);
  if (result.status !== 200) return { status: result.status, error: result.text.slice(0, 200) };
  const properties = result.json?.properties ?? {};
  return {
    name: runName,
    status: properties.status,
    startTime: properties.startTime,
    endTime: properties.endTime,
    outputs: properties.outputs ?? null,
    error: properties.error ?? null,
  };
}

async function main() {
  const step = process.argv[2] ?? 'precheck';
  const tokens = readTokens();
  if (!tokens.sp) throw new Error('no SharePoint token: run .atl/rf03-token.cjs first');
  const out = { step, checkedAt: new Date().toISOString(), site: SITE };
  out.user = await identity(tokens.sp);
  if (step === 'precheck' || step === 'readback') {
    out.inventory = await inventory(tokens.sp);
    fs.writeFileSync(path.join(EVIDENCE, `${step}.receipt.json`), `${JSON.stringify(out, null, 2)}\n`);
  } else if (step === 'upload') {
    out.upload = await upload(tokens.sp, process.argv[3]);
    fs.writeFileSync(path.join(EVIDENCE, `upload-${process.argv[3]}.receipt.json`), `${JSON.stringify(out, null, 2)}\n`);
  } else if (step === 'runs') {
    if (!tokens.flow) throw new Error('no flow token: run .atl/rf03-token.cjs flow first');
    const known = process.argv[4] ? process.argv[4].split(',') : [];
    out.parentRuns = await runs(tokens.flow, PARENT_FLOW, known);
    out.childRuns = await runs(tokens.flow, CHILD_FLOW, known);
    const parent = out.parentRuns[0];
    if (parent) out.parentDetails = await runDetails(tokens.flow, PARENT_FLOW, parent.name);
    const child = out.childRuns[0];
    if (child) out.childDetails = await runDetails(tokens.flow, CHILD_FLOW, child.name);
    fs.writeFileSync(path.join(EVIDENCE, `runs-${Date.now()}.receipt.json`), `${JSON.stringify(out, null, 2)}\n`);
  } else {
    throw new Error(`unknown step: ${step}`);
  }
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

if (require.main === module) {
  main().catch(error => { process.stderr.write(`${error.stack ?? error.message}\n`); process.exit(1); });
}

module.exports = { readTokens, identity, inventory, upload, runs, runDetails, listItems, SITE, ENVIRONMENT,
  PARENT_FLOW, CHILD_FLOW, NEW_IDS, LISTS, EVIDENCE, FIXTURES };
