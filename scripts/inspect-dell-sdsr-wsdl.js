/**
 * Pull SDSR WSDL and summarize CheckLogin message shape.
 * Usage: node scripts/inspect-dell-sdsr-wsdl.js
 */
const fs = require('fs');
const path = require('path');
const { loadDellEnv } = require('../backend/utils/dell-env');
const { getDispatchToken } = require('../backend/services/dell-sdsr');

(async () => {
  const env = loadDellEnv(true);
  const token = await getDispatchToken();
  const url = `${env.DELL_DISPATCH_API_URL}?wsdl`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'text/xml' },
  });
  const text = await res.text();
  const out = path.resolve(__dirname, '_dell-sdsr-wsdl.xml');
  fs.writeFileSync(out, text);
  console.log(`saved ${out} (${text.length} bytes, http=${res.status})`);

  const names = [...text.matchAll(/\bname="([A-Za-z0-9_]+)"/g)].map((m) => m[1]);
  const interesting = [...new Set(names)].filter((n) =>
    /Check|Login|Part|Dispatch|User|Auth|Password|Username/i.test(n)
  );
  console.log('interesting names:', interesting.join(', '));

  const ops = [...text.matchAll(/<wsdl:operation name="([^"]+)"/gi)].map((m) => m[1]);
  console.log('operations:', [...new Set(ops)].join(', '));

  for (const key of ['CheckLogin', 'CheckUser', 'GetPartsbyServiceTag', 'CreateDispatch']) {
    const re = new RegExp(`name="${key}"[\\s\\S]{0,1500}`, 'i');
    const m = text.match(re);
    console.log(`\n=== around ${key} ===`);
    console.log(m ? m[0].replace(/\s+/g, ' ').slice(0, 900) : '(not found)');
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
