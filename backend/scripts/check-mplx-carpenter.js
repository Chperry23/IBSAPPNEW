/**
 * Quick check: MPLX Carpenter customer registry + session data
 * node backend/scripts/check-mplx-carpenter.js
 */
const db = require('../config/database');

async function run() {
  const sessionsByName = await db.prepare(`
    SELECT s.id as session_id, s.session_name, s.customer_id, s.synced, c.name, c.dongle_id
    FROM sessions s
    LEFT JOIN customers c ON s.customer_id = c.id
    WHERE s.session_name LIKE '%MPLX Carpenter%'
  `).all();
  console.log('Sessions named MPLX Carpenter:', sessionsByName);

  const customers = await db.prepare(`
    SELECT id, name, dongle_id FROM customers
    WHERE dongle_id = '0001-0004-1582' OR name LIKE '%Carpenter%' OR name = '0001-0004-1582'
  `).all();

  console.log('Customers matching Carpenter:', customers);

  for (const c of customers) {
    const sessions = await db.prepare(`
      SELECT id, session_name, status, synced FROM sessions
      WHERE customer_id = ? AND session_name LIKE '%Carpenter%'
    `).all([c.id]);

    const sysCounts = {};
    for (const t of ['sys_workstations', 'sys_controllers', 'sys_smart_switches', 'sys_io_devices', 'sys_charms_io_cards']) {
      const row = await db.prepare(`SELECT COUNT(*) as c FROM ${t} WHERE customer_id = ?`).get([c.id]);
      sysCounts[t] = row?.c ?? 0;
    }
    const diagSess = sessions.find((s) => s.session_name && s.session_name.includes('Carpenter'));
    if (diagSess) {
      const diagRows = await db.prepare(
        'SELECT id, session_id, controller_name, card_number, error_type, deleted FROM session_diagnostics WHERE session_id = ?'
      ).all([diagSess.id]);
      console.log(`    diagnostics rows for ${diagSess.id}:`, diagRows.length, diagRows);
    }

    console.log('\n---', c.name, `(customer_id=${c.id}, dongle=${c.dongle_id}) ---`);
    console.log('System registry:', sysCounts);
    console.log('Legacy nodes table:', (await db.prepare('SELECT COUNT(*) as c FROM nodes WHERE customer_id = ?').get([c.id]))?.c);

    for (const s of sessions) {
      const diag = await db.prepare(`
        SELECT COUNT(*) as c FROM session_diagnostics
        WHERE session_id = ? AND COALESCE(deleted, 0) != 1
      `).get([s.id]);
      const maint = await db.prepare(`
        SELECT COUNT(*) as c FROM session_node_maintenance WHERE session_id = ?
      `).get([s.id]);
      console.log(`  Session: ${s.session_name}`);
      console.log(`    id=${s.id} status=${s.status} synced=${s.synced}`);
      console.log(`    diagnostics=${diag?.c} node_maintenance=${maint?.c}`);
    }
  }
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
