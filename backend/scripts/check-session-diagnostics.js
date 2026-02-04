/**
 * Check what diagnostics and node-maintenance data exists in the DB per session.
 * Run from project root: node backend/scripts/check-session-diagnostics.js
 * Optional: set DB_PATH to your .db file (e.g. tablet data/cabinet_pm_tablet.db)
 */
const path = require('path');

// Use same DB path logic as app (tablet vs dev)
if (!process.env.DB_PATH) {
  const appRoot = path.resolve(__dirname, '../..');
  process.env.DB_PATH = path.join(appRoot, 'data', 'cabinet_pm_tablet.db');
}

const db = require('../config/database');

async function run() {
  console.log('DB path:', process.env.DB_PATH);
  console.log('');

  try {
    // 1) Total counts in session_diagnostics (all sessions)
    const diagTotal = await db.prepare(`
      SELECT COUNT(*) as count FROM session_diagnostics WHERE (deleted IS NULL OR deleted = 0)
    `).get();
    console.log('session_diagnostics total rows (not deleted):', diagTotal?.count ?? 0);

    const diagTotalAny = await db.prepare(`SELECT COUNT(*) as count FROM session_diagnostics`).get();
    console.log('session_diagnostics total rows (including deleted):', diagTotalAny?.count ?? 0);
    console.log('');

    // 2) Per-session: diagnostics count and node-maintenance count, with customer name
    const sessions = await db.prepare(`
      SELECT s.id, s.session_name, s.status, s.customer_id, c.name as customer_name
      FROM sessions s
      LEFT JOIN customers c ON s.customer_id = c.id
      ORDER BY c.name, s.session_name
    `).all();

    console.log('--- Per-session: diagnostics count | node-maintenance entries ---');
    for (const s of sessions) {
      const diagCount = await db.prepare(`
        SELECT COUNT(*) as count FROM session_diagnostics
        WHERE session_id = ? AND (deleted IS NULL OR deleted = 0)
      `).get([s.id]);
      const maintRows = await db.prepare(`
        SELECT COUNT(*) as count FROM session_node_maintenance WHERE session_id = ?
      `).get([s.id]);
      const customerLabel = (s.customer_name || 'no customer').trim();
      const name = (s.session_name || s.id).substring(0, 40);
      console.log(
        `  ${customerLabel} | ${name} | session_id=${s.id.substring(0, 8)}... | diagnostics=${diagCount?.count ?? 0} | node_maintenance=${maintRows?.count ?? 0}`
      );
    }
    console.log('');

    // 3) Sessions that have at least one diagnostic row (for Parker Lord / any)
    const sessionsWithDiag = await db.prepare(`
      SELECT session_id, COUNT(*) as count
      FROM session_diagnostics
      WHERE (deleted IS NULL OR deleted = 0)
      GROUP BY session_id
    `).all();
    console.log('Sessions that have diagnostics rows:', sessionsWithDiag.length);
    if (sessionsWithDiag.length > 0) {
      for (const row of sessionsWithDiag) {
        const sess = await db.prepare(`
          SELECT s.session_name, c.name as customer_name
          FROM sessions s
          LEFT JOIN customers c ON s.customer_id = c.id
          WHERE s.id = ?
        `).get([row.session_id]);
        console.log(`  session_id=${row.session_id} count=${row.count} | ${sess?.customer_name || '?'} | ${sess?.session_name || '?'}`);
      }
    }
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
  process.exit(0);
}

run();
