process.env.DB_PATH = process.argv[2] || require('path').resolve(__dirname, '../data/cabinet_pm_tablet.db');
const db = require('../backend/config/database');
const { buildChangesetFromJournal } = require('../backend/utils/change-journal');
const { SYNC_TABLES, PUSH_SKIP_TABLES } = require('../backend/services/sync-tables');

setTimeout(async () => {
  const t0 = Date.now();
  const j = await buildChangesetFromJournal(db);
  const journalMs = Date.now() - t0;
  const journalRows = Object.values(j.tables).reduce((n, r) => n + r.length, 0);

  const t1 = Date.now();
  let pushRows = 0;
  for (const tableName of SYNC_TABLES) {
    if (PUSH_SKIP_TABLES.includes(tableName)) continue;
    const rows = await db
      .prepare(
        `SELECT COUNT(*) as c FROM ${tableName}
         WHERE synced = 0 AND uuid IS NOT NULL AND TRIM(uuid) != ''`
      )
      .get([]);
    pushRows += rows.c;
  }
  const scanMs = Date.now() - t1;

  console.log({ journalMs, journalIds: j.journalIds.length, journalUniqueRows: journalRows, pushRows, scanMs });
  process.exit(0);
}, 2000);
