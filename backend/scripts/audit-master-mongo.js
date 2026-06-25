/**
 * Audit master MongoDB server — list DBs, collections, MPLX Carpenter detail
 * node backend/scripts/audit-master-mongo.js [customerCode]
 */
const mongoose = require('mongoose');
const models = require('../models/mongodb-models');

const mongoHost = process.env.MONGO_HOST || '172.16.10.124:27017';
const defaultDb = process.env.MONGODB_DB || 'cabinet_pm_db';
const mongoUri = process.env.MONGODB_URI || `mongodb://${mongoHost}/${defaultDb}`;
const customerCode = process.argv[2] || '0001-0004-1582';

async function collectionStats(db, name) {
  try {
    return await db.collection(name).countDocuments({});
  } catch {
    return 'n/a';
  }
}

async function main() {
  console.log('=== Master MongoDB audit ===');
  console.log('URI:', mongoUri.replace(/\/\/[^@]+@/, '//***@'));

  const conn = await mongoose.connect(mongoUri);
  const db = conn.connection.db;
  const dbName = db.databaseName;

  console.log('\n--- Server ---');
  const admin = conn.connection.getClient().db('admin');
  const { databases } = await admin.admin().listDatabases();
  console.log('Databases on', mongoHost + ':');
  databases.forEach((d) => {
    console.log(`  ${d.name}  (${(d.sizeOnDisk / 1024 / 1024).toFixed(1)} MB)`);
  });

  console.log(`\n--- Connected database: ${dbName} ---`);
  const collections = await db.listCollections().toArray();
  const pmCollections = [
    'customers', 'sessions', 'cabinets', 'nodes',
    'session_diagnostics', 'session_node_maintenance',
    'sys_workstations', 'sys_controllers', 'sys_smart_switches', 'sys_io_devices',
    'sys_charms', 'sys_charms_io_cards', 'sys_ams_systems',
  ];
  console.log('Collection document counts (all docs, incl. deleted):');
  for (const name of pmCollections) {
    if (collections.some((c) => c.name === name)) {
      const total = await collectionStats(db, name);
      let active = total;
      try {
        active = await db.collection(name).countDocuments({ deleted: { $ne: 1 } });
      } catch (_) {}
      console.log(`  ${name}: ${active} active / ${total} total`);
    } else {
      console.log(`  ${name}: (missing)`);
    }
  }

  const codeRe = new RegExp(customerCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const customers = await models.Customer.find({
    $or: [{ name: codeRe }, { alias: codeRe }, { dongle_id: codeRe }],
  }).lean();

  console.log(`\n--- Customer search: ${customerCode} ---`);
  if (!customers.length) {
    console.log('  No customer found.');
  } else {
    for (const c of customers) {
      console.log(`  _id=${c._id} name="${c.name}" alias="${c.alias || ''}" uuid=${c.uuid}`);
      const cid = c._id;
      for (const [label, Model] of [
        ['sys_workstations', models.SysWorkstation],
        ['sys_controllers', models.SysController],
        ['sys_smart_switches', models.SysSmartSwitch],
        ['sys_io_devices', models.SysIODevice],
        ['nodes', models.Node],
      ]) {
        const n = await Model.countDocuments({ customer_id: cid, deleted: { $ne: 1 } });
        console.log(`    ${label}: ${n}`);
      }
      const sessions = await models.Session.find({ customer_id: cid, deleted: { $ne: 1 } }).lean();
      console.log(`    sessions: ${sessions.length}`);
      for (const s of sessions) {
        const diag = await models.SessionDiagnostics.countDocuments({ session_id: s._id, deleted: { $ne: 1 } });
        const maint = await models.SessionNodeMaintenance.countDocuments({ session_id: s._id, deleted: { $ne: 1 } });
        const cabs = await models.Cabinet.countDocuments({ pm_session_id: s._id, deleted: { $ne: 1 } });
        console.log(`      "${s.session_name}"`);
        console.log(`        id=${s._id}`);
        console.log(`        cabinets=${cabs} diagnostics=${diag} node_maintenance=${maint}`);
        console.log(`        updated=${s.updated_at} device_id=${s.device_id || '-'}`);
      }
    }
  }

  // Also try alternate DB name if user has data elsewhere
  if (dbName === 'cabinet_pm_db') {
    try {
      await mongoose.disconnect();
      const altUri = `mongodb://${mongoHost}/cabinet_pm`;
      await mongoose.connect(altUri);
      const altDb = mongoose.connection.db;
      const altCust = await altDb.collection('customers').countDocuments({}).catch(() => 0);
      console.log(`\n--- Alternate DB cabinet_pm ---`);
      console.log(`  customers collection count: ${altCust}`);
      if (altCust > 0) {
        console.log('  ⚠️  Data may also exist in cabinet_pm (without _db suffix)');
      }
      await mongoose.disconnect();
      await mongoose.connect(mongoUri);
    } catch (e) {
      console.log('\n--- Alternate DB cabinet_pm: not accessible or empty ---');
      await mongoose.connect(mongoUri).catch(() => {});
    }
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch((e) => {
  console.error('Failed:', e.message);
  process.exit(1);
});
