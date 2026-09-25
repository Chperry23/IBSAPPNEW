/**
 * Repair session cabinet locations on a tablet SQLite file (e.g. copied from a field PC).
 *
 *   node scripts/repair-cabinet-locations-sync.js --db path/to/cabinet_pm_tablet.db
 *   node scripts/repair-cabinet-locations-sync.js --db buddy.db --push-mongo
 *
 * --push-mongo  Upsert cabinet_locations into master Mongo (office network).
 * --session-id  Limit report/repair to one PM session id.
 */
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const {
  migrateCabinetNamesIntoLocations,
  reconstructPhantomCabinetLocations,
} = require('../backend/utils/migrate-cabinet-locations');

function parseArgs(argv) {
  const out = { db: null, pushMongo: false, sessionId: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--push-mongo') out.pushMongo = true;
    else if (a === '--session-id') out.sessionId = argv[++i];
    else if (a.startsWith('--db=')) out.db = a.slice(5);
    else if (a === '--db') out.db = argv[++i];
  }
  return out;
}

function wrapDb(raw) {
  return {
    prepare(sql) {
      return {
        get(params = []) {
          return new Promise((resolve, reject) => {
            raw.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
          });
        },
        all(params = []) {
          return new Promise((resolve, reject) => {
            raw.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
          });
        },
        run(params = []) {
          return new Promise((resolve, reject) => {
            raw.run(sql, params, function (err) {
              if (err) reject(err);
              else resolve({ changes: this.changes });
            });
          });
        },
      };
    },
  };
}

async function report(db, sessionId) {
  const sessionFilter = sessionId ? ' AND c.pm_session_id = ?' : '';
  const params = sessionId ? [sessionId] : [];
  const dangling = await db.prepare(`
    SELECT c.pm_session_id AS session_id, COUNT(*) AS cabinets
    FROM cabinets c
    LEFT JOIN cabinet_locations cl ON cl.id = c.location_id AND COALESCE(cl.deleted, 0) = 0
    WHERE COALESCE(c.deleted, 0) = 0
      AND c.location_id IS NOT NULL AND TRIM(c.location_id) != ''
      AND cl.id IS NULL
      ${sessionFilter}
    GROUP BY c.pm_session_id
    ORDER BY cabinets DESC
  `).all(params);
  return { dangling };
}

/** Master may have cabinets.location_id with no cabinet_locations — fix for all tablets on download. */
async function repairMongoPhantomLocations() {
  const mongoose = require('mongoose');
  const { getDefaultMongoUri } = require('../backend/utils/mongo-uri');
  const { CabinetLocation } = require('../backend/models/mongodb-models');

  await mongoose.connect(getDefaultMongoUri(), { serverSelectionTimeoutMS: 15000 });
  const mongo = mongoose.connection.db;

  const groups = await mongo
    .collection('cabinets')
    .aggregate([
      { $match: { deleted: { $ne: 1 }, location_id: { $nin: [null, ''] } } },
      { $group: { _id: { session_id: '$pm_session_id', location_id: '$location_id' }, n: { $sum: 1 } } },
      { $sort: { '_id.session_id': 1, '_id.location_id': 1 } },
    ])
    .toArray();

  const sessionCounter = new Map();
  let inserted = 0;
  for (const g of groups) {
    const sessionId = g._id.session_id;
    const locId = String(g._id.location_id);
    const exists = await CabinetLocation.findById(locId).select('_id').lean();
    if (exists) continue;

    const idx = (sessionCounter.get(sessionId) || 0) + 1;
    sessionCounter.set(sessionId, idx);
    const doc = {
      _id: locId,
      session_id: sessionId,
      location_name: `Recovered location ${idx}`,
      description: '',
      is_collapsed: 0,
      sort_order: idx,
      uuid: locId,
      synced: 1,
      deleted: 0,
      created_at: new Date(),
      updated_at: new Date(),
    };
    await CabinetLocation.replaceOne({ uuid: locId }, doc, { upsert: true });
    inserted += 1;
  }

  await mongoose.disconnect();
  return inserted;
}

async function pushLocationsToMongo(db, sessionId) {
  const mongoose = require('mongoose');
  const { getDefaultMongoUri } = require('../backend/utils/mongo-uri');
  const { CabinetLocation } = require('../backend/models/mongodb-models');

  await mongoose.connect(getDefaultMongoUri(), { serverSelectionTimeoutMS: 15000 });

  const filter = sessionId ? 'WHERE session_id = ?' : '';
  const params = sessionId ? [sessionId] : [];
  const rows = await db
    .prepare(`SELECT * FROM cabinet_locations WHERE COALESCE(deleted, 0) = 0 ${filter}`)
    .all(params);

  let upserted = 0;
  for (const row of rows) {
    if (!row.uuid) continue;
    const doc = {
      _id: String(row.id),
      session_id: row.session_id,
      location_name: row.location_name,
      description: row.description || '',
      is_collapsed: row.is_collapsed || 0,
      sort_order: row.sort_order || 0,
      uuid: row.uuid,
      synced: 1,
      deleted: row.deleted || 0,
      updated_at: row.updated_at ? new Date(row.updated_at) : new Date(),
      created_at: row.created_at ? new Date(row.created_at) : new Date(),
    };
    await CabinetLocation.replaceOne({ uuid: row.uuid }, doc, { upsert: true });
    upserted += 1;
  }
  await mongoose.disconnect();
  return upserted;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.db) {
    console.error('Usage: node scripts/repair-cabinet-locations-sync.js --db <sqlite-file> [--push-mongo] [--session-id <uuid>]');
    process.exit(1);
  }
  const dbPath = path.resolve(opts.db);
  const raw = new sqlite3.Database(dbPath);
  const db = wrapDb(raw);

  const before = await report(db, opts.sessionId);
  console.log('Before repair — sessions with cabinet location_id but no location row:', before.dangling);

  const migrated = await migrateCabinetNamesIntoLocations(db);
  console.log('Migrated from cabinet_names:', migrated);

  const phantom = await reconstructPhantomCabinetLocations(db);
  console.log('Reconstructed phantom location rows:', phantom);

  const after = await report(db, opts.sessionId);
  console.log('After repair — dangling sessions:', after.dangling);

  const pending = await db.prepare(
    `SELECT COUNT(*) AS n FROM cabinet_locations WHERE synced = 0 AND COALESCE(deleted, 0) = 0`
  ).get([]);
  console.log(`cabinet_locations pending upload (synced=0): ${pending?.n ?? 0}`);

  if (opts.pushMongo) {
    const mongoFixed = await repairMongoPhantomLocations();
    console.log(`Mongo phantom location rows upserted: ${mongoFixed}`);
    const n = await pushLocationsToMongo(db, opts.sessionId);
    console.log(`Pushed ${n} cabinet_locations row(s) from SQLite to Mongo`);
  }

  raw.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
