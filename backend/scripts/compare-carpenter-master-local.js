/**
 * Compare master Mongo vs local SQLite for MPLX Carpenter session
 * node backend/scripts/compare-carpenter-master-local.js
 */
const mongoose = require('mongoose');
const models = require('../models/mongodb-models');
const db = require('../config/database');

const SESSION_ID = '6d4173e9-b0bb-4fd4-9441-b4ea80d2a600';
const mongoUri = process.env.MONGODB_URI || 'mongodb://172.16.10.124:27017/cabinet_pm_db';

async function main() {
  await mongoose.connect(mongoUri);
  const masterDiag = await models.SessionDiagnostics.find({
    session_id: SESSION_ID,
    deleted: { $ne: 1 },
  }).lean();
  const masterMaint = await models.SessionNodeMaintenance.find({
    session_id: SESSION_ID,
    deleted: { $ne: 1 },
  }).lean();

  const localSessions = await db.prepare(`
    SELECT id, session_name, synced FROM sessions WHERE session_name LIKE '%Carpenter%'
  `).all();

  console.log('=== Master (Mongo) ===');
  console.log('session_id', SESSION_ID);
  console.log('diagnostics:', masterDiag.length);
  masterDiag.forEach((d) => console.log(`  _id=${d._id} ${d.controller_name} card=${d.card_number} ${d.error_type} updated=${d.updated_at}`));
  console.log('maintenance:', masterMaint.length);
  masterMaint.forEach((m) => console.log(`  _id=${m._id} node_id=${m.node_id} updated=${m.updated_at}`));

  console.log('\n=== Local (SQLite) ===');
  console.log('DB:', process.env.DB_PATH || '(default tablet db)');
  console.log('sessions named Carpenter:', localSessions.length);
  for (const s of localSessions) {
    const diag = await db.prepare(`
      SELECT id, session_id, controller_name, card_number, error_type, synced, deleted
      FROM session_diagnostics WHERE session_id = ?
    `).all([s.id]);
    const maint = await db.prepare(`
      SELECT id, session_id, node_id, synced, deleted FROM session_node_maintenance WHERE session_id = ?
    `).all([s.id]);
    console.log(`  session ${s.id} name="${s.session_name}" synced=${s.synced}`);
    console.log('    diagnostics:', diag.length, diag);
    console.log('    maintenance:', maint.length, maint);
  }

  const meta = await db.prepare(`SELECT key, value FROM sync_metadata WHERE key LIKE 'last_sync_%'`).all();
  console.log('\n=== Local last_sync times ===');
  meta.filter((r) => r.key.includes('diagnostic') || r.key.includes('maintenance') || r.key.includes('session'))
    .forEach((r) => console.log(`  ${r.key}: ${r.value}`));

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
