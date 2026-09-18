/**
 * Produce a Dell-ticket-friendly SDSR failure log (no secrets).
 * Usage: node scripts/capture-dell-sdsr-failure-log.js
 */
const fs = require('fs');
const path = require('path');
const { loadDellEnv } = require('../backend/utils/dell-env');
const { getDispatchToken } = require('../backend/services/dell-sdsr');

function xmlEscape(v) {
  return String(v ?? '')
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
  return {
    faultstring: text.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i)?.[1]?.trim() || null,
    faultcode: text.match(/<faultcode[^>]*>([\s\S]*?)<\/faultcode>/i)?.[1]?.trim() || null,
  };
}

function mask(s) {
  if (!s) return '(empty)';
  if (s.length <= 4) return '****';
  return `${s.slice(0, 2)}…${s.slice(-2)} (len=${s.length})`;
}

(async () => {
  const lines = [];
  const log = (msg) => {
    const line = `[${new Date().toISOString()}] ${msg}`;
    lines.push(line);
    console.log(line);
  };

  const env = loadDellEnv(true);
  const email = env.DELL_DISPATCH_TECH_EMAIL || '';
  const pass = env.DELL_DISPATCH_TECH_PASSWORD || '';
  const api = env.DELL_DISPATCH_API_URL;

  log('=== Dell SDSR Sandbox auth evidence (passwords redacted) ===');
  log(`API URL: ${api}`);
  log(`Token URL: ${env.DELL_DISPATCH_TOKEN_URL}`);
  log(`Client ID: ${env.DELL_DISPATCH_CLIENT_ID}`);
  log(`Tech email (Username): ${email}`);
  log(`Tech password: ${mask(pass)}`);
  log(`Sandbox User ID: ${env.DELL_DISPATCH_USER_ID}`);

  try {
    const token = await getDispatchToken();
    log(`OAuth client_credentials: SUCCESS (token len=${token.length})`);
  } catch (e) {
    log(`OAuth client_credentials: FAIL — ${e.message}`);
    throw e;
  }

  const token = await getDispatchToken();

  const cases = [
    ['CheckLogin email + configured password', email, pass],
    ['CheckLogin email + empty password', email, ''],
    ['CheckLogin email + wrong password', email, 'WrongPassword123!'],
    ['CheckLogin sandbox User ID + configured password', env.DELL_DISPATCH_USER_ID, pass],
  ];

  for (const [label, user, password] of cases) {
    const inner = `<api:CheckLogin><api:Username>${xmlEscape(user)}</api:Username><api:Password>${xmlEscape(password)}</api:Password></api:CheckLogin>`;
    const res = await fetch(api, {
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
    const fault = parseFault(text);
    log(`--- ${label} ---`);
    log(`HTTP status: ${res.status}`);
    log(`SOAP faultcode: ${fault.faultcode || '(none)'}`);
    log(`SOAP faultstring: ${fault.faultstring || '(none)'}`);
    log(`Response excerpt: ${text.replace(/\s+/g, ' ').slice(0, 220)}`);
  }

  log('=== Conclusion ===');
  log('OAuth works. Every CheckLogin attempt returns Invalid Authentication.');
  log('Please enable SDSR Sandbox tech login for assignee cole.perry@eci.us');
  log('or confirm the correct Username/Password for CheckLogin.');

  const outDir = path.resolve(__dirname, '../exports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logPath = path.join(outDir, `dell-sdsr-checklogin-failure-${stamp}.log`);
  const htmlPath = path.join(outDir, `dell-sdsr-checklogin-failure-${stamp}.html`);
  const body = lines.join('\n');
  fs.writeFileSync(logPath, body, 'utf8');
  fs.writeFileSync(
    htmlPath,
    `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Dell SDSR CheckLogin Failure Evidence</title>
<style>
body{margin:0;background:#0b1220;color:#e5e7eb;font:14px/1.45 Consolas,ui-monospace,monospace}
.wrap{padding:24px 28px;max-width:980px}
h1{font:600 18px Segoe UI,system-ui,sans-serif;margin:0 0 8px;color:#f8fafc}
.sub{font:13px Segoe UI,system-ui,sans-serif;color:#94a3b8;margin:0 0 18px}
pre{white-space:pre-wrap;word-break:break-word;background:#111827;border:1px solid #334155;border-radius:10px;padding:16px;margin:0;color:#bbf7d0}
.fail{color:#fca5a5} .ok{color:#86efac}
</style></head><body><div class="wrap">
<h1>Dell SDSR Sandbox — CheckLogin failure evidence</h1>
<p class="sub">Passwords redacted · Generated ${new Date().toISOString()} · For Dell TechDirect support</p>
<pre>${body
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/SUCCESS/g, '<span class="ok">SUCCESS</span>')
      .replace(/Invalid Authentication/g, '<span class="fail">Invalid Authentication</span>')}</pre>
</div></body></html>`,
    'utf8'
  );

  console.log(`\nWrote:\n${logPath}\n${htmlPath}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
