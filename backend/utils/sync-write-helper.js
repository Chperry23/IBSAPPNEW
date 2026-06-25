/**
 * Sync metadata for local INSERT/UPDATE paths.
 *
 * Usage after INSERT:
 *   const fields = syncFieldsForInsert('cabinets', { id: cabinetId });
 *   await db.prepare('INSERT INTO cabinets (..., uuid, synced) VALUES (..., ?, 0)').run([..., fields.uuid]);
 *   await afterSyncableWrite(db, 'cabinets', cabinetId);
 *
 * afterSyncableWrite reloads the row and journals to change_log when uuid is set
 * (SQLite UPDATE triggers also journal when synced=0 or deleted=1).
 */
const { generateUUID } = require('./uuid-helper');
const { recordChangeForRow } = require('./change-journal');
const { STRING_ID_TABLES } = require('../services/sync-tables');

/**
 * Default uuid/synced/deleted for a new row in a synced table.
 * String-id tables (cabinets, etc.): uuid = id when id provided.
 * Sessions: pass separate sessionUuid — do not use id as uuid.
 */
function syncFieldsForInsert(tableName, { id, uuid: explicitUuid } = {}) {
  if (explicitUuid) {
    return { uuid: explicitUuid, synced: 0, deleted: 0 };
  }
  if (STRING_ID_TABLES.has(tableName) && id != null && String(id).trim() !== '') {
    return { uuid: String(id).trim(), synced: 0, deleted: 0 };
  }
  return { uuid: generateUUID(), synced: 0, deleted: 0 };
}

async function afterSyncableWrite(db, tableName, rowOrId, operation = 'upsert') {
  let row = rowOrId;
  if (rowOrId != null && (typeof rowOrId === 'number' || typeof rowOrId === 'string')) {
    row = await db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get([rowOrId]);
  }
  if (row?.uuid) {
    await recordChangeForRow(db, tableName, row, operation);
  }
}

/**
 * Soft-delete a row and journal for cloud push. Ensures uuid exists first.
 */
async function softDeleteSyncRow(db, tableName, id) {
  const row = await db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get([id]);
  if (!row) return false;

  let uuid = row.uuid;
  if (!uuid || String(uuid).trim() === '') {
    if (STRING_ID_TABLES.has(tableName) && row.id != null) {
      uuid = String(row.id).trim();
    } else {
      uuid = generateUUID();
    }
    await db.prepare(`UPDATE ${tableName} SET uuid = ? WHERE id = ?`).run([uuid, id]);
  }

  await db.prepare(
    `UPDATE ${tableName} SET deleted = 1, synced = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run([id]);

  const updated = await db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get([id]);
  if (updated?.uuid) {
    await recordChangeForRow(db, tableName, updated, 'delete');
  }
  return true;
}

module.exports = {
  syncFieldsForInsert,
  afterSyncableWrite,
  softDeleteSyncRow,
};
