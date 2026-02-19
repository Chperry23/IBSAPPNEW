/**
 * Merge duplicate customers in MongoDB (master): same SI key = same customer.
 * For each group of customers with the same "name" (SI key), keep one and move all
 * sessions and nodes to that customer, then remove the duplicate customer records.
 *
 * Run: node backend/scripts/merge-duplicate-customers-mongo.js
 */

const mongoose = require('mongoose');

const mongoUri = process.env.MONGODB_URI || 'mongodb://172.16.10.124:27017/cabinet_pm_db';

async function run() {
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  const customersCol = db.collection('customers');

  console.log('Merge duplicate customers (same SI key) in MongoDB');
  console.log('URI:', mongoUri.replace(/\/\/[^@]+@/, '//***@'));
  console.log('');

  // Find all customers (not deleted), group by name (SI key)
  const customers = await customersCol.find({ deleted: { $ne: 1 } }).toArray();
  const byName = {};
  for (const c of customers) {
    const key = (c.name && String(c.name).trim()) || '';
    if (!byName[key]) byName[key] = [];
    byName[key].push(c);
  }

  const duplicateGroups = Object.entries(byName).filter(([, list]) => list.length > 1);
  if (duplicateGroups.length === 0) {
    console.log('No duplicate customers (same name/SI key) found.');
    await mongoose.disconnect();
    return;
  }

  console.log('Found', duplicateGroups.length, 'SI key(s) with duplicate customers:\n');

  let totalMerged = 0;
  for (const [siKey, list] of duplicateGroups) {
    // Keep the one with smallest _id (oldest); merge others into it
    list.sort((a, b) => a._id - b._id);
    const keeper = list[0];
    const toRemove = list.slice(1);
    const keeperId = keeper._id;
    const removeIds = toRemove.map((c) => c._id);

    console.log(`  SI key "${siKey}": keep _id ${keeperId}, merge and remove _id [${removeIds.join(', ')}]`);

    const collectionsWithCustomerId = [
      'sessions', 'nodes',
      'sys_workstations', 'sys_smart_switches', 'sys_io_devices',
      'sys_controllers', 'sys_charms_io_cards', 'sys_charms', 'sys_ams_systems'
    ];
    let totalUpdated = 0;
    for (const collName of collectionsWithCustomerId) {
      const col = db.collection(collName);
      const r = await col.updateMany(
        { customer_id: { $in: removeIds } },
        { $set: { customer_id: keeperId, updated_at: new Date() } }
      );
      if (r.modifiedCount) {
        console.log(`    ${collName}: ${r.modifiedCount}`);
        totalUpdated += r.modifiedCount;
      }
    }
    if (totalUpdated) console.log(`    Total records updated: ${totalUpdated}`);

    // Soft-delete duplicate customer records so they no longer appear
    const delResult = await customersCol.updateMany(
      { _id: { $in: removeIds } },
      { $set: { deleted: 1, updated_at: new Date() } }
    );
    console.log(`    Duplicate customer records marked deleted: ${delResult.modifiedCount}`);
    totalMerged += delResult.modifiedCount;
  }

  await mongoose.disconnect();
  console.log('\nDone. Duplicate customers merged:', totalMerged);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
