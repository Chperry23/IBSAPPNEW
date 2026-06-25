/**
 * Deep audit: MPLX Carpenter controllers on master MongoDB
 * node backend/scripts/audit-carpenter-controllers-master.js
 */
const mongoose = require('mongoose');
const models = require('../models/mongodb-models');

const mongoUri = process.env.MONGODB_URI || 'mongodb://172.16.10.124:27017/cabinet_pm_db';
const CUSTOMER_CODE = '0001-0004-1582';
const SESSION_ID = '6d4173e9-b0bb-4fd4-9441-b4ea80d2a600';

const ID_WS = 1000000;
const ID_CTRL = 2000000;

function rawFromMaintNodeId(nodeId) {
  const id = Number(nodeId);
  if (id >= ID_CTRL && id < ID_CTRL + 1000000) return { kind: 'controller', raw: id - ID_CTRL };
  if (id >= ID_WS && id < ID_WS + 1000000) return { kind: 'workstation', raw: id - ID_WS };
  if (id > 0 && id < ID_WS) return { kind: 'io_device_row_id', raw: id };
  return { kind: 'unknown', raw: id };
}

async function main() {
  await mongoose.connect(mongoUri);
  console.log('Connected:', mongoUri);

  const customer = await models.Customer.findOne({
    $or: [{ name: CUSTOMER_CODE }, { alias: /Carpenter/i }],
  }).lean();
  if (!customer) {
    console.log('Customer not found');
    await mongoose.disconnect();
    return;
  }
  const cid = customer._id;
  console.log('\n=== Customer ===');
  console.log(`  _id=${cid} name="${customer.name}" alias="${customer.alias || ''}" uuid=${customer.uuid || '(none)'}`);

  console.log('\n=== sys_controllers for this customer_id ===');
  const ctrls = await models.SysController.find({ customer_id: cid }).sort({ name: 1 }).lean();
  console.log(`  Count: ${ctrls.length}`);
  ctrls.forEach((c) => {
    console.log(
      `  _id=${c._id} name="${c.name}" model=${c.model || '-'} deleted=${c.deleted} device_id=${c.device_id || '-'} updated=${c.updated_at}`
    );
  });

  console.log('\n=== sys_workstations for this customer_id ===');
  const ws = await models.SysWorkstation.find({ customer_id: cid }).sort({ name: 1 }).lean();
  console.log(`  Count: ${ws.length}`);
  ws.slice(0, 15).forEach((w) => {
    console.log(`  _id=${w._id} name="${w.name}" type=${w.type || '-'} deleted=${w.deleted}`);
  });
  if (ws.length > 15) console.log(`  ... and ${ws.length - 15} more`);

  console.log('\n=== Controllers ANYWHERE with Carpenter-ish name (wrong customer_id?) ===');
  const nameHits = await models.SysController.find({
    name: /carpenter|mplx|0915|l3-0915/i,
  })
    .limit(30)
    .lean();
  console.log(`  Hits: ${nameHits.length}`);
  for (const c of nameHits) {
    const cust = await models.Customer.findById(c.customer_id).lean();
    console.log(
      `  ctrl _id=${c._id} name="${c.name}" customer_id=${c.customer_id} (${cust?.name || '?'}) deleted=${c.deleted}`
    );
  }

  console.log('\n=== Legacy nodes collection for this customer ===');
  const legacy = await models.Node.find({ customer_id: cid }).lean();
  console.log(`  Count: ${legacy.length}`);
  legacy.forEach((n) => console.log(`  id=${n._id} name="${n.node_name}" type=${n.node_type}`));

  console.log('\n=== Session node maintenance (PM session) ===');
  const maint = await models.SessionNodeMaintenance.find({ session_id: SESSION_ID }).lean();
  console.log(`  Rows: ${maint.length}`);
  for (const m of maint) {
    const hint = rawFromMaintNodeId(m.node_id);
    let resolved = '(not on master registry)';
    if (hint.kind === 'controller') {
      const row = await models.SysController.findOne({ _id: hint.raw, customer_id: cid }).lean();
      resolved = row ? `controller "${row.name}" (_id=${row._id})` : `NO sys_controllers row id=${hint.raw} for customer ${cid}`;
    } else if (hint.kind === 'workstation') {
      const row = await models.SysWorkstation.findOne({ _id: hint.raw, customer_id: cid }).lean();
      resolved = row ? `workstation "${row.name}"` : `NO sys_workstations row id=${hint.raw}`;
    } else if (hint.kind === 'io_device_row_id') {
      const row = await models.SysIODevice.findOne({ _id: hint.raw, customer_id: cid }).lean();
      resolved = row ? `io_devices node="${row.node}" dst=${row.device_name}` : `NO sys_io_devices row id=${hint.raw}`;
    }
    console.log(`  node_id=${m.node_id} (${hint.kind} raw=${hint.raw})`);
    console.log(`    stored node_name=${m.node_name || '(none)'}`);
    console.log(`    resolves to: ${resolved}`);
    console.log(`    performance_value=${m.performance_value} notes=${(m.notes || '').slice(0, 50)}`);
  }

  console.log('\n=== All Carpenter sessions on master — maintenance node_ids ===');
  const sessions = await models.Session.find({
    customer_id: cid,
    session_name: /Carpenter/i,
  }).lean();
  for (const s of sessions) {
    const rows = await models.SessionNodeMaintenance.find({ session_id: s._id }).lean();
    console.log(`  ${s.session_name} (${s._id}) maintenance=${rows.length}`);
    for (const m of rows) {
      console.log(`    node_id=${m.node_id} node_name=${m.node_name || '(none)'}`);
    }
  }

  console.log('\n=== Other sessions for this customer (any maintenance with controllers) ===');
  const allSessions = await models.Session.find({ customer_id: cid }).lean();
  for (const s of allSessions) {
    if (/Carpenter/i.test(s.session_name || '')) continue;
    const n = await models.SessionNodeMaintenance.countDocuments({ session_id: s._id });
    if (n > 0) console.log(`  ${s.session_name}: ${n} maintenance rows`);
  }

  console.log('\n=== sys_controllers: total on master for customer_id 288 vs all customers ===');
  const total288 = await models.SysController.countDocuments({ customer_id: 288 });
  const totalAll = await models.SysController.countDocuments({});
  const withDeleted = await models.SysController.countDocuments({ customer_id: 288, deleted: 1 });
  console.log(`  customer 288: ${total288} (deleted=1: ${withDeleted})`);
  console.log(`  entire DB: ${totalAll}`);

  console.log('\n=== Who uploaded sys_io_devices for 288? (device_id sample) ===');
  const ioSample = await models.SysIODevice.find({ customer_id: cid }).limit(3).lean();
  ioSample.forEach((r) => console.log(`  io _id=${r._id} device_id=${r.device_id} updated=${r.updated_at}`));

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
