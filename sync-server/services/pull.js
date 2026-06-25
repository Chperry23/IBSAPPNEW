const zlib = require('zlib');
const { promisify } = require('util');
const { SyncChange } = require('../models/sync-meta');
const { getServerVersion } = require('./version-counter');
const { MODEL_MAP, REGISTRY_TABLES } = require('../../backend/services/sync-tables');
const models = require('../../backend/models/mongodb-models');

const gzip = promisify(zlib.gzip);

async function getChangesSince(since, limit = 5000) {
  const cursor = parseInt(since, 10) || 0;
  const changes = await SyncChange.find({ server_version: { $gt: cursor } })
    .sort({ server_version: 1 })
    .limit(limit)
    .lean();

  const current = await getServerVersion();
  return {
    since: cursor,
    current,
    hasMore: changes.length >= limit,
    changes,
  };
}

async function getRegistryManifest() {
  const customers = await models.Customer.find({ deleted: { $ne: 1 } })
    .select('_id uuid registry_version name alias')
    .lean();

  return customers.map((c) => ({
    customer_id: c._id,
    customer_uuid: c.uuid,
    name: c.name,
    alias: c.alias,
    registry_version: c.registry_version ?? 0,
  }));
}

async function getRegistrySnapshot(customerId) {
  const customer = await models.Customer.findById(customerId).lean();
  if (!customer) throw new Error('Customer not found');

  const snapshot = { customer_id: customerId, registry_version: customer.registry_version ?? 0, tables: {} };
  for (const table of REGISTRY_TABLES) {
    const Model = MODEL_MAP[table];
    const rows = await Model.find({ customer_id: customerId, deleted: { $ne: 1 } }).lean();
    snapshot.tables[table] = rows.map((r) => {
      const { __v, ...rest } = r;
      return rest;
    });
  }
  return snapshot;
}

async function getRegistryTablePage(tableName, skip = 0, limit = 20000) {
  if (!REGISTRY_TABLES.includes(tableName)) {
    throw new Error(`Invalid registry table: ${tableName}`);
  }
  const Model = MODEL_MAP[tableName];
  const filter = { deleted: { $ne: 1 } };
  const total = await Model.countDocuments(filter);
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20000, 1), 50000);
  const safeSkip = Math.max(parseInt(skip, 10) || 0, 0);
  const rows = await Model.find(filter).sort({ _id: 1 }).skip(safeSkip).limit(safeLimit).lean();

  return {
    table_name: tableName,
    total,
    skip: safeSkip,
    limit: safeLimit,
    count: rows.length,
    hasMore: safeSkip + rows.length < total,
    rows: rows.map((r) => {
      const { __v, ...rest } = r;
      return rest;
    }),
  };
}

async function gzipJson(data) {
  const buf = await gzip(JSON.stringify(data));
  return buf;
}

module.exports = {
  getChangesSince,
  getRegistryManifest,
  getRegistrySnapshot,
  getRegistryTablePage,
  gzipJson,
};
