/**
 * Per-table unsynced breakdown (what would be included in push).
 * Usage: node scripts/audit-unsynced-by-table.js [path-to.db]
 */
const path = require('path');
const { SYNC_TABLES, PUSH_SKIP_TABLES, REGISTRY_TABLES } = require('../backend/services/sync-tables');

const dbPath = process.argv[2] || path.resolve(__dirname, '../data/cabinet_pm_tablet.db');
process.env.DB_PATH = dbPath;

const db = require('../backend/config/database');

async function count(sql, params = []) {
  const row = await db.prepare(sql).get(params);
  return row?.cnt ?? row?.total ?? 0;
}

(async () => {
  console.log('Database:', dbPath);
  console.log('');

  let grandTotal = 0;
  let pushEligible = 0;
  const rows = [];

  for (const table of SYNC_TABLES) {
    const total = await count(
      `SELECT COUNT(*) as cnt FROM ${table} WHERE COALESCE(deleted, 0) != 1`
    );
    const unsynced = await count(
      `SELECT COUNT(*) as cnt FROM ${table} WHERE synced = 0 AND COALESCE(deleted, 0) != 1`
    );
    const unsyncedNoUuid = await count(
      `SELECT COUNT(*) as cnt FROM ${table}
       WHERE synced = 0 AND COALESCE(deleted, 0) != 1
         AND (uuid IS NULL OR TRIM(uuid) = '')`
    );
    const pushReady = await count(
      `SELECT COUNT(*) as cnt FROM ${table}
       WHERE synced = 0 AND COALESCE(deleted, 0) != 1
         AND uuid IS NOT NULL AND TRIM(uuid) != ''`
    );
    const unsyncedDeleted = await count(
      `SELECT COUNT(*) as cnt FROM ${table} WHERE synced = 0 AND deleted = 1`
    );

    if (total > 0 || unsynced > 0) {
      rows.push({ table, total, unsynced, pushReady, unsyncedNoUuid, unsyncedDeleted });
      grandTotal += total;
      pushEligible += pushReady;
    }
  }

  rows.sort((a, b) => b.pushReady - a.pushReady);

  console.log('Table breakdown (sorted by push-ready unsynced):');
  console.log(
    '  ' +
      ['table', 'total', 'unsynced', 'push_ready', 'no_uuid', 'unsync_del']
        .map((h) => h.padEnd(14))
        .join('')
  );
  for (const r of rows) {
    if (r.unsynced === 0 && r.pushReady === 0) continue;
    console.log(
      '  ' +
        [
          r.table,
          r.total,
          r.unsynced,
          r.pushReady,
          r.unsyncedNoUuid,
          r.unsyncedDeleted,
        ]
          .map((v, i) => String(v).padEnd(14))
          .join('')
    );
  }

  console.log('');
  console.log(`Push-eligible rows (synced=0, has uuid): ${pushEligible.toLocaleString()}`);
  console.log(`Active rows across SYNC_TABLES: ${grandTotal.toLocaleString()}`);

  const journal = await count(
    `SELECT COUNT(*) as cnt FROM change_log WHERE synced_at IS NULL`
  );
  console.log(`Pending change_log entries: ${journal.toLocaleString()}`);

  // Registry customers with huge charm/io counts
  console.log('\n--- Top customers by unsynced registry rows ---');
  for (const table of REGISTRY_TABLES) {
    const top = await db.prepare(
      `SELECT customer_id, COUNT(*) as cnt
       FROM ${table}
       WHERE synced = 0 AND COALESCE(deleted, 0) != 1
         AND uuid IS NOT NULL AND TRIM(uuid) != ''
       GROUP BY customer_id
       ORDER BY cnt DESC
       LIMIT 5`
    ).all([]);
    if (top.length) {
      console.log(`\n${table}:`);
      for (const t of top) {
        const cust = await db.prepare('SELECT name, alias FROM customers WHERE id = ?').get([t.customer_id]);
        console.log(
          `  customer ${t.customer_id} (${cust?.name || cust?.alias || '?'}): ${t.cnt.toLocaleString()} unsynced`
        );
      }
    }
  }

  // Customers marked unsynced with registry_version
  const staleCustomers = await db.prepare(
    `SELECT id, name, alias, registry_version, synced FROM customers
     WHERE synced = 0 AND COALESCE(registry_version, 0) > 0
     ORDER BY registry_version DESC
     LIMIT 10`
  ).all([]);
  if (staleCustomers.length) {
    console.log('\n--- Customers with synced=0 and registry_version > 0 ---');
    for (const c of staleCustomers) {
      console.log(`  ${c.id} ${c.name || c.alias} registry_version=${c.registry_version}`);
    }
  }

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
