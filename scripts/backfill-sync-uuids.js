/**
 * One-time tablet repair: assign missing uuids on all synced tables.
 * Run manually after upgrade if Sync shows stuck unsynced counts:
 *   node scripts/backfill-sync-uuids.js
 *
 * Does NOT run on app startup.
 */
const db = require('../backend/config/database');
const { backfillMissingUuidsForSyncTables } = require('../backend/utils/ensure-row-uuid');

(async () => {
  console.log('Backfilling missing sync uuids across SYNC_TABLES (except users)...');
  const counts = await backfillMissingUuidsForSyncTables(db);

  let total = 0;
  for (const [table, n] of Object.entries(counts)) {
    if (n > 0) {
      console.log(`  ${table}: ${n} row(s) updated`);
      total += n;
    }
  }

  if (total === 0) {
    console.log('No rows needed uuid backfill.');
  } else {
    console.log(`Done — ${total} row(s) marked synced=0 with new uuid. Upload from Sync page.`);
  }

  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
