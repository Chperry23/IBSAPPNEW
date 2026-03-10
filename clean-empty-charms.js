/**
 * clean-empty-charms.js
 *
 * Deletes sys_charms rows where every data field is "Not available" or blank.
 * These are empty hardware slots that carry no useful information.
 *
 * Usage:
 *   node clean-empty-charms.js                      -- clean local SQLite
 *   node clean-empty-charms.js --dry-run             -- preview only, no deletes
 *   node clean-empty-charms.js --customer 42         -- single customer only
 *   node clean-empty-charms.js --mongo               -- clean MongoDB master
 *   node clean-empty-charms.js --mongo --dry-run     -- preview MongoDB deletes
 *   node clean-empty-charms.js --mongo --customer 42 -- single customer in MongoDB
 */

const path    = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH    = process.env.DB_PATH  || path.resolve(__dirname, 'data/cabinet_pm_tablet.db');
const MONGO_URI  = process.env.MONGODB_URI || 'mongodb://172.16.10.124:27017/cabinet_pm_db';
const DRY_RUN    = process.argv.includes('--dry-run');
const DO_MONGO   = process.argv.includes('--mongo');
const customerArg = process.argv.indexOf('--customer');
const CUSTOMER_ID = customerArg !== -1 ? parseInt(process.argv[customerArg + 1]) : null;

// ── MongoDB path ─────────────────────────────────────────────────────────────
async function runMongo() {
  const mongoose = require('mongoose');

  const SysCharm = mongoose.model('SysCharm', new mongoose.Schema({
    _id:              { type: Number },
    customer_id:      { type: Number },
    model:            { type: String },
    software_revision:{ type: String },
    hardware_revision:{ type: String },
    serial_number:    { type: String },
  }, { collection: 'sys_charms', strict: false, versionKey: false }));

  const NA = { $in: [null, '', 'Not available', 'not available', 'NOT AVAILABLE'] };
  const filter = {
    $or: [
      { model: NA },             // at least one field must match NA to count as empty
    ],
    model:             NA,
    software_revision: NA,
    hardware_revision: NA,
    serial_number:     NA,
    ...(CUSTOMER_ID ? { customer_id: CUSTOMER_ID } : {}),
  };

  // Simpler flat filter — all four fields must be NA
  const query = {
    $and: [
      { $or: [{ model: null }, { model: '' }, { model: /^not available$/i }] },
      { $or: [{ software_revision: null }, { software_revision: '' }, { software_revision: /^not available$/i }] },
      { $or: [{ hardware_revision: null }, { hardware_revision: '' }, { hardware_revision: /^not available$/i }] },
      { $or: [{ serial_number: null }, { serial_number: '' }, { serial_number: /^not available$/i }] },
    ],
    ...(CUSTOMER_ID ? { customer_id: CUSTOMER_ID } : {}),
  };

  console.log('🔗 Connecting to MongoDB:', MONGO_URI);
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected\n');

  // Preview breakdown per customer
  const breakdown = await SysCharm.aggregate([
    { $match: query },
    { $group: { _id: '$customer_id', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  if (breakdown.length === 0) {
    console.log('✅ No empty "Not available" charms found in MongoDB — already clean.');
    await mongoose.disconnect();
    return;
  }

  const total = breakdown.reduce((s, r) => s + r.count, 0);
  console.log(`📊 Found ${total} empty charm${total !== 1 ? 's' : ''} across ${breakdown.length} customer${breakdown.length !== 1 ? 's' : ''}:\n`);
  breakdown.forEach(r => console.log(`   Customer ${r._id}: ${r.count} rows`));

  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN — no documents deleted. Remove --dry-run to apply.');
    await mongoose.disconnect();
    return;
  }

  const result = await SysCharm.deleteMany(query);
  console.log(`\n🧹 Deleted ${result.deletedCount} empty charm document${result.deletedCount !== 1 ? 's' : ''} from MongoDB.`);
  await mongoose.disconnect();
  console.log('✅ Done.');
}

// ── SQLite path ───────────────────────────────────────────────────────────────
const SQLITE_WHERE = `
  (model             IS NULL OR LOWER(TRIM(model))             IN ('', 'not available'))
  AND (software_revision IS NULL OR LOWER(TRIM(software_revision)) IN ('', 'not available'))
  AND (hardware_revision IS NULL OR LOWER(TRIM(hardware_revision)) IN ('', 'not available'))
  AND (serial_number     IS NULL OR LOWER(TRIM(serial_number))     IN ('', 'not available'))
`;

function runSQLite() {
  const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
      console.error('❌ Could not open database:', err.message);
      console.error('   Path tried:', DB_PATH);
      process.exit(1);
    }
    console.log('✅ Database opened:', DB_PATH);

    const customerFilter = CUSTOMER_ID ? ` AND customer_id = ${CUSTOMER_ID}` : '';

    db.all(
      `SELECT customer_id, COUNT(*) as empty_count
       FROM sys_charms
       WHERE ${SQLITE_WHERE} ${customerFilter}
       GROUP BY customer_id
       ORDER BY empty_count DESC`,
      [],
      (err, rows) => {
        if (err) { console.error('❌ Query error:', err.message); db.close(); return; }

        if (rows.length === 0) {
          console.log('✅ No empty "Not available" charms found — database is already clean.');
          db.close();
          return;
        }

        const total = rows.reduce((sum, r) => sum + r.empty_count, 0);
        console.log(`\n📊 Found ${total} empty charm${total !== 1 ? 's' : ''} across ${rows.length} customer${rows.length !== 1 ? 's' : ''}:\n`);
        rows.forEach(r => console.log(`   Customer ${r.customer_id}: ${r.empty_count} rows`));

        if (DRY_RUN) {
          console.log('\n⚠️  DRY RUN — no rows deleted. Remove --dry-run to apply.');
          db.close();
          return;
        }

        db.run(
          `DELETE FROM sys_charms WHERE ${SQLITE_WHERE} ${customerFilter}`,
          [],
          function(err) {
            if (err) { console.error('❌ Delete failed:', err.message); db.close(); return; }
            console.log(`\n🧹 Deleted ${this.changes} empty charm row${this.changes !== 1 ? 's' : ''}.`);
            db.close(() => console.log('✅ Done.'));
          }
        );
      }
    );
  });
}

// ── Entry point ───────────────────────────────────────────────────────────────
if (DO_MONGO) {
  runMongo().catch(err => { console.error('❌ MongoDB error:', err.message); process.exit(1); });
} else {
  runSQLite();
}
