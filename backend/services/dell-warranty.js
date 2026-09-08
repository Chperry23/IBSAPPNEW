/**
 * Dell Warranty REST (production TechDirect).
 */
const { loadDellEnv } = require('../utils/dell-env');

async function getWarrantyToken() {
  const env = loadDellEnv();
  const tokenUrl = env.DELL_WARRANTY_TOKEN_URL;
  const clientId = env.DELL_WARRANTY_CLIENT_ID;
  const clientSecret = env.DELL_WARRANTY_CLIENT_SECRET;
  if (!tokenUrl || !clientId || !clientSecret) {
    throw new Error('DELL.env missing warranty OAuth credentials');
  }

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(`Warranty token failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return json.access_token;
}

/**
 * Lookup warranty for one or more service tags (comma-separated, max ~100).
 */
async function lookupWarranty(serviceTags) {
  const env = loadDellEnv();
  const base = (env.DELL_WARRANTY_API_BASE || 'https://apigtwb2c.us.dell.com/PROD/sbil/eapi/v5').replace(/\/$/, '');
  const tags = Array.isArray(serviceTags)
    ? serviceTags.map((t) => String(t).trim()).filter(Boolean)
    : String(serviceTags || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
  if (!tags.length) return [];

  const token = await getWarrantyToken();
  const url = `${base}/asset-entitlements?servicetags=${encodeURIComponent(tags.join(','))}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Warranty lookup failed (${res.status}): ${typeof json === 'object' ? JSON.stringify(json) : res.statusText}`);
  }

  const assets = Array.isArray(json) ? json : [];
  const now = Date.now();
  return assets.map((asset) => {
    const entitlements = Array.isArray(asset.entitlements) ? asset.entitlements : [];
    const dated = entitlements
      .map((e) => ({
        type: e.entitlementType,
        code: e.serviceLevelCode,
        description: e.serviceLevelDescription,
        start: e.startDate,
        end: e.endDate,
      }))
      .sort((a, b) => new Date(b.end || 0) - new Date(a.end || 0));
    const warrantyEnds = dated[0]?.end || null;
    const inCoverage = warrantyEnds ? new Date(warrantyEnds).getTime() >= now : false;
    return {
      serviceTag: asset.serviceTag,
      invalid: Boolean(asset.invalid),
      product: asset.productLineDescription || asset.machineDescription || null,
      model: asset.systemDescription || null,
      shipDate: asset.shipDate || null,
      country: asset.countryCode || null,
      warrantyEnds,
      inCoverage,
      serviceLevel: dated[0]?.description || null,
      entitlements: dated,
    };
  });
}

/** Batch warranty lookup in chunks of 100 (Dell API limit). */
async function lookupWarrantyBatched(serviceTags) {
  const tags = [...new Set(
    (Array.isArray(serviceTags) ? serviceTags : [])
      .map((t) => String(t).trim().toUpperCase())
      .filter(Boolean)
  )];
  const out = [];
  for (let i = 0; i < tags.length; i += 100) {
    const chunk = tags.slice(i, i + 100);
    const rows = await lookupWarranty(chunk);
    out.push(...rows);
  }
  return out;
}

module.exports = { lookupWarranty, lookupWarrantyBatched, getWarrantyToken };
