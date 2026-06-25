/**
 * Prune stale change_log rows (row already synced=1) and report push-ready counts.
 * Run on a tablet DB before upload if sync is slow or stuck:
 *   node scripts/prune-stale-change-log.js [path-to.db]
 */
const path = require('path');
const { pruneStaleChangeLog } = require('../backend/utils/change-journal');
const { SYNC_TABLES, PUSH_SKIP_TABLES } = require('../backend/services/sync-tables');

const dbPath = process.argv[2] || path.resolve(__dirname, '../data/cabinet_pm_tablet.db');
process.env.DB_PATH = dbPath;
const db = require('../backend/config/database');

(async () => {
  const pendingBefore = await db
    .prepare(`SELECT COUNT(*) as c FROM change_log WHERE synced_at IS NULL`)
    .get([]);
  console.log('Database:', dbPath);
  console.log('Pending change_log before:', pendingBefore.c);

  const pruned = await pruneStaleChangeLog(db);
  console.log('Pruned stale entries:', pruned);

  const pendingAfter = await db
    .prepare(`SELECT COUNT(*) as c FROM change_log WHERE synced_at IS NULL`)
    .get([]);
  console.log('Pending change_log after:', pendingAfter.c);

  let pushReady = 0;
  for (const table of SYNC_TABLES) {
    if (PUSH_SKIP_TABLES.includes(table)) continue;
    const row = await db
      .prepare(
        `SELECT COUNT(*) as c FROM ${table}
         WHERE synced = 0 AND uuid IS NOT NULL AND TRIM(uuid) != ''`
      )
      .get([]);
    if (row.c > 0) console.log(`  push-ready ${table}: ${row.c}`);
    pushReady += row.c;
  }
  console.log('Total push-ready rows:', pushReady);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
