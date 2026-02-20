/**
 * Deduplicate sys_charms in MongoDB (master).
 * Keeps one charm per (customer_id, charms_io_card_name, name) and deletes the rest.
 * Use when charms were duplicated (e.g. each charm appears twice).
 *
 * Optional: pass customer name (e.g. "Perstorp") or customer_id to limit to one customer.
 * Run: node backend/scripts/deduplicate-charms-mongo.js
 * Run: node backend/scripts/deduplicate-charms-mongo.js Perstorp
 * Run: node backend/scripts/deduplicate-charms-mongo.js 123
 */

const mongoose = require('mongoose');

const mongoUri = process.env.MONGODB_URI || 'mongodb://172.16.10.124:27017/cabinet_pm_db';

function norm(v) {
  if (v == null) return '';
  return String(v).trim();
}

function charmKey(doc) {
  const cid = doc.customer_id;
  const card = norm(doc.charms_io_card_name);
  const name = norm(doc.name);
  const serial = norm(doc.serial_number);
  return `${cid}|${card}|${name}|${serial}`;
}

async function run() {
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  const charmsCol = db.collection('sys_charms');
  const customersCol = db.collection('customers');

  const filterCustomer = process.argv[2];
  let customerIdFilter = null;
  if (filterCustomer) {
    const idNum = parseInt(filterCustomer, 10);
    if (!Number.isNaN(idNum)) {
      customerIdFilter = idNum;
      console.log('Limiting to customer_id:', customerIdFilter);
    } else {
      const cust = await customersCol.findOne({
        name: { $regex: new RegExp(filterCustomer, 'i') },
        deleted: { $ne: 1 }
      });
      if (cust) {
        customerIdFilter = cust._id;
        console.log('Limiting to customer:', cust.name, '(id:', customerIdFilter, ')');
      } else {
        console.log('Customer not found for:', filterCustomer, '- will process all customers.');
      }
    }
  }

  const query = { deleted: { $ne: 1 } };
  if (customerIdFilter != null) query.customer_id = customerIdFilter;

  const all = await charmsCol.find(query).toArray();
  console.log('Total charms (active):', all.length);

  const byKey = {};
  for (const doc of all) {
    const key = charmKey(doc);
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push(doc);
  }

  const duplicateGroups = Object.entries(byKey).filter(([, list]) => list.length > 1);
  if (duplicateGroups.length === 0) {
    console.log('No duplicate charms found.');
    await mongoose.disconnect();
    return;
  }

  console.log('Found', duplicateGroups.length, 'charm key(s) with duplicates.\n');

  let totalDeleted = 0;
  const idsToDelete = [];

  for (const [key, list] of duplicateGroups) {
    list.sort((a, b) => a._id - b._id);
    const keep = list[0];
    const duplicates = list.slice(1);
    const dupIds = duplicates.map((d) => d._id);
    idsToDelete.push(...dupIds);
    console.log(`  Keep _id ${keep._id} (${keep.name}), remove duplicates: [${dupIds.join(', ')}]`);
  }

  if (idsToDelete.length === 0) {
    await mongoose.disconnect();
    return;
  }

  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) {
    console.log('\n[DRY RUN] Would delete', idsToDelete.length, 'duplicate document(s). Run without --dry-run to apply.');
    await mongoose.disconnect();
    return;
  }

  console.log('\nDeleting', idsToDelete.length, 'duplicate charm document(s)...');
  const result = await charmsCol.deleteMany({ _id: { $in: idsToDelete } });
  totalDeleted = result.deletedCount ?? 0;
  console.log('Deleted:', totalDeleted);

  await mongoose.disconnect();
  console.log('\nDone. Duplicate charms removed from master.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
