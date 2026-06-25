/**
 * Broad master search for any document mentioning "Node 0" or "Node0".
 */
const mongoose = require('mongoose');
const { getDefaultMongoUri } = require('../backend/utils/mongo-uri');

const PATTERNS = [
  /Node 0 Controller/i,
  /Node\s*0/i,
  /NODE0/i,
  /Controller.*0/i,
];

async function main() {
  const uri = getDefaultMongoUri();
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const collNames = (await db.listCollections().toArray()).map((c) => c.name).sort();
  console.log('Searching', collNames.length, 'collections on master...\n');

  for (const pattern of PATTERNS) {
    console.log(`\n======== Pattern: ${pattern} ========`);
    let total = 0;
    for (const coll of collNames) {
      const sample = await db.collection(coll).findOne({});
      if (!sample) continue;

      const stringFields = Object.keys(sample).filter(
        (k) => typeof sample[k] === 'string' && !k.startsWith('_')
      );
      if (!stringFields.length) continue;

      const or = stringFields.map((f) => ({ [f]: { $regex: pattern } }));
      const hits = await db.collection(coll).find({ $or: or }).limit(10).toArray();
      if (hits.length) {
        total += hits.length;
        console.log(`\n  [${coll}] ${hits.length} hit(s)`);
        for (const r of hits) {
          const cust = r.customer_id
            ? await db.collection('customers').findOne({ _id: r.customer_id })
            : null;
          const summary = {
            _id: r._id,
            customer_id: r.customer_id,
            customer: cust?.name || cust?.alias,
          };
          for (const f of stringFields) {
            if (r[f] && pattern.test(String(r[f]))) summary[f] = r[f];
          }
          console.log('   ', JSON.stringify(summary));
        }
      }
    }
    if (total === 0) console.log('  (no matches)');
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
