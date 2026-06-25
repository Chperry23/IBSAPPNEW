/**
 * Bump per-customer registry_version when sys_* data changes (import or manual add).
 */
const { REGISTRY_TABLES } = require('../services/sync-tables');
const { ensureRowUuid, backfillTableUuids } = require('./ensure-row-uuid');
const { recordChangeForRow } = require('./change-journal');

async function bumpRegistryVersion(db, customerId) {
  if (customerId == null) return;
  await db
    .prepare(
      `UPDATE customers SET registry_version = COALESCE(registry_version, 0) + 1,
       synced = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    )
    .run([customerId]);

  const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get([customerId]);
  if (customer?.uuid) {
    await recordChangeForRow(db, 'customers', customer, 'upsert');
  }
}

/**
 * After registry import/update: assign UUIDs, mark unsynced, journal rows for sync API push.
 */
async function markCustomerRegistryForSync(db, customerId) {
  if (customerId == null) return { tables: 0, rows: 0 };

  let rowCount = 0;
  for (const table of REGISTRY_TABLES) {
    await backfillTableUuids(db, table);

    const activeRows = await db
      .prepare(
        `SELECT * FROM ${table} WHERE customer_id = ? AND COALESCE(deleted, 0) != 1`
      )
      .all([customerId]);

    for (const row of activeRows) {
      const uuid = await ensureRowUuid(db, table, row);
      row.uuid = uuid;
      await db
        .prepare(
          `UPDATE ${table} SET synced = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        )
        .run([row.id]);
      await recordChangeForRow(db, table, row, 'upsert');
      rowCount += 1;
    }

    const pendingDeletes = await db
      .prepare(
        `SELECT * FROM ${table} WHERE customer_id = ? AND deleted = 1 AND synced = 0`
      )
      .all([customerId]);

    for (const row of pendingDeletes) {
      if (!row.uuid) continue;
      await recordChangeForRow(db, table, row, 'delete');
      rowCount += 1;
    }
  }

  return { tables: REGISTRY_TABLES.length, rows: rowCount };
}

module.exports = { bumpRegistryVersion, markCustomerRegistryForSync };
