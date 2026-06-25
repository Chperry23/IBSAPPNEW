#!/usr/bin/env node
/**
 * Backfill missing uuid values on local SQLite or master Mongo.
 *
 *   node backend/config/migrations/uuid-backfill.js --target local [--dry-run]
 *   node backend/config/migrations/uuid-backfill.js --target mongo [--dry-run] [--dedupe]
 */
const path = require('path');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { SYNC_TABLES, MODEL_MAP } = require('../../services/sync-tables');

const args = process.argv.slice(2);
const target = args.includes('--target')
  ? args[args.indexOf('--target') + 1]
  : 'local';
const dryRun = args.includes('--dry-run');
const dedupe = args.includes('--dedupe');

const mongoUri =
  process.env.MONGODB_URI ||
  'mongodb://172.16.10.124:27017/cabinet_pm_db?directConnection=true';

function isBlankUuid(v) {
  return v == null || String(v).trim() === '';
}

async function tableHasColumn(db, tableName, columnName) {
  const cols = await db.prepare(`PRAGMA table_info(${tableName})`).all([]);
  return (cols || []).some((c) => c.name === columnName);
}

async function backfillLocal() {
  const dbPath = process.env.DB_PATH || path.resolve(__dirname, '../../../data/cabinet_pm_tablet.db');
  process.env.DB_PATH = dbPath;
  const db = require('../database');

  console.log('Local DB:', dbPath);
  const summary = {};

  for (const table of SYNC_TABLES) {
    if (!(await tableHasColumn(db, table, 'uuid'))) {
      console.warn(`  ${table}: skip (no uuid column — run app once to migrate)`);
      summary[table] = 0;
      continue;
    }
    const rows = await db
      .prepare(`SELECT id, uuid FROM ${table} WHERE uuid IS NULL OR TRIM(uuid) = ''`)
      .all([]);
    summary[table] = rows.length;
    if (dryRun || rows.length === 0) continue;

    for (const row of rows) {
      const uuid = uuidv4();
      await db.prepare(`UPDATE ${table} SET uuid = ? WHERE id = ?`).run([uuid, row.id]);
    }
    console.log(`  ${table}: assigned uuid to ${rows.length} rows`);
  }

  return summary;
}

async function ensureUuidIndexes() {
  for (const table of SYNC_TABLES) {
    const Model = MODEL_MAP[table];
    if (!Model) continue;
    try {
      await Model.collection.createIndex({ uuid: 1 }, { unique: true, sparse: true });
    } catch (err) {
      if (!String(err.message).includes('already exists')) {
        console.warn(`  index warn ${table}:`, err.message);
      }
    }
  }
}

async function dedupeSessionNodeMaintenance() {
  const Model = MODEL_MAP.session_node_maintenance;
  const coll = Model.collection;
  const pipeline = [
    { $match: { session_id: { $exists: true }, node_id: { $exists: true } } },
    {
      $group: {
        _id: { session_id: '$session_id', node_id: '$node_id' },
        ids: { $push: '$_id' },
        docs: { $push: '$$ROOT' },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ];
  const dupes = await coll.aggregate(pipeline).toArray();
  let removed = 0;
  for (const group of dupes) {
    const sorted = group.docs.sort((a, b) => {
      const ta = new Date(a.updated_at || a.created_at || 0).getTime();
      const tb = new Date(b.updated_at || b.created_at || 0).getTime();
      return tb - ta;
    });
    const keep = sorted[0];
    const toRemove = sorted.slice(1).map((d) => d._id);
    if (dryRun) {
      removed += toRemove.length;
      continue;
    }
    const res = await coll.deleteMany({ _id: { $in: toRemove } });
    removed += res.deletedCount || 0;
    if (!isBlankUuid(keep.uuid)) {
      await coll.updateOne({ _id: keep._id }, { $set: { uuid: keep.uuid } });
    }
  }
  console.log(`  session_node_maintenance dedupe: removed ${removed} duplicate rows`);
  return removed;
}

async function backfillMongo() {
  console.log('Mongo:', mongoUri.replace(/\/\/[^@]+@/, '//***@'));
  await mongoose.connect(mongoUri);

  if (dedupe) {
    await dedupeSessionNodeMaintenance();
  }

  const summary = {};
  for (const table of SYNC_TABLES) {
    const Model = MODEL_MAP[table];
    if (!Model) continue;

    const missing = await Model.countDocuments({
      $or: [{ uuid: { $exists: false } }, { uuid: null }, { uuid: '' }],
    });
    summary[table] = missing;

    if (dryRun || missing === 0) continue;

    const cursor = Model.find({
      $or: [{ uuid: { $exists: false } }, { uuid: null }, { uuid: '' }],
    })
      .select('_id')
      .lean()
      .cursor();

    let count = 0;
    for await (const doc of cursor) {
      await Model.updateOne({ _id: doc._id }, { $set: { uuid: uuidv4() } });
      count += 1;
    }
    console.log(`  ${table}: assigned uuid to ${count} rows`);
  }

  if (!dryRun) {
    console.log('Ensuring uuid indexes...');
    await ensureUuidIndexes();
  }

  await mongoose.disconnect();
  return summary;
}

async function main() {
  console.log('UUID backfill');
  console.log('Target:', target, dryRun ? '(dry-run)' : '', dedupe ? '(dedupe)' : '');
  console.log('');

  let summary;
  if (target === 'mongo') {
    summary = await backfillMongo();
  } else if (target === 'local') {
    summary = await backfillLocal();
  } else {
    console.error('Use --target local or --target mongo');
    process.exit(1);
  }

  console.log('\nSummary (rows missing uuid):');
  for (const [table, count] of Object.entries(summary)) {
    if (count > 0) console.log(`  ${table}: ${count}`);
  }
  const total = Object.values(summary).reduce((a, b) => a + b, 0);
  console.log(`Total: ${total}${dryRun ? ' (would update)' : ''}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
