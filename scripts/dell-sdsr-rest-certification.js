/**
 * Full Sandbox Self-Dispatch REST certification suite.
 * Usage: node scripts/dell-sdsr-rest-certification.js
 * Writes report to exports/ (no secrets).
 */
const fs = require('fs');
const path = require('path');
const sdsr = require('../backend/services/dell-sdsr');
const { loadDellEnv, getDellDispatchDefaults } = require('../backend/utils/dell-env');

const lines = [];
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  lines.push(line);
  console.log(line);
}

async function rest(pathAndQuery, opts) {
  // reuse private pattern via public helpers where possible
  const env = loadDellEnv(true);
  const token = await sdsr.getDispatchToken();
  const url = `${sdsr.restBase(env)}${pathAndQuery.startsWith('/') ? '' : '/'}${pathAndQuery}`;
  const res = await fetch(url, {
    method: opts?.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      TDUser: sdsr.tdUser(env),
      Accept: 'application/json',
      ...(opts?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = null;
  }
  return { status: res.status, ok: res.ok, text, json, url };
}

function summarize(label, result, extra = '') {
  const ok = result.ok || result.status === 204;
  log(`${ok ? 'PASS' : 'FAIL'} ${label} → HTTP ${result.status}${extra}`);
  if (!ok) log(`  body: ${(result.text || '').replace(/\s+/g, ' ').slice(0, 240)}`);
  return ok;
}

(async () => {
  const env = loadDellEnv(true);
  const defaults = getDellDispatchDefaults();
  const tag = 'CARV005';
  let pass = 0;
  let fail = 0;
  let workOrder = null;

  log('=== Dell Self-Dispatch REST Sandbox certification ===');
  log(`REST base: ${sdsr.restBase(env)}`);
  log(`Sandbox: ${sdsr.isSandboxEnv(env)}`);
  log(`TDUser: ${sdsr.tdUser(env)}`);
  log(`Client ID: ${env.DELL_DISPATCH_CLIENT_ID}`);
  log(`Test service tag: ${tag}`);

  // 1) OAuth
  try {
    const token = await sdsr.getDispatchToken();
    log(`PASS OAuth client_credentials → token len=${token.length}`);
    pass++;
  } catch (e) {
    log(`FAIL OAuth → ${e.message}`);
    fail++;
    throw e;
  }

  // 2) company-info
  {
    const r = await rest('/company-info');
    const ok = summarize('GET company-info', r, r.json?.relationships ? ` relationships=${r.json.relationships.length}` : '');
    ok ? pass++ : fail++;
  }

  // 3) parts by service tag
  let modelCode = null;
  {
    const parts = await sdsr.getPartsByServiceTag(tag);
    if (parts.ok && parts.parts?.length) {
      modelCode = parts.model;
      log(`PASS GET parts?service_tag=${tag} → ${parts.parts.length} parts, model=${parts.modelDescription || parts.model}`);
      pass++;
    } else {
      log(`FAIL GET parts?service_tag=${tag} → ${parts.error || parts.hint || 'no parts'}`);
      fail++;
    }
  }

  // 4) parts by model (if we got a model code)
  if (modelCode) {
    const r = await rest(`/parts?model_code=${encodeURIComponent(modelCode)}`);
    const count = Array.isArray(r.json?.parts) ? r.json.parts.length : 0;
    const ok = summarize(`GET parts?model_code=${modelCode}`, r, ` parts=${count}`);
    ok ? pass++ : fail++;
  } else {
    log('SKIP GET parts by model (no model_code from service tag)');
  }

  // 5) components by service tag
  {
    const r = await rest(`/components?service_tag=${encodeURIComponent(tag)}`);
    const count = Array.isArray(r.json?.parts) || Array.isArray(r.json?.components)
      ? (r.json.parts || r.json.components).length
      : r.json
        ? Object.keys(r.json).length
        : 0;
    const ok = summarize(`GET components?service_tag=${tag}`, r, ` payloadKeys/parts~=${count}`);
    ok ? pass++ : fail++;
    if (ok) log(`  excerpt: ${JSON.stringify(r.json).slice(0, 220)}`);
  }

  // 6) create dispatch
  {
    const parts = await sdsr.getPartsByServiceTag(tag);
    const pick =
      parts.parts?.find((p) => /hard|hdd|ssd|storage|keyboard/i.test(`${p.partDescription} ${p.partNumber}`)) ||
      parts.parts?.[0];
    const created = await sdsr.createDispatch({
      serviceTag: tag,
      branchName: env.DELL_DISPATCH_GROUP_NAME,
      dellCustomerName: env.DELL_DISPATCH_CUSTOMER_NAME,
      track: 'Tier 1',
      techEmail: env.DELL_DISPATCH_TECH_EMAIL,
      primaryContactName: defaults.primary_contact_name,
      primaryContactPhone: defaults.primary_contact_phone,
      primaryContactEmail: defaults.primary_contact_email,
      countryIsoCode: 'US',
      city: defaults.ship_city,
      state: defaults.ship_state,
      zip: defaults.ship_zip,
      addressLine1: defaults.ship_address_line1,
      timezone: defaults.ship_timezone,
      requestCompleteCare: false,
      requestReturnToDepot: false,
      requestOnsiteTechnician: false,
      troubleshootingNote: 'Sandbox certification test — Cabinet PM REST integration. Safe to ignore.',
      problemDescription: 'Sandbox certification test dispatch',
      parts: pick ? [{ partNumber: pick.partNumber, ppid: '', quantity: 1 }] : [{ partNumber: 'KBD', ppid: '', quantity: 1 }],
      attachments: [],
    });
    if (created.ok) {
      workOrder = created.workOrder || created.dispatchCode;
      log(`PASS POST dispatches → workOrder=${workOrder || '(none)'} status=${created.result || ''} dps=${created.dpsNumber || ''}`);
      pass++;
    } else {
      log(`FAIL POST dispatches → ${created.error}`);
      if (created.raw) log(`  raw: ${String(created.raw).slice(0, 300)}`);
      fail++;
    }
  }

  // 7) inquiry (if we have a work order)
  if (workOrder) {
    const status = await sdsr.getDispatchStatus(workOrder);
    if (status.ok) {
      log(`PASS POST inquiry code=${workOrder} → status=${status.status || status.result || 'ok'}`);
      pass++;
    } else {
      log(`FAIL POST inquiry → ${status.error}`);
      fail++;
    }
  } else {
    log('SKIP POST inquiry (no work order from create)');
  }

  // 8) inquiry_ex bulk (by create date window — soft check)
  {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const r = await rest('/inquiry_ex', {
      method: 'POST',
      body: {
        offset: '0',
        page_size: '10',
        create_date: since,
        additional_fields: ['CreateTimestamp', 'StatusDescription', 'Unit.Serial'],
      },
    });
    // Some sandboxes reject shape — count 200/204 as pass, document otherwise
    if (r.ok || r.status === 204) {
      log(`PASS POST inquiry_ex → HTTP ${r.status}`);
      pass++;
    } else {
      log(`FAIL POST inquiry_ex → HTTP ${r.status} ${(r.text || '').replace(/\s+/g, ' ').slice(0, 200)}`);
      fail++;
    }
  }

  log('=== Summary ===');
  log(`PASS=${pass} FAIL=${fail}`);
  log(fail === 0 ? 'RESULT: Sandbox certification suite completed successfully.' : 'RESULT: Some endpoints failed — review above.');

  const outDir = path.resolve(__dirname, '../exports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(outDir, `dell-sdsr-rest-certification-${stamp}.log`);
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(`\nWrote ${outPath}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
