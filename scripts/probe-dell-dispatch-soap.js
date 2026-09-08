/**
 * Read-only SDSR SOAP probes. Does not CreateDispatch / ResubmitDispatch.
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

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function envelope(inner) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:api="http://api.dell.com">
  <soapenv:Header/>
  <soapenv:Body>
    ${inner}
  </soapenv:Body>
</soapenv:Envelope>`;
}

async function soap(url, token, action, inner) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      SOAPAction: `"${action}"`,
      'Content-Type': 'text/xml; charset=utf-8',
      Accept: 'text/xml',
    },
    body: envelope(inner),
  });
  const text = await res.text();
  return { status: res.status, body: text.slice(0, 2000) };
}

(async () => {
  const env = loadEnvFile(path.resolve(__dirname, '../DELL.env'));
  const tokenRes = await fetch(env.DELL_DISPATCH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.DELL_DISPATCH_CLIENT_ID,
      client_secret: env.DELL_DISPATCH_CLIENT_SECRET,
    }),
  });
  const tokenJson = await tokenRes.json();
  const token = tokenJson.access_token;
  if (!token) throw new Error('no dispatch token: ' + JSON.stringify(tokenJson));

  const url = env.DELL_DISPATCH_API_URL;
  const user = xmlEscape(env.DELL_DISPATCH_TECH_EMAIL);
  const pass = xmlEscape(env.DELL_DISPATCH_TECH_PASSWORD);
  const tag = '2J12XP3';

  const variants = [
    ['CheckLogin camel', 'http://api.dell.com/IDispatchService/CheckLogin',
      `<api:CheckLogin><api:username>${user}</api:username><api:password>${pass}</api:password></api:CheckLogin>`],
    ['CheckLogin Pascal', 'http://api.dell.com/IDispatchService/CheckLogin',
      `<api:CheckLogin><api:Username>${user}</api:Username><api:Password>${pass}</api:Password></api:CheckLogin>`],
    ['CheckUser Pascal', 'http://api.dell.com/IDispatchService/CheckUser',
      `<api:CheckUser><api:Username>${user}</api:Username><api:Password>${pass}</api:Password></api:CheckUser>`],
    ['GetParts Pascal', 'http://api.dell.com/IDispatchService/GetPartsbyServiceTag',
      `<api:GetPartsbyServiceTag><api:Username>${user}</api:Username><api:Password>${pass}</api:Password><api:ServiceTag>${tag}</api:ServiceTag></api:GetPartsbyServiceTag>`],
  ];

  for (const [label, action, inner] of variants) {
    const result = await soap(url, token, action, inner);
    console.log('\n===', label, result.status, '===');
    console.log(result.body.replace(/\s+/g, ' ').slice(0, 800));
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
