const https = require('https');
const fs    = require('fs');
const path  = require('path');

// Load config directly
const cfgPath = path.join(__dirname, 'sharepoint-config.json');
const file = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const fileSecretId    = file.clientSecret || '';
const fileSecretValue = file.value || '';
const looksLikeGuid   = /^[0-9a-f-]{36}$/i.test(fileSecretId.trim());
const clientSecret = fileSecretValue || (!looksLikeGuid ? fileSecretId : '');

const cfg = {
  tenantId:     process.env.SP_TENANT_ID     || file.tenantId,
  clientId:     process.env.SP_CLIENT_ID     || file.clientId,
  clientSecret: process.env.SP_CLIENT_SECRET || clientSecret,
  siteHost:     file.siteHost || 'eciit.sharepoint.com',
  sitePath:     file.sitePath || '/sites/InstalledBaseServices',
  listName:     file.listName || 'ECIIBSSiteNotes',
};

console.log('=== SharePoint Connection Test ===');
console.log('Tenant ID  :', cfg.tenantId);
console.log('Client ID  :', cfg.clientId);
console.log('Secret     : (length', cfg.clientSecret.length, ', starts:', cfg.clientSecret.substring(0,4)+'...)');
console.log('Site       :', cfg.siteHost + cfg.sitePath);
console.log('List       :', cfg.listName);
console.log('');

function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (_) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function run() {
  // Step 1: Get token
  console.log('Step 1: Requesting OAuth token...');
  const tokenBody = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     cfg.clientId,
    client_secret: cfg.clientSecret,
    scope:         'https://graph.microsoft.com/.default',
  }).toString();

  const tokenRes = await httpRequest({
    hostname: 'login.microsoftonline.com',
    path:     `/${cfg.tenantId}/oauth2/v2.0/token`,
    method:   'POST',
    headers: {
      'Content-Type':   'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(tokenBody),
    },
  }, tokenBody);

  if (!tokenRes.body.access_token) {
    console.error('FAILED to get token:', JSON.stringify(tokenRes.body, null, 2));
    return;
  }
  console.log('  Token obtained. Expires in:', tokenRes.body.expires_in, 'seconds');
  console.log('  Token scopes:', tokenRes.body.scope || '(not returned)');
  const token = tokenRes.body.access_token;
  console.log('');

  async function graphGet(urlPath) {
    const res = await httpRequest({
      hostname: 'graph.microsoft.com',
      path:     urlPath,
      method:   'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    return res;
  }

  // Step 2: Try to resolve site by host:path
  console.log('Step 2: Resolving site ID via host:path...');
  const siteRes = await graphGet(`/v1.0/sites/${cfg.siteHost}:${cfg.sitePath}`);
  if (siteRes.status !== 200) {
    console.error('  FAILED (' + siteRes.status + '):', JSON.stringify(siteRes.body?.error || siteRes.body, null, 2));

    // Try alternate: look up site by just the host
    console.log('');
    console.log('Step 2b: Trying root site lookup...');
    const rootRes = await graphGet(`/v1.0/sites/${cfg.siteHost}`);
    if (rootRes.status === 200) {
      console.log('  Root site access WORKS. Site ID:', rootRes.body.id);
      console.log('  This means Sites.Read.All is NOT granted, or the site path is wrong.');
    } else {
      console.error('  Root site also failed (' + rootRes.status + '):', JSON.stringify(rootRes.body?.error || rootRes.body, null, 2));
    }

    // Try /v1.0/sites?search=*
    console.log('');
    console.log('Step 2c: Trying sites search...');
    const searchRes = await graphGet(`/v1.0/sites?search=InstalledBase`);
    if (searchRes.status === 200) {
      console.log('  Sites search works! Found sites:');
      (searchRes.body.value || []).forEach(s => console.log('   -', s.displayName, '|', s.webUrl));
    } else {
      console.error('  Sites search failed (' + searchRes.status + '):', JSON.stringify(searchRes.body?.error, null, 2));
    }
    return;
  }

  const siteId = siteRes.body.id;
  console.log('  Site resolved. ID:', siteId);
  console.log('  Display name:', siteRes.body.displayName);
  console.log('');

  // Step 3: List all lists
  console.log('Step 3: Fetching lists on site...');
  const listsRes = await graphGet(`/v1.0/sites/${siteId}/lists`);
  if (listsRes.status !== 200) {
    console.error('  FAILED (' + listsRes.status + '):', JSON.stringify(listsRes.body?.error, null, 2));
    return;
  }
  console.log('  Lists found:', (listsRes.body.value || []).length);
  (listsRes.body.value || []).forEach(l => console.log('   -', l.displayName));
  console.log('');

  // Step 4: Find our target list
  const targetList = (listsRes.body.value || []).find(l =>
    l.displayName?.toLowerCase() === cfg.listName.toLowerCase()
  );
  if (!targetList) {
    console.warn('  Target list "' + cfg.listName + '" NOT FOUND in the site.');
    console.warn('  Available list names are shown above.');
    return;
  }
  console.log('  Target list "' + cfg.listName + '" found. ID:', targetList.id);
  console.log('');

  // Step 5: Fetch items
  console.log('Step 4: Fetching first 5 items from list...');
  const itemsRes = await graphGet(`/v1.0/sites/${siteId}/lists/${targetList.id}/items?$expand=fields&$top=5`);
  if (itemsRes.status !== 200) {
    console.error('  FAILED (' + itemsRes.status + '):', JSON.stringify(itemsRes.body?.error, null, 2));
    return;
  }
  const items = itemsRes.body.value || [];
  console.log('  Items returned:', items.length);
  if (items.length > 0) {
    console.log('  First item fields:', JSON.stringify(items[0].fields, null, 4));
  }
  console.log('');
  console.log('=== All steps passed! SharePoint connection is working. ===');
}

run().catch(e => console.error('Unhandled error:', e.message));
