/**
 * Diagnose SDSR CheckLogin failures without printing secrets.
 * Usage: node scripts/diagnose-dell-sdsr-auth.js
 */
const { loadDellEnv } = require('../backend/utils/dell-env');
const { getDispatchToken } = require('../backend/services/dell-sdsr');

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

async function tryCheckLogin(url, token, user, pass, userTag, passTag) {
  const inner = `<api:CheckLogin><api:${userTag}>${xmlEscape(user)}</api:${userTag}><api:${passTag}>${xmlEscape(pass)}</api:${passTag}></api:CheckLogin>`;
  const res = await fetch(url, {
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
    hasFullName: /<FullName[^>]*>/i.test(text),
    snippet: text.replace(/\s+/g, ' ').slice(0, 240),
  };
}

(async () => {
  const env = loadDellEnv(true);
  const url = env.DELL_DISPATCH_API_URL;
  const email = env.DELL_DISPATCH_TECH_EMAIL || '';
  const userId = env.DELL_DISPATCH_USER_ID || '';
  const pass = env.DELL_DISPATCH_TECH_PASSWORD || '';

  let apiPath = 'bad-url';
  try {
    const u = new URL(url);
    apiPath = `${u.host}${u.pathname}`;
  } catch (_) {}

  console.log(
    JSON.stringify(
      {
        apiPath,
        sandbox: /sandbox/i.test(url || ''),
        emailLooksLikeEmail: email.includes('@'),
        userIdLooksLikeEmail: userId.includes('@'),
        emailEqUserId: email === userId,
        emailLen: email.length,
        userIdLen: userId.length,
        passLen: pass.length,
        passHasSpaces: /\s/.test(pass),
        passHasQuotes: /['"]/.test(pass),
      },
      null,
      2
    )
  );

  const token = await getDispatchToken();
  console.log('oauth: ok');

  const candidates = [];
  if (email) candidates.push(['TECH_EMAIL', email]);
  if (userId && userId !== email) candidates.push(['USER_ID', userId]);
  if (email.includes('@')) candidates.push(['email-local', email.split('@')[0]]);
  if (env.DELL_DISPATCH_OWNER && env.DELL_DISPATCH_OWNER !== email) {
    candidates.push(['OWNER', env.DELL_DISPATCH_OWNER]);
  }

  for (const [label, user] of candidates) {
    for (const [caseLabel, userTag, passTag] of [
      ['Pascal', 'Username', 'Password'],
      ['camel', 'username', 'password'],
    ]) {
      const result = await tryCheckLogin(url, token, user, pass, userTag, passTag);
      console.log(
        `${label}/${caseLabel}: status=${result.status} fault=${result.fault || 'none'} fullName=${result.hasFullName}`
      );
      if (result.hasFullName) console.log('  SUCCESS snippet:', result.snippet);
    }
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
