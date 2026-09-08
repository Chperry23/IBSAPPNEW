/**
 * Exploratory Dell Warranty (TechDirect) API test.
 * Loads DELL.env, fetches an OAuth token, then probes v5 endpoints
 * with service tags from the local tablet DB (or CLI args).
 *
 *   node scripts/test-dell-warranty.js
 *   node scripts/test-dell-warranty.js ABC1234 DEF5678
 */
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');

const envPath = path.resolve(__dirname, '../DELL.env');
const dbPath = path.resolve(__dirname, '../data/cabinet_pm_tablet.db');

function loadEnvFile(filePath) {
  const env = {};
  const text = fs.readFileSync(filePath, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return env;
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}

async function loadServiceTagsFromDb(limit = 8) {
  if (!fs.existsSync(dbPath)) return [];
  const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
  try {
    const rows = await all(
      db,
      `SELECT DISTINCT TRIM(dell_service_tag_number) AS tag
       FROM sys_workstations
       WHERE dell_service_tag_number IS NOT NULL
         AND LENGTH(TRIM(dell_service_tag_number)) BETWEEN 5 AND 10
         AND LOWER(TRIM(dell_service_tag_number)) NOT IN ('', 'not available', 'n/a', 'none', 'unknown')
       LIMIT ?`,
      [limit]
    );
    return rows.map((r) => r.tag).filter(Boolean);
  } finally {
    db.close();
  }
}

async function getAccessToken(env) {
  const tokenUrl = env.DELL_WARRANTY_TOKEN_URL;
  const clientId = env.DELL_WARRANTY_CLIENT_ID;
  const clientSecret = env.DELL_WARRANTY_CLIENT_SECRET;
  if (!tokenUrl || !clientId || !clientSecret) {
    throw new Error('DELL.env is missing DELL_WARRANTY_TOKEN_URL / CLIENT_ID / CLIENT_SECRET');
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const retry = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
    });
    const retryJson = await retry.json().catch(() => ({}));
    if (!retry.ok || !retryJson.access_token) {
      throw new Error(
        `Token failed (${res.status} then ${retry.status}): ${JSON.stringify(json)} / ${JSON.stringify(retryJson)}`
      );
    }
    return retryJson;
  }
  return json;
}

async function getJson(url, token) {
  const started = Date.now();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, ms: Date.now() - started, json };
}

function summarizeEntitlements(assets) {
  if (!Array.isArray(assets)) return assets;
  return assets.map((asset) => {
    const entitlements = Array.isArray(asset.entitlements) ? asset.entitlements : [];
    const now = Date.now();
    const dated = entitlements
      .map((e) => ({
        type: e.entitlementType,
        code: e.serviceLevelCode,
        description: e.serviceLevelDescription,
        start: e.startDate,
        end: e.endDate,
        active: e.endDate ? new Date(e.endDate).getTime() >= now : false,
      }))
      .sort((a, b) => new Date(b.end || 0) - new Date(a.end || 0));
    const latestEnd = dated[0]?.end || null;
    return {
      serviceTag: asset.serviceTag,
      product: asset.productLineDescription || asset.machineDescription || asset.productId,
      model: asset.systemDescription || asset.machineDescription,
      shipDate: asset.shipDate,
      country: asset.countryCode,
      orderBuid: asset.orderBuid,
      inWarranty: latestEnd ? new Date(latestEnd).getTime() >= Date.now() : false,
      warrantyEnds: latestEnd,
      entitlementCount: entitlements.length,
      entitlements: dated,
    };
  });
}

function previewKeys(value, depth = 0) {
  if (value == null || depth > 2) return typeof value;
  if (Array.isArray(value)) {
    return value.length ? [previewKeys(value[0], depth + 1)] : [];
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = Array.isArray(v) ? `array(${v.length})` : v && typeof v === 'object' ? previewKeys(v, depth + 1) : typeof v;
    }
    return out;
  }
  return typeof value;
}

(async () => {
  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing ${envPath}`);
  }
  const env = loadEnvFile(envPath);
  const cliTags = process.argv.slice(2).map((t) => t.trim()).filter(Boolean);
  const dbTags = cliTags.length ? [] : await loadServiceTagsFromDb(8);
  const tags = (cliTags.length ? cliTags : dbTags).slice(0, 8);

  console.log('token_url', env.DELL_WARRANTY_TOKEN_URL);
  console.log('api_base', env.DELL_WARRANTY_API_BASE);
  console.log('client_id', env.DELL_WARRANTY_CLIENT_ID);
  console.log('tags', tags.length ? tags.join(',') : '(none found)');

  const tokenPayload = await getAccessToken(env);
  console.log('\n=== OAuth token ===');
  console.log({
    token_type: tokenPayload.token_type,
    expires_in: tokenPayload.expires_in,
    scope: tokenPayload.scope,
    access_token_len: tokenPayload.access_token ? String(tokenPayload.access_token).length : 0,
  });

  if (!tags.length) {
    console.log('\nNo service tags to query. Pass tags: node scripts/test-dell-warranty.js ABC1234');
    return;
  }

  const base = env.DELL_WARRANTY_API_BASE.replace(/\/$/, '');
  const joined = encodeURIComponent(tags.join(','));
  const endpoints = [
    ['asset-entitlements', `${base}/asset-entitlements?servicetags=${joined}`],
    ['assets', `${base}/assets?servicetags=${joined}`],
    ['asset-entitlement-components', `${base}/asset-entitlement-components?servicetags=${joined}`],
    ['asset-components', `${base}/asset-components?servicetags=${joined}`],
  ];

  for (const [name, url] of endpoints) {
    console.log(`\n=== GET ${name} ===`);
    const result = await getJson(url, tokenPayload.access_token);
    console.log({ status: result.status, ms: result.ms });
    if (name === 'asset-entitlements') {
      console.log('useful_fields', JSON.stringify(summarizeEntitlements(result.json), null, 2));
    } else {
      console.log('shape', JSON.stringify(previewKeys(result.json), null, 2));
      const sample = Array.isArray(result.json) ? result.json[0] : result.json;
      console.log('sample', JSON.stringify(sample, null, 2)?.slice(0, 4000));
    }
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
