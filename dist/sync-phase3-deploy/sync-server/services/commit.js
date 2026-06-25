const crypto = require('crypto');
const mongoose = require('mongoose');
const { MODEL_MAP, STRING_ID_TABLES } = require('../../backend/services/sync-tables');
const { SyncStaging, SyncSession, SyncChange } = require('../models/sync-meta');
const { getServerVersion, allocateVersions } = require('./version-counter');

function rowChecksum(row) {
  return crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex').slice(0, 16);
}

function stripMongoFields(row) {
  const copy = { ...row };
  delete copy.__v;
  return copy;
}

function toMongoDoc(tableName, row) {
  const doc = stripMongoFields(row);
  const uuid = doc.uuid;
  delete doc.id;
  if (STRING_ID_TABLES.has(tableName)) {
    doc._id = doc._id || row.id;
  } else if (doc._id == null && row.id != null) {
    doc._id = typeof row.id === 'number' ? row.id : parseInt(row.id, 10);
  }
  if (doc.created_at && typeof doc.created_at === 'string') {
    doc.created_at = new Date(doc.created_at);
  }
  if (doc.updated_at && typeof doc.updated_at === 'string') {
    doc.updated_at = new Date(doc.updated_at);
  }
  doc.uuid = uuid;
  return doc;
}

async function upsertByUuid(tableName, row, session) {
  const Model = MODEL_MAP[tableName];
  if (!Model) throw new Error(`Unknown table: ${tableName}`);

  const uuid = row.uuid;
  if (!uuid) throw new Error(`${tableName}: row missing uuid`);

  const existingId = await Model.findOne({ uuid }).select('_id').session(session).lean();
  const doc = toMongoDoc(tableName, row);

  if (existingId) {
    doc._id = existingId._id;
    await Model.replaceOne({ _id: existingId._id }, doc, { session });
    return { operation: row.deleted ? 'delete' : 'upsert', _id: existingId._id };
  }

  if (row.deleted === 1 || row.deleted === true) {
    return { operation: 'delete', _id: null };
  }

  if (tableName === 'session_node_maintenance' && row.session_id != null && row.node_id != null) {
    const byBiz = await Model.findOne({ session_id: row.session_id, node_id: row.node_id })
      .select('_id uuid')
      .session(session)
      .lean();
    if (byBiz) {
      doc._id = byBiz._id;
      await Model.replaceOne({ _id: byBiz._id }, doc, { session });
      return { operation: 'upsert', _id: byBiz._id };
    }
  }

  if (tableName === 'session_diagnostics' && row.session_id != null) {
    const byBiz = await Model.findOne({
      session_id: row.session_id,
      controller_name: row.controller_name,
      card_number: row.card_number,
      channel_number: row.channel_number ?? null,
      error_type: row.error_type,
    })
      .select('_id uuid')
      .session(session)
      .lean();
    if (byBiz) {
      doc._id = byBiz._id;
      await Model.replaceOne({ _id: byBiz._id }, doc, { session });
      return { operation: 'upsert', _id: byBiz._id };
    }
  }

  if (doc._id != null) {
    const idTaken = await Model.findById(doc._id).select('_id uuid').session(session).lean();
    if (idTaken) {
      if (idTaken.uuid === uuid) {
        await Model.replaceOne({ _id: idTaken._id }, doc, { session });
        return { operation: 'upsert', _id: idTaken._id };
      }
      delete doc._id;
    }
  }

  if (doc._id == null) {
    const max = await Model.findOne().sort({ _id: -1 }).select('_id').session(session).lean();
    const next = typeof max?._id === 'number' ? max._id + 1 : 1;
    if (STRING_ID_TABLES.has(tableName)) {
      const candidate = String(row.id || uuid);
      const taken = await Model.findById(candidate).select('_id').session(session).lean();
      doc._id = taken ? String(next) : candidate;
    } else {
      doc._id = next;
    }
  }

  await Model.create([doc], { session });
  return { operation: 'upsert', _id: doc._id };
}

async function loadStagedRows(token) {
  const chunks = await SyncStaging.find({ token }).sort({ chunk_index: 1 }).lean();
  const merged = {};
  for (const chunk of chunks) {
    const tables = chunk.tables || {};
    for (const [tableName, rows] of Object.entries(tables)) {
      if (!merged[tableName]) merged[tableName] = [];
      merged[tableName].push(...rows);
    }
  }
  return merged;
}

async function commitSession(token) {
  const syncSession = await SyncSession.findById(token);
  if (!syncSession) throw new Error('Unknown sync session');
  if (syncSession.status === 'committed') {
    return {
      alreadyCommitted: true,
      cursor: syncSession.cursor_after,
      rowsApplied: syncSession.rows_applied,
    };
  }

  const staged = await loadStagedRows(token);
  const flat = [];
  for (const [tableName, rows] of Object.entries(staged)) {
    for (const row of rows) {
      flat.push({ tableName, row });
    }
  }

  const cursorBefore = await getServerVersion();
  let rowsApplied = 0;
  let cursorAfter = cursorBefore;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { start } = await allocateVersions(flat.length, session);
      let version = start;
      const changeDocs = [];

      for (const { tableName, row } of flat) {
        const isDelete = row.deleted === 1 || row.deleted === true;
        if (isDelete) {
          const Model = MODEL_MAP[tableName];
          await Model.updateOne(
            { uuid: row.uuid },
            { $set: { deleted: 1, updated_at: new Date(), synced: 1 } },
            { session }
          );
        } else {
          await upsertByUuid(tableName, row, session);
        }

        changeDocs.push({
          server_version: version,
          table_name: tableName,
          uuid: row.uuid,
          operation: isDelete ? 'delete' : 'upsert',
          payload: stripMongoFields(row),
          device_id: syncSession.device_id,
          sync_session_id: token,
          created_at: new Date(),
        });
        version += 1;
        rowsApplied += 1;
      }

      if (changeDocs.length > 0) {
        await SyncChange.insertMany(changeDocs, { session });
      }
      cursorAfter = version - 1;
      if (flat.length === 0) cursorAfter = cursorBefore;

      await SyncSession.updateOne(
        { _id: token },
        {
          $set: {
            status: 'committed',
            rows_applied: rowsApplied,
            cursor_before: cursorBefore,
            cursor_after: cursorAfter,
            completed_at: new Date(),
          },
        },
        { session }
      );

      await SyncStaging.deleteMany({ token }, { session });
    });
  } finally {
    await session.endSession();
  }

  const checksums = {};
  for (const [tableName, rows] of Object.entries(staged)) {
    checksums[tableName] = rowChecksum(rows);
  }

  return {
    alreadyCommitted: false,
    cursor: cursorAfter,
    rowsApplied,
    checksums,
    cursorBefore,
  };
}

module.exports = { commitSession, loadStagedRows, rowChecksum };
