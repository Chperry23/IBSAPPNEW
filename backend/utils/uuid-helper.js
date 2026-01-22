// UUID Helper
// Utilities for generating and managing UUIDs for sync

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

/**
 * Generate a new UUID v4
 * @returns {string} UUID v4 string
 */
function generateUUID() {
  return uuidv4();
}

/**
 * Ensure a record has a UUID, generate if missing
 * @param {Object} record - The record object
 * @returns {Object} Record with UUID
 */
function ensureUUID(record) {
  if (!record.uuid || record.uuid === '') {
    record.uuid = generateUUID();
  }
  return record;
}

/**
 * Initialize sync fields for a new record
 * @param {Object} record - The record object
 * @param {string} deviceId - Device identifier
 * @returns {Object} Record with sync fields initialized
 */
function initializeSyncFields(record, deviceId) {
  // Ensure UUID
  if (!record.uuid || record.uuid === '') {
    record.uuid = generateUUID();
  }
  
  // Set device_id if not set
  if (!record.device_id) {
    record.device_id = deviceId;
  }
  
  // Mark as unsynced (needs to be pushed to master)
  record.synced = 0;
  
  // Not deleted
  if (record.deleted === undefined || record.deleted === null) {
    record.deleted = 0;
  }
  
  return record;
}

/**
 * Mark a record as modified (needs sync)
 * @param {Object} record - The record object
 * @returns {Object} Record marked as unsynced
 */
function markAsModified(record) {
  record.synced = 0;
  record.updated_at = new Date().toISOString();
  return record;
}

/**
 * Mark a record as deleted (soft delete)
 * @param {Object} record - The record object
 * @returns {Object} Record marked as deleted
 */
function markAsDeleted(record) {
  record.deleted = 1;
  record.synced = 0; // Needs to sync the deletion
  record.updated_at = new Date().toISOString();
  return record;
}

/**
 * Check if a record needs syncing
 * @param {Object} record - The record object
 * @returns {boolean} True if record needs syncing
 */
function needsSync(record) {
  return record.synced === 0 || record.synced === null;
}

/**
 * Get device ID from hostname and timestamp
 * @returns {string} Device ID
 */
function generateDeviceId() {
  const hostname = require('os').hostname();
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString('hex');
  return `${hostname}_${timestamp}_${random}`;
}

/**
 * Prepare a record for creation (add all sync metadata)
 * Use this before inserting a new record into the database
 * @param {Object} record - The record to prepare
 * @param {string} deviceId - Device identifier
 * @returns {Object} Record with all sync fields
 */
function prepareNewRecord(record, deviceId) {
  const now = new Date().toISOString();
  
  return {
    ...record,
    uuid: record.uuid || generateUUID(),
    device_id: deviceId,
    synced: 0,
    deleted: 0,
    created_at: record.created_at || now,
    updated_at: record.updated_at || now
  };
}

/**
 * Prepare a record for update (mark as needing sync)
 * Use this before updating an existing record
 * @param {Object} record - The record to prepare
 * @returns {Object} Record marked for sync
 */
function prepareUpdateRecord(record) {
  return {
    ...record,
    synced: 0,
    updated_at: new Date().toISOString()
  };
}

module.exports = {
  generateUUID,
  ensureUUID,
  initializeSyncFields,
  markAsModified,
  markAsDeleted,
  needsSync,
  generateDeviceId,
  prepareNewRecord,
  prepareUpdateRecord
};

