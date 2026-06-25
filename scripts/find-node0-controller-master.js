/**
 * Search master Mongo for "Node 0 Controller" (and variants).
 * node scripts/find-node0-controller-master.js
 */
const mongoose = require('mongoose');
const { getDefaultMongoUri } = require('../backend/utils/mongo-uri');

const NAME_RE = /node\s*0|node0|NODE\s*0/i;
const EXACT_RE = /Node 0 Controller/i;
const CONTROLLER_RE = /controller/i;

async function main() {
  const uri = getDefaultMongoUri();
  await mongoose.connect(uri);
  console.log('Connected:', uri.replace(/\/\/[^@]+@/, '//***@'));

  const db = mongoose.connection.db;
  const collections = [
    'nodes',
    'sys_controllers',
    'sys_workstations',
    'sys_charms_io_cards',
    'sys_smart_switches',
  ];

  for (const coll of collections) {
    const hits = await db.collection(coll)
      .find({
        $or: [{ name: { $regex: NAME_RE } }, { node_name: { $regex: NAME_RE } }],
        deleted: { $ne: 1 },
      })
      .limit(50)
      .toArray();

    if (hits.length) {
      console.log(`\n--- ${coll} (${hits.length} match) ---`);
      for (const r of hits) {
        const cust = r.customer_id
          ? await db.collection('customers').findOne({ _id: r.customer_id })
          : null;
        console.log({
          _id: r._id,
          customer_id: r.customer_id,
          customer: cust?.name || cust?.alias,
          name: r.name || r.node_name,
          node_type: r.node_type,
          model: r.model,
          uuid: r.uuid,
          deleted: r.deleted,
        });
      }
    }
  }

  for (const coll of ['nodes', 'sys_controllers']) {
    const field = coll === 'nodes' ? 'node_name' : 'name';
    const exact = await db.collection(coll)
      .find({ [field]: { $regex: EXACT_RE } })
      .toArray();
    console.log(`\n--- Exact "${field}" in ${coll}: ${exact.length} ---`);
    for (const r of exact) {
      const cust = r.customer_id
        ? await db.collection('customers').findOne({ _id: r.customer_id })
        : null;
      console.log(JSON.stringify({
        _id: r._id,
        customer_id: r.customer_id,
        customer: cust?.name || cust?.alias,
        [field]: r[field],
        uuid: r.uuid,
        deleted: r.deleted,
      }));
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
