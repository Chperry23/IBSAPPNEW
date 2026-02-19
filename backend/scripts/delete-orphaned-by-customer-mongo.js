/**
 * Delete all documents (sessions, nodes, sys_*, etc.) whose customer_id
 * no longer exists in the customers collection (orphaned by customer removal).
 * Run: node backend/scripts/delete-orphaned-by-customer-mongo.js
 */

const mongoose = require('mongoose');

const mongoUri = process.env.MONGODB_URI || 'mongodb://172.16.10.124:27017/cabinet_pm_db';

const COLLECTIONS_WITH_CUSTOMER_ID = [
  'sessions',
  'nodes',
  'csv_import_history',
  'sys_workstations',
  'sys_smart_switches',
  'sys_io_devices',
  'sys_controllers',
  'sys_charms_io_cards',
  'sys_charms',
  'sys_ams_systems'
];

async function run() {
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  const customersCol = db.collection('customers');

  const validCustomerIds = await customersCol.distinct('_id');
  const validSet = new Set(validCustomerIds.map((id) => id));
  console.log('Delete data tied to removed customers (MongoDB)');
  console.log('Valid customer _ids count:', validSet.size);
  console.log('');

  let totalDeleted = 0;
  for (const collName of COLLECTIONS_WITH_CUSTOMER_ID) {
    try {
      const col = db.collection(collName);
      const result = await col.deleteMany({ customer_id: { $nin: validCustomerIds } });
      if (result.deletedCount > 0) {
        console.log('  ' + collName + ':', result.deletedCount, 'deleted');
        totalDeleted += result.deletedCount;
      }
    } catch (err) {
      console.log('  ' + collName + ': skip (' + err.message + ')');
    }
  }

  // Cabinets are tied to sessions (pm_session_id), not customer_id. Sessions already cleaned.
  // So we're done.
  console.log('\nTotal documents deleted:', totalDeleted);
  await mongoose.disconnect();
  console.log('Done.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
