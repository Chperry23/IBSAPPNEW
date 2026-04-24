const mongoose = require('mongoose');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const mongoUri = process.env.MONGODB_URI || 'mongodb://172.16.10.124:27017/cabinet_pm_db';
const dbPath = path.resolve(__dirname, '../../data/cabinet_pm_tablet.db');

async function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) { if (err) reject(err); else resolve(this); });
  });
}

async function main() {
  const localDb = new sqlite3.Database(dbPath);

  // Get local IDs
  const localIds = await new Promise((resolve, reject) => {
    localDb.all('SELECT id FROM session_node_maintenance', (err, rows) => {
      if (err) reject(err);
      else resolve(new Set(rows.map(r => String(r.id))));
    });
  });

  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;

  // Get all master records not in local
  const masterDocs = await db.collection('session_node_maintenance')
    .find({ deleted: { $ne: 1 } })
    .toArray();

  const missing = masterDocs.filter(d => !localIds.has(String(d._id)));
  console.log(`Found ${missing.length} records on master missing from local`);

  if (missing.length === 0) {
    console.log('Nothing to do.');
    await mongoose.disconnect();
    localDb.close();
    return;
  }

  // Insert each missing record into local SQLite
  let inserted = 0;
  let errors = 0;
  for (const doc of missing) {
    try {
      await run(localDb, `
        INSERT OR IGNORE INTO session_node_maintenance (
          id, session_id, node_id, dv_checked, os_checked, macafee_checked,
          free_time, redundancy_checked, cold_restart_checked, has_io_errors,
          hdd_replaced, performance_type, performance_value, hf_updated,
          firmware_updated_checked, notes, completed, is_custom_node,
          deleted, synced, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `, [
        doc._id,
        doc.session_id,
        doc.node_id,
        doc.dv_checked ? 1 : 0,
        doc.os_checked ? 1 : 0,
        doc.macafee_checked ? 1 : 0,
        doc.free_time || null,
        doc.redundancy_checked ? 1 : 0,
        doc.cold_restart_checked ? 1 : 0,
        doc.has_io_errors ? 1 : 0,
        doc.hdd_replaced ? 1 : 0,
        doc.performance_type || null,
        doc.performance_value ?? null,
        doc.hf_updated ? 1 : 0,
        doc.firmware_updated_checked ? 1 : 0,
        doc.notes || null,
        doc.completed ? 1 : 0,
        doc.is_custom_node ? 1 : 0,
        0,  // not deleted
        1,  // already synced (came from master)
        doc.updated_at ? new Date(doc.updated_at).toISOString() : new Date().toISOString()
      ]);
      inserted++;
    } catch (err) {
      console.error(`  Error inserting ID ${doc._id}:`, err.message);
      errors++;
    }
  }

  console.log(`\n✅ Inserted: ${inserted}, Errors: ${errors}`);

  // Verify final count
  const finalCount = await new Promise((resolve, reject) => {
    localDb.get("SELECT COUNT(*) as c FROM session_node_maintenance WHERE COALESCE(deleted,0) != 1", (err, row) => {
      if (err) reject(err); else resolve(row.c);
    });
  });
  console.log(`Local count now: ${finalCount} (master: ${masterDocs.filter(d => d.deleted !== 1).length})`);

  await mongoose.disconnect();
  localDb.close();
}

main().catch(err => { console.error(err); process.exit(1); });
