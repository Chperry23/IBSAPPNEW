/**
 * Deep SDSR auth matrix — prints status/fault only, never passwords.
 * Usage: node scripts/diagnose-dell-sdsr-deep.js
 */
const { loadDellEnv } = require('../backend/utils/dell-env');

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function envelope(inner, ns = 'http://api.dell.com') {
  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:api="${ns}">
  <soapenv:Header/>
  <soapenv:Body>${inner}</soapenv:Body>
</soapenv:Envelope>`;
}

function parseFault(text) {
  const faultstring = text.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i)?.[1]?.trim() || null;
  const faultcode = text.match(/<faultcode[^>]*>([\s\S]*?)<\/faultcode>/i)?.[1]?.trim() || null;
  const detail = text.match(/<detail[^>]*>([\s\S]*?)<\/detail>/i)?.[1]?.replace(/\s+/g, ' ').trim().slice(0, 200) || null;
  return { faultstring, faultcode, detail };
}

async function getToken(env) {
  const res = await fetch(env.DELL_DISPATCH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.DELL_DISPATCH_CLIENT_ID,
      client_secret: env.DELL_DISPATCH_CLIENT_SECRET,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.access_token) throw new Error(`OAuth failed ${res.status}`);
  return { token: json.access_token, scope: json.scope || null, tokenType: json.token_type || null };
}

async function soap(url, token, { action, body, extraHeaders = {} }) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'text/xml; charset=utf-8',
      Accept: 'text/xml',
      ...(action != null ? { SOAPAction: action } : {}),
      ...extraHeaders,
    },
    body,
  });
  const text = await res.text();
  const fault = parseFault(text);
  return {
    http: res.status,
    ok: res.ok && !fault.faultstring && /<FullName|<PartInformation|<Result/i.test(text),
    hasFullName: /<FullName/i.test(text),
    hasParts: /<PartInformation/i.test(text),
    ...fault,
    bodyKind: /soap|fault|Envelope/i.test(text)
      ? 'soap'
      : /json|\{/i.test(text.slice(0, 40))
        ? 'json'
        : /html/i.test(text.slice(0, 40))
          ? 'html'
          : 'other',
    snippet: text.replace(/\s+/g, ' ').slice(0, 180),
  };
}

function row(label, r) {
  const bits = [
    `http=${r.http}`,
    r.faultstring ? `fault=${r.faultstring}` : 'fault=none',
    r.faultcode ? `code=${r.faultcode}` : null,
    r.ok ? 'OK' : null,
    r.hasFullName ? 'FullName' : null,
    r.hasParts ? 'Parts' : null,
    `kind=${r.bodyKind}`,
  ].filter(Boolean);
  console.log(`- ${label}: ${bits.join(' | ')}`);
  if (r.detail) console.log(`    detail: ${r.detail}`);
}

(async () => {
  const env = loadDellEnv(true);
  const url = env.DELL_DISPATCH_API_URL;
  const email = env.DELL_DISPATCH_TECH_EMAIL || '';
  const userId = env.DELL_DISPATCH_USER_ID || '';
  const owner = env.DELL_DISPATCH_OWNER || '';
  const pass = env.DELL_DISPATCH_TECH_PASSWORD || '';
  const tag = 'GQHHF33';

  console.log('=== Config (no secrets) ===');
  console.log(
    JSON.stringify(
      {
        api: url,
        email,
        userIdLen: userId.length,
        ownerIsEmail: owner.includes('@'),
        passLen: pass.length,
        passHasQuestionMark: pass.includes('?'),
      },
      null,
      2
    )
  );

  const { token, scope, tokenType } = await getToken(env);
  console.log(`=== OAuth ok type=${tokenType} scope=${scope || '(none)'} ===`);

  // WSDL / metadata GETs
  console.log('\n=== Metadata GETs ===');
  for (const path of [
    url,
    `${url}?wsdl`,
    url.replace(/\/service$/, '?wsdl'),
    'https://apigtwb2cnp.us.dell.com/Sandbox/support/dispatch/v3?wsdl',
    'https://apigtwb2cnp.us.dell.com/Sandbox/support/dispatch/v3/service?wsdl',
  ]) {
    try {
      const res = await fetch(path, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/xml,application/xml,*/*' },
      });
      const text = await res.text();
      console.log(
        `- GET ${path.replace('https://', '')}: http=${res.status} len=${text.length} hasWsdl=${/<wsdl:|definitions/i.test(text)} snippet=${text.replace(/\s+/g, ' ').slice(0, 100)}`
      );
    } catch (e) {
      console.log(`- GET ${path}: ERR ${e.message}`);
    }
  }

  const users = [
    ['email', email],
    ['userId', userId],
    ['owner', owner],
    ['email+upper', email.toUpperCase()],
  ].filter(([, u]) => u);

  const passwords = [
    ['envPass', pass],
    ['emptyPass', ''],
    ['wrongPass', 'DefinitelyWrongPassword123!'],
  ];

  console.log('\n=== CheckLogin username × password × SOAPAction ===');
  for (const [uLabel, user] of users) {
    for (const [pLabel, password] of passwords) {
      // skip wrong/empty for owner/userId to limit calls — still test envPass for all
      if (pLabel !== 'envPass' && uLabel !== 'email') continue;

      const inner = `<api:CheckLogin><api:Username>${xmlEscape(user)}</api:Username><api:Password>${xmlEscape(password)}</api:Password></api:CheckLogin>`;
      const body = envelope(inner);

      for (const [aLabel, action] of [
        ['quoted', '"http://api.dell.com/IDispatchService/CheckLogin"'],
        ['bare', 'http://api.dell.com/IDispatchService/CheckLogin'],
        ['none', null],
      ]) {
        if (aLabel !== 'quoted' && !(uLabel === 'email' && pLabel === 'envPass')) continue;
        const r = await soap(url, token, { action, body });
        row(`${uLabel}/${pLabel}/${aLabel}`, r);
      }
    }
  }

  console.log('\n=== Alternate envelopes / ops ===');
  const altBodies = [
    [
      'no-ns-prefix',
      `<?xml version="1.0" encoding="utf-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Header/><soapenv:Body><CheckLogin xmlns="http://api.dell.com"><Username>${xmlEscape(email)}</Username><Password>${xmlEscape(pass)}</Password></CheckLogin></soapenv:Body></soapenv:Envelope>`,
    ],
    [
      'tempuri',
      envelope(
        `<api:CheckLogin><api:Username>${xmlEscape(email)}</api:Username><api:Password>${xmlEscape(pass)}</api:Password></api:CheckLogin>`,
        'http://tempuri.org/'
      ),
    ],
    [
      'cdata-pass',
      envelope(
        `<api:CheckLogin><api:Username>${xmlEscape(email)}</api:Username><api:Password><![CDATA[${pass}]]></api:Password></api:CheckLogin>`
      ),
    ],
    [
      'CheckUser',
      envelope(
        `<api:CheckUser><api:Username>${xmlEscape(email)}</api:Username><api:Password>${xmlEscape(pass)}</api:Password></api:CheckUser>`
      ),
    ],
    [
      'GetParts',
      envelope(
        `<api:GetPartsbyServiceTag><api:Username>${xmlEscape(email)}</api:Username><api:Password>${xmlEscape(pass)}</api:Password><api:ServiceTag>${tag}</api:ServiceTag></api:GetPartsbyServiceTag>`
      ),
    ],
    [
      'GetParts-userId',
      envelope(
        `<api:GetPartsbyServiceTag><api:Username>${xmlEscape(userId)}</api:Username><api:Password>${xmlEscape(pass)}</api:Password><api:ServiceTag>${tag}</api:ServiceTag></api:GetPartsbyServiceTag>`
      ),
    ],
  ];

  for (const [label, body] of altBodies) {
    const action =
      label.startsWith('GetParts')
        ? '"http://api.dell.com/IDispatchService/GetPartsbyServiceTag"'
        : label === 'CheckUser'
          ? '"http://api.dell.com/IDispatchService/CheckUser"'
          : '"http://api.dell.com/IDispatchService/CheckLogin"';
    const r = await soap(url, token, { action, body });
    row(label, r);
  }

  console.log('\n=== Auth header variants (email/envPass) ===');
  const basic = Buffer.from(`${email}:${pass}`).toString('base64');
  const innerStd = `<api:CheckLogin><api:Username>${xmlEscape(email)}</api:Username><api:Password>${xmlEscape(pass)}</api:Password></api:CheckLogin>`;
  const bodyStd = envelope(innerStd);
  row(
    'Bearer+Basic',
    await soap(url, token, {
      action: '"http://api.dell.com/IDispatchService/CheckLogin"',
      body: bodyStd,
      extraHeaders: { Authorization: `Bearer ${token}, Basic ${basic}` },
    })
  );
  // overwrite Authorization entirely with Basic only (likely fail gateway)
  {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        SOAPAction: '"http://api.dell.com/IDispatchService/CheckLogin"',
        'Content-Type': 'text/xml; charset=utf-8',
      },
      body: bodyStd,
    });
    const text = await res.text();
    const fault = parseFault(text);
    row('Basic-only', {
      http: res.status,
      ok: false,
      hasFullName: /<FullName/i.test(text),
      hasParts: false,
      ...fault,
      bodyKind: /Envelope|fault/i.test(text) ? 'soap' : 'other',
    });
  }

  console.log('\n=== Done ===');
  console.log(
    'If every CheckLogin returns the same "Invalid Authentication" for envPass, emptyPass, and wrongPass, Dell is rejecting the tech identity (not a local encoding bug).'
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
