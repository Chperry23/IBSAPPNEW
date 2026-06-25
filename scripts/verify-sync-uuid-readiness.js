/**
 * Assert no unsynced rows are missing uuid (upload would skip them).
 * Exit 0 = OK, 1 = rows need repair (run scripts/backfill-sync-uuids.js).
 */
const db = require('../backend/config/database');
const { SYNC_TABLES, PUSH_SKIP_TABLES } = require('../backend/services/sync-tables');

const CRITICAL_TABLES = [
  'customers',
  'sessions',
  'cabinets',
  'nodes',
  'customer_metric_history',
  'sys_workstations',
  'sys_smart_switches',
  'sys_io_devices',
  'sys_controllers',
  'sys_charms_io_cards',
  'sys_charms',
  'sys_ams_systems',
];

(async () => {
  let failed = false;

  for (const table of CRITICAL_TABLES) {
    if (!SYNC_TABLES.includes(table) || PUSH_SKIP_TABLES.includes(table)) continue;

    const row = await db.prepare(
      `SELECT COUNT(*) as cnt FROM ${table}
       WHERE synced = 0
         AND (uuid IS NULL OR TRIM(uuid) = '')
         AND COALESCE(deleted, 0) != 1`
    ).get([]);

    const cnt = row?.cnt ?? 0;
    if (cnt > 0) {
      console.error(`FAIL ${table}: ${cnt} unsynced row(s) missing uuid`);
      failed = true;
    } else {
      console.log(`OK   ${table}`);
    }
  }

  if (failed) {
    console.error('\nRepair: node scripts/backfill-sync-uuids.js then Upload again.');
    process.exit(1);
  }

  console.log('\nAll critical tables pass uuid readiness check.');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
