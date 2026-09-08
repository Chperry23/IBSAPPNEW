/**
 * Read-only probe of Dell SDSR (self-dispatch) sandbox.
 * Gets an OAuth token, then GETs likely catalog/status URLs.
 * Does not create or cancel a dispatch.
 */
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

async function getToken(env) {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.DELL_DISPATCH_CLIENT_ID,
    client_secret: env.DELL_DISPATCH_CLIENT_SECRET,
  });
  const res = await fetch(env.DELL_DISPATCH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (json.access_token) return { via: 'form', json };
  const basic = Buffer.from(
    `${env.DELL_DISPATCH_CLIENT_ID}:${env.DELL_DISPATCH_CLIENT_SECRET}`
  ).toString('base64');
  const retry = await fetch(env.DELL_DISPATCH_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  });
  const retryJson = await retry.json().catch(() => ({}));
  return { via: 'basic', status: retry.status, firstStatus: res.status, first: json, json: retryJson };
}

async function probe(url, token, extraHeaders = {}) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...extraHeaders,
      },
    });
    const text = await res.text();
    return {
      status: res.status,
      ms: Date.now() - started,
      contentType: res.headers.get('content-type'),
      body: text.slice(0, 500),
    };
  } catch (err) {
    return { status: 'ERR', ms: Date.now() - started, body: err.message };
  }
}

(async () => {
  const env = loadEnvFile(path.resolve(__dirname, '../DELL.env'));
  console.log('token_url', env.DELL_DISPATCH_TOKEN_URL);
  console.log('client_id', env.DELL_DISPATCH_CLIENT_ID);
  console.log('user_id', env.DELL_DISPATCH_USER_ID);

  const tokenResult = await getToken(env);
  const token = tokenResult.json?.access_token;
  console.log('\n=== OAuth ===');
  console.log({
    via: tokenResult.via,
    token_type: tokenResult.json?.token_type,
    expires_in: tokenResult.json?.expires_in,
    scope: tokenResult.json?.scope,
    access_token_len: token ? String(token).length : 0,
    error: tokenResult.json?.error || tokenResult.first?.error,
  });
  if (!token) {
    console.log(JSON.stringify(tokenResult, null, 2));
    process.exit(1);
  }

  const tag = '2J12XP3';
  const hosts = [
    'https://apigtwb2cnp.us.dell.com',
    'https://apigtwb2c.us.dell.com',
  ];
  const paths = [
    `/Sandbox/support/sdsr/v2/dispatches`,
    `/Sandbox/support/sdsr/v3/dispatches`,
    `/Sandbox/support/selfdispatch/v1/dispatches`,
    `/Sandbox/support/partreplace/v1/dispatches`,
    `/Sandbox/support/parts/v1/dispatch`,
    `/Sandbox/support/dispatch/v3?wsdl`,
    `/Sandbox/support/sdsr?wsdl`,
    `/Sandbox/support/sdsr/v3?wsdl`,
    `/PROD/support/sdsr/v2/dispatches`,
    `/PROD/support/sdsr/v3/dispatches`,
    `/PROD/support/selfdispatch/v1/dispatches`,
    `/PROD/support/partreplace/v1/dispatches`,
    `/PROD/support/dispatch/v3?wsdl`,
    `/PROD/support/sdsr/v3?wsdl`,
    `/Sandbox/support/case/v3/WebCase?wsdl`,
    `/apis/sdsr/v1/dispatches`,
  ];

  console.log('\n=== GET probes ===');
  for (const host of hosts) {
    for (const p of paths) {
      if (host.includes('apigtwb2c.us.dell.com') && p.startsWith('/Sandbox')) continue;
      const result = await probe(`${host}${p}`, token);
      if (result.status === 404 && result.body.includes('<HTML>')) continue;
      console.log(result.status, result.ms + 'ms', host.replace('https://', '') + p);
      if (result.status !== 404) console.log(' ', result.body.replace(/\s+/g, ' ').slice(0, 280));
    }
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
