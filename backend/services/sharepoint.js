/**
 * SharePoint / Microsoft Graph API service
 *
 * Uses the OAuth2 client-credentials flow to authenticate as an Azure AD app,
 * then reads/writes the ECIIBSSiteNotes SharePoint list via Microsoft Graph.
 *
 * Required environment variables (or sharepoint-config.json):
 *   SP_TENANT_ID     – Azure AD tenant ID  (e.g. "abcd-1234-...")
 *   SP_CLIENT_ID     – App registration client ID
 *   SP_CLIENT_SECRET – App registration client secret
 *   SP_SITE_HOST     – SharePoint host  (default: eciit.sharepoint.com)
 *   SP_SITE_PATH     – Site relative path (default: /sites/InstalledBaseServices)
 *   SP_LIST_NAME     – List name         (default: ECIIBSSiteNotes)
 */

const https = require('https');
const path  = require('path');
const fs    = require('fs');

// ── Config ────────────────────────────────────────────────────────────────────
function loadConfig() {
  // Prefer env vars; fall back to a local JSON config file
  const cfgPath = path.join(__dirname, '..', '..', 'sharepoint-config.json');
  let file = {};
  if (fs.existsSync(cfgPath)) {
    try { file = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch (_) {}
  }
  return {
    tenantId:     process.env.SP_TENANT_ID     || file.tenantId     || '',
    clientId:     process.env.SP_CLIENT_ID     || file.clientId     || '',
    clientSecret: process.env.SP_CLIENT_SECRET || file.clientSecret || '',
    siteHost:     process.env.SP_SITE_HOST     || file.siteHost     || 'eciit.sharepoint.com',
    sitePath:     process.env.SP_SITE_PATH     || file.sitePath     || '/sites/InstalledBaseServices',
    listName:     process.env.SP_LIST_NAME     || file.listName     || 'ECIIBSSiteNotes',
  };
}

// ── Tiny HTTP helper ──────────────────────────────────────────────────────────
function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (_) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

// ── Token cache ───────────────────────────────────────────────────────────────
let _tokenCache = null;

async function getAccessToken() {
  if (_tokenCache && _tokenCache.expiresAt > Date.now() + 60_000) {
    return _tokenCache.token;
  }
  const cfg = loadConfig();
  if (!cfg.tenantId || !cfg.clientId || !cfg.clientSecret) {
    throw new Error('SharePoint not configured. Set SP_TENANT_ID, SP_CLIENT_ID, SP_CLIENT_SECRET.');
  }

  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     cfg.clientId,
    client_secret: cfg.clientSecret,
    scope:         'https://graph.microsoft.com/.default',
  }).toString();

  const res = await httpRequest({
    hostname: 'login.microsoftonline.com',
    path:     `/${cfg.tenantId}/oauth2/v2.0/token`,
    method:   'POST',
    headers:  {
      'Content-Type':   'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
  }, body);

  if (!res.body.access_token) {
    throw new Error(`Token request failed: ${JSON.stringify(res.body)}`);
  }

  _tokenCache = {
    token:     res.body.access_token,
    expiresAt: Date.now() + (res.body.expires_in || 3600) * 1000,
  };
  return _tokenCache.token;
}

