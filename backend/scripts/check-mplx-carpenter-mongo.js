/**
 * Master MongoDB: MPLX Carpenter customer, registry, session PM data
 * node backend/scripts/check-mplx-carpenter-mongo.js
 */
const mongoose = require('mongoose');
const models = require('../models/mongodb-models');

const mongoUri = process.env.MONGODB_URI || 'mongodb://172.16.10.124:27017/cabinet_pm_db';

async function countForCustomer(Model, customerId, extra = {}) {
  return Model.countDocuments({ customer_id: customerId, deleted: { $ne: 1 }, ...extra });
}

async function main() {
  await mongoose.connect(mongoUri);
  console.log('Connected:', mongoUri.replace(/\/\/[^@]+@/, '//***@'));

  // All Carpenter-named sessions anywhere on master
  const allCarpenterSessions = await models.Session.find({
    session_name: /Carpenter/i,
    deleted: { $ne: 1 },
  }).lean();
  console.log('\n--- All sessions with "Carpenter" in name (master) ---');
  for (const s of allCarpenterSessions) {
    const cust = await models.Customer.findById(s.customer_id).lean();
    const diag = await models.SessionDiagnostics.countDocuments({ session_id: s._id, deleted: { $ne: 1 } });
    const maint = await models.SessionNodeMaintenance.countDocuments({ session_id: s._id, deleted: { $ne: 1 } });
    const cabs = await models.Cabinet.countDocuments({ pm_session_id: s._id, deleted: { $ne: 1 } });
    console.log(`  ${s.session_name}`);
    console.log(`    customer: ${cust?.name} / ${cust?.alias || ''} (_id=${s.customer_id})`);
    console.log(`    session_id=${s._id} cabinets=${cabs} diagnostics=${diag} maintenance=${maint}`);
  }

  const { Customer, Session, SessionDiagnostics, SessionNodeMaintenance, Cabinet } = models;

  const customers = await Customer.find({
    deleted: { $ne: 1 },
    $or: [
      { name: /0001-0004-1582/i },
      { alias: /0001-0004-1582/i },
      { name: /Carpenter/i },
      { alias: /Carpenter/i },
    ],
  }).lean();

  console.log('\n--- Customers (master) ---');
  if (!customers.length) {
    console.log('  None found for 0001-0004-1582 / Carpenter');
    await mongoose.disconnect();
    return;
  }
  customers.forEach((c) => {
    console.log(`  _id=${c._id} name="${c.name}" alias="${c.alias || ''}" uuid=${c.uuid || '(none)'}`);
  });

  for (const c of customers) {
    const cid = c._id;
    console.log(`\n========== Customer _id=${cid} (${c.name}) ==========`);

    const sysTables = [
      ['sys_workstations', models.SysWorkstation],
      ['sys_controllers', models.SysController],
      ['sys_smart_switches', models.SysSmartSwitch],
      ['sys_io_devices', models.SysIODevice],
      ['sys_charms', models.SysCharm],
      ['nodes (legacy)', models.Node],
    ];
    console.log('System registry / nodes:');
    for (const [label, Model] of sysTables) {
      if (!Model) continue;
      const n = await countForCustomer(Model, cid);
      console.log(`  ${label}: ${n}`);
    }

    const sessions = await Session.find({ customer_id: cid, deleted: { $ne: 1 } })
      .select('_id session_name status updated_at device_id')
      .lean();
    console.log(`\nSessions: ${sessions.length}`);
    const carpenter = sessions.filter((s) => /Carpenter/i.test(s.session_name || ''));
    const toShow = carpenter.length ? carpenter : sessions;
    for (const s of toShow) {
      const diag = await SessionDiagnostics.countDocuments({
        session_id: s._id,
        deleted: { $ne: 1 },
      });
      const maint = await SessionNodeMaintenance.countDocuments({
        session_id: s._id,
        deleted: { $ne: 1 },
      });
      const cabs = await Cabinet.countDocuments({
        pm_session_id: s._id,
        deleted: { $ne: 1 },
      });
      console.log(`  ${s.session_name}`);
      console.log(`    session_id=${s._id}`);
      console.log(`    status=${s.status} updated=${s.updated_at} device=${s.device_id || '-'}`);
      console.log(`    cabinets=${cabs} diagnostics=${diag} node_maintenance=${maint}`);
    }

    if (carpenter.length) {
      const sid = carpenter[0]._id;
      const sampleDiag = await SessionDiagnostics.find({ session_id: sid, deleted: { $ne: 1 } })
        .limit(5)
        .lean();
      console.log('\n  Sample diagnostics (first 5):');
      sampleDiag.forEach((d, i) => {
        console.log(`    ${i + 1}. ${d.controller_name} ${d.error_type} card=${d.card_number}`);
      });
    }
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
