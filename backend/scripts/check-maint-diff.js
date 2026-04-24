const mongoose = require('mongoose');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const mongoUri = process.env.MONGODB_URI || 'mongodb://172.16.10.124:27017/cabinet_pm_db';
const dbPath = path.resolve(__dirname, '../../data/cabinet_pm_tablet.db');

async function main() {
  // Get local IDs
  const localIds = await new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    db.all('SELECT id FROM session_node_maintenance', (err, rows) => {
      db.close();
      if (err) reject(err);
      else resolve(new Set(rows.map(r => String(r.id))));
    });
  });
  console.log(`Local session_node_maintenance count: ${localIds.size}`);

  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;

  // Get all master IDs (non-deleted)
  const masterDocs = await db.collection('session_node_maintenance')
    .find({ deleted: { $ne: 1 } }, { projection: { _id: 1, session_id: 1, node_id: 1 } })
    .toArray();
  console.log(`Master session_node_maintenance count: ${masterDocs.length}`);

  // Find ones missing locally
  const missing = masterDocs.filter(d => !localIds.has(String(d._id)));
  console.log(`\nMissing from local: ${missing.length}`);

  // Group by session_id to understand what they are
  const bySession = {};
  for (const m of missing) {
    const sid = String(m.session_id);
    if (!bySession[sid]) bySession[sid] = [];
    bySession[sid].push(m._id);
  }

  // Look up session names
  for (const [sid, ids] of Object.entries(bySession)) {
    const sess = await db.collection('sessions').findOne(
      { _id: sid },
      { projection: { session_name: 1, status: 1, customer_id: 1 } }
    );
    console.log(`\nSession: ${sess?.session_name || sid} (${sess?.status || '?'}) — ${ids.length} missing maintenance records`);
    console.log(`  IDs: ${ids.slice(0, 5).join(', ')}${ids.length > 5 ? ` ...+${ids.length - 5} more` : ''}`);
  }

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
