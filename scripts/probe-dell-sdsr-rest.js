/**
 * Probe Dell Self-Dispatch REST endpoints from TechDirect docs (OAuth only).
 * Usage: node scripts/probe-dell-sdsr-rest.js [serviceTag]
 */
const { loadDellEnv } = require('../backend/utils/dell-env');
const { getDispatchToken } = require('../backend/services/dell-sdsr');

async function probe(label, url, token, opts = {}) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.headers || {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    console.log(
      `${res.status} ${Date.now() - started}ms ${label}\n  ${url}\n  ${text.replace(/\s+/g, ' ').slice(0, 220)}`
    );
  } catch (e) {
    console.log(`ERR ${label}: ${e.message}`);
  }
}

(async () => {
  const env = loadDellEnv(true);
  const tag = (process.argv[2] || 'GQHHF33').toUpperCase();
  const token = await getDispatchToken();
  console.log('OAuth ok, probing REST paths for tag', tag);

  const hosts = [
    'https://apigtwb2cnp.us.dell.com',
    'https://apigtwb2c.us.dell.com',
    'https://sandbox.api.dell.com',
    'https://api.dell.com',
  ];

  const paths = [
    `/Sandbox/support/sdsr/v1/parts?servicetag=${tag}`,
    `/Sandbox/support/sdsr/v1/parts/${tag}`,
    `/Sandbox/support/sdsr/v1/assets/${tag}/parts`,
    `/Sandbox/support/selfdispatch/v1/parts?servicetag=${tag}`,
    `/Sandbox/support/selfdispatch/v1/parts/servicetag/${tag}`,
    `/Sandbox/support/dispatch/v1/parts?servicetag=${tag}`,
    `/Sandbox/support/dispatch/v1/parts/${tag}`,
    `/Sandbox/support/sdsr/v1/company-info`,
    `/Sandbox/support/sdsr/v1/companyinfo`,
    `/Sandbox/support/sdsr/v1/relationships`,
    `/Sandbox/support/selfdispatch/v1/company-info`,
    `/Sandbox/support/selfdispatch/v1/dispatches`,
    `/Sandbox/support/sdsr/v1/dispatches`,
    `/Sandbox/support/sdsr/v2/parts?servicetag=${tag}`,
    `/PROD/support/sdsr/v1/parts?servicetag=${tag}`,
    `/PROD/support/selfdispatch/v1/parts?servicetag=${tag}`,
    `/support/sdsr/v1/parts?servicetag=${tag}`,
    `/support/selfdispatch/v1/parts?servicetag=${tag}`,
  ];

  for (const host of hosts) {
    for (const p of paths) {
      // skip nonsense combos
      if (host.includes('sandbox.api') && p.startsWith('/Sandbox')) continue;
      if (host.includes('api.dell.com') && !host.includes('apigtwb') && p.startsWith('/Sandbox')) continue;
      if (host.includes('apigtwb2c.us.dell.com') && p.startsWith('/Sandbox')) continue;
      await probe(`${host.replace('https://', '')}${p}`, `${host}${p}`, token);
    }
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