// ── Graph helper ──────────────────────────────────────────────────────────────
async function graphGet(urlPath) {
  const token = await getAccessToken();
  const res   = await httpRequest({
    hostname: 'graph.microsoft.com',
    path:     urlPath,
    method:   'GET',
    headers:  {
      Authorization: `Bearer ${token}`,
      Accept:        'application/json',
    },
  });
  if (res.status >= 400) throw new Error(`Graph GET ${urlPath} → ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
}

async function graphPost(urlPath, payload) {
  const token = await getAccessToken();
  const bodyStr = JSON.stringify(payload);
  const res = await httpRequest({
    hostname: 'graph.microsoft.com',
    path:     urlPath,
    method:   'POST',
    headers:  {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr),
    },
  }, bodyStr);
  if (res.status >= 400) throw new Error(`Graph POST ${urlPath} → ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
}

async function graphPatch(urlPath, payload) {
  const token = await getAccessToken();
  const bodyStr = JSON.stringify(payload);
  const res = await httpRequest({
    hostname: 'graph.microsoft.com',
    path:     urlPath,
    method:   'PATCH',
    headers:  {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr),
    },
  }, bodyStr);
  if (res.status >= 400) throw new Error(`Graph PATCH ${urlPath} → ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
}

// ── Site/List ID resolution (cached) ─────────────────────────────────────────
let _siteId = null, _listId = null, _fieldMap = null;

async function getSiteId() {
  if (_siteId) return _siteId;
  const cfg = loadConfig();
  const data = await graphGet(
    `/v1.0/sites/${cfg.siteHost}:${cfg.sitePath}`
  );
  _siteId = data.id;
  return _siteId;
}

async function getListId() {
  if (_listId) return _listId;
  const cfg    = loadConfig();
  const siteId = await getSiteId();
  const data   = await graphGet(
    `/v1.0/sites/${siteId}/lists?$filter=displayName eq '${encodeURIComponent(cfg.listName)}'`
  );
  const list   = data.value?.[0];
  if (!list) throw new Error(`SharePoint list "${cfg.listName}" not found`);
  _listId = list.id;
  return _listId;
}

/**
 * Discover the internal field names for the list (one-time).
 * Returns a map of { lowerDisplayName → internalName }
 */
async function getFieldMap() {
  if (_fieldMap) return _fieldMap;
  const siteId = await getSiteId();
  const listId = await getListId();
  const data   = await graphGet(`/v1.0/sites/${siteId}/lists/${listId}/columns`);
  const map    = {};
  (data.value || []).forEach(col => {
    map[col.displayName?.toLowerCase()] = col.name;
    map[col.name?.toLowerCase()]        = col.name;
  });
  _fieldMap = map;
  return _fieldMap;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch all items from the site notes list.
 * Returns raw Graph items with their expanded fields.
 */
async function fetchListItems() {
  const siteId = await getSiteId();
  const listId = await getListId();
  const items  = [];
  let   nextLink = `/v1.0/sites/${siteId}/lists/${listId}/items?expand=fields&$top=500`;

  while (nextLink) {
    const data = await graphGet(nextLink.startsWith('/') ? nextLink : new URL(nextLink).pathname + new URL(nextLink).search);
    items.push(...(data.value || []));
    nextLink = data['@odata.nextLink'] || null;
    if (nextLink) {
      // nextLink is an absolute URL — strip the host part
      try { nextLink = new URL(nextLink).pathname + new URL(nextLink).search; } catch (_) { nextLink = null; }
    }
  }
  return items;
}

/**
 * Given a raw Graph list item, extract { noteText, dongleIds, category, status, spItemId }.
 * We try several plausible column names since we don't know them in advance.
 */
function parseListItem(item) {
  const f = item.fields || {};

  // Description / notes
  const noteText = f.Description || f.body || f.Note || f.Notes || f.SiteNotes ||
                   f.Title2 || Object.values(f).find(v => typeof v === 'string' && v.length > 30) || '';

  // Dongle IDs — comma or semicolon separated string
  const dongleRaw = f.DongleId || f.DongleIDs || f.CustomerIDs || f.Dongle ||
                    f.dongle_id || f.CustomerDongleIDs || '';
  const dongleIds = String(dongleRaw)
    .split(/[,;]/)
    .map(s => s.trim())
    .filter(Boolean);

  const category = f.Category || f.NoteType || '';
  const status   = f.Status   || f.ItemStatus || '';

  return {
    noteText: noteText.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim(),
    dongleIds,
    category,
    status,
    spItemId: item.id ? parseInt(item.id, 10) : null,
    title: f.Title || '',
  };
}

/**
 * Add a new item to the SharePoint list.
 * `noteText` will be appended with a "[From App]" prefix.
 */
async function pushNoteToSharePoint(dongleId, noteText, createdBy) {
  const siteId = await getSiteId();
  const listId = await getListId();
  const fm     = await getFieldMap();

  // Build field payload — try to map to whatever the list uses
  const descField = fm['description'] || fm['body'] || fm['note'] || 'Description';
  const dongleField = fm['dongleid'] || fm['dongleids'] || fm['customerids'] || 'DongleId';
  const catField  = fm['category'] || fm['notetype'] || 'Category';

  const fields = {
    Title: `[From App] ${dongleId}`,
    [descField]:  `[From App - ${createdBy || 'ECI App'}] ${noteText}`,
    [dongleField]: dongleId,
    [catField]:   'General Site Notes',
  };

  return graphPost(`/v1.0/sites/${siteId}/lists/${listId}/items`, { fields });
}

/**
 * Check whether credentials are configured.
 */
function isConfigured() {
  const cfg = loadConfig();
  return !!(cfg.tenantId && cfg.clientId && cfg.clientSecret);
}

module.exports = {
  fetchListItems,
  parseListItem,
  pushNoteToSharePoint,
  isConfigured,
  loadConfig,
};
