/**
 * Compare sandbox vs production SDSR CheckLogin (no secrets printed).
 * Usage: node scripts/diagnose-dell-sdsr-auth-prod.js
 */
const { loadDellEnv } = require('../backend/utils/dell-env');

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function envelope(inner) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:api="http://api.dell.com">
  <soapenv:Header/>
  <soapenv:Body>${inner}</soapenv:Body>
</soapenv:Envelope>`;
}

function parseFault(text) {
  const m = text.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i);
  return m ? m[1].trim() : null;
}

async function getToken(tokenUrl, clientId, clientSecret) {
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
  if (!json.access_token) throw new Error(`token failed ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return json.access_token;
}

async function checkLogin(apiUrl, token, user, pass) {
  const inner = `<api:CheckLogin><api:Username>${xmlEscape(user)}</api:Username><api:Password>${xmlEscape(pass)}</api:Password></api:CheckLogin>`;
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      SOAPAction: '"http://api.dell.com/IDispatchService/CheckLogin"',
      'Content-Type': 'text/xml; charset=utf-8',
      Accept: 'text/xml',
    },
    body: envelope(inner),
  });
  const text = await res.text();
  return {
    status: res.status,
    fault: parseFault(text),
    ok: res.ok && !parseFault(text) && /<FullName/i.test(text),
  };
}

(async () => {
  const env = loadDellEnv(true);
  const user = env.DELL_DISPATCH_TECH_EMAIL;
  const pass = env.DELL_DISPATCH_TECH_PASSWORD;
  console.log(
    JSON.stringify(
      {
        techEmail: user,
        passLen: (pass || '').length,
        sandboxApi: env.DELL_DISPATCH_API_URL,
      },
      null,
      2
    )
  );

  // 1) Current sandbox app + sandbox API
  const sandToken = await getToken(
    env.DELL_DISPATCH_TOKEN_URL,
    env.DELL_DISPATCH_CLIENT_ID,
    env.DELL_DISPATCH_CLIENT_SECRET
  );
  const sand = await checkLogin(env.DELL_DISPATCH_API_URL, sandToken, user, pass);
  console.log('sandbox CheckLogin:', sand);

  // 2) Same sandbox OAuth token against likely production dispatch paths
  const prodCandidates = [
    'https://apigtwb2c.us.dell.com/PROD/support/dispatch/v3/service',
    'https://apigtwb2c.us.dell.com/support/dispatch/v3/service',
    'https://apigtwb2cnp.us.dell.com/PROD/support/dispatch/v3/service',
  ];
  for (const url of prodCandidates) {
    try {
      const result = await checkLogin(url, sandToken, user, pass);
      console.log(`with sandbox token @ ${url}:`, result);
    } catch (e) {
      console.log(`with sandbox token @ ${url}: ERR ${e.message}`);
    }
  }

  // 3) If warranty/prod OAuth exists, try that token on prod dispatch
  if (env.DELL_WARRANTY_CLIENT_ID && env.DELL_WARRANTY_TOKEN_URL) {
    try {
      const prodToken = await getToken(
        env.DELL_WARRANTY_TOKEN_URL,
        env.DELL_WARRANTY_CLIENT_ID,
        env.DELL_WARRANTY_CLIENT_SECRET
      );
      console.log('warranty/prod oauth: ok');
      for (const url of prodCandidates) {
        try {
          const result = await checkLogin(url, prodToken, user, pass);
          console.log(`with warranty token @ ${url}:`, result);
        } catch (e) {
          console.log(`with warranty token @ ${url}: ERR ${e.message}`);
        }
      }
    } catch (e) {
      console.log('warranty/prod oauth failed:', e.message);
    }
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
