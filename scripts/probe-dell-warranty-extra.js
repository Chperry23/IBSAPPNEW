const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  const env = {};
  for (const raw of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return env;
}

(async () => {
  const env = loadEnvFile(path.resolve(__dirname, '../DELL.env'));
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.DELL_WARRANTY_CLIENT_ID,
    client_secret: env.DELL_WARRANTY_CLIENT_SECRET,
  });
  const tokenRes = await fetch(env.DELL_WARRANTY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  const tokenJson = await tokenRes.json();
  const token = tokenJson.access_token;
  const base = env.DELL_WARRANTY_API_BASE.replace(/\/$/, '');
  const tag = '13GB0R3';
  const urls = [
    `${base}/asset-entitlement-components?servicetags=${tag}`,
    `${base}/asset-entitlement-components?servicetag=${tag}`,
    `${base}/asset-components?servicetags=${tag}`,
    `${base}/asset-components?servicetag=${tag}`,
    `${base}/asset-entitlements?servicetags=${tag}&idtype=servicetag`,
  ];
  for (const url of urls) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const text = await res.text();
    console.log('\n', res.status, url.replace(base, ''));
    console.log(text.slice(0, 800));
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
