const mongoose = require('mongoose');
const { getDefaultMongoUri } = require('../backend/utils/mongo-uri');

(async () => {
  await mongoose.connect(getDefaultMongoUri());
  const db = mongoose.connection.db;

  const patterns = [
    /Node\s*0\s*Controller/i,
    /^NODE0/i,
    /NODE-0/i,
    /N0[_\s-]?CNTRL/i,
    /Node0/i,
  ];

  for (const re of patterns) {
    for (const coll of ['nodes', 'sys_controllers']) {
      const field = coll === 'nodes' ? 'node_name' : 'name';
      const hits = await db.collection(coll).find({ [field]: { $regex: re } }).toArray();
      if (hits.length) {
        console.log(`\n${coll}.${field} /${re}/ (${hits.length}, incl deleted)`);
        for (const r of hits) {
          const cust = await db.collection('customers').findOne({ _id: r.customer_id });
          console.log({
            _id: r._id,
            customer: cust?.name || cust?.alias,
            name: r[field],
            deleted: r.deleted,
            uuid: r.uuid,
          });
        }
      }
    }
  }

  // Fuzzy: any controller name containing "0" and "node"
  const fuzzy = await db.collection('sys_controllers').find({
    name: { $regex: /node/i },
    $or: [{ name: { $regex: /\b0\b/ } }, { name: { $regex: /0/ } }],
  }).limit(30).toArray();
  console.log(`\nFuzzy sys_controllers with 'node' and '0': ${fuzzy.length}`);
  for (const r of fuzzy) {
    const cust = await db.collection('customers').findOne({ _id: r.customer_id });
    console.log(`  ${r.name} (cust ${r.customer_id} ${cust?.name || cust?.alias}, deleted=${r.deleted})`);
  }

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
