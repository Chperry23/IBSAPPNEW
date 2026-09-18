/**
 * Apply / copy PM session node scope via session_node_maintenance tombstones.
 * Active node lists already subtract deleted=1 rows (see session-node-list.js).
 */
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

const ID_WORKSTATION = 1000000;
const ID_CONTROLLER = 2000000;
const ID_CONTROLLER_PARTNER = 2100000;
const ID_SWITCH = 3000000;
const ID_CIOC = 4000000;
const ID_CIOC_PARTNER = 4100000;

function isRedundantFlag(r) {
  if (r == null || r === '') return false;
  const v = String(r).trim().toLowerCase();
  return v === 'yes' || v === 'true' || v === '1';
}

/** Lightweight registry list for pickers / scope seeding (includes partners). */
async function listCustomerRegistryNodesForScope(customerId) {
  const nodes = [];

  const workstations = await db
    .prepare(
      `SELECT id, name as node_name, COALESCE(type, 'Workstation') as node_type, 'workstation' as node_category
       FROM sys_workstations
       WHERE customer_id = ? AND COALESCE(deleted, 0) != 1`
    )
    .all([customerId]);
  for (const w of workstations) {
    nodes.push({
      id: ID_WORKSTATION + w.id,
      node_name: w.node_name,
      node_type: w.node_type,
      node_category: 'workstation',
    });
  }

  const controllers = await db
    .prepare(
      `SELECT id, name as node_name, model, redundant
       FROM sys_controllers
       WHERE customer_id = ? AND COALESCE(deleted, 0) != 1`
    )
    .all([customerId]);
  for (const c of controllers) {
    const id = ID_CONTROLLER + c.id;
    nodes.push({
      id,
      node_name: c.node_name,
      node_type: 'Controller',
      node_category: 'controller',
    });
    if (isRedundantFlag(c.redundant)) {
      nodes.push({
        id: ID_CONTROLLER_PARTNER + c.id,
        node_name: `${c.node_name}-partner`,
        node_type: 'Controller',
        node_category: 'controller',
      });
    }
  }

  const switches = await db
    .prepare(
      `SELECT id, name as node_name
       FROM sys_smart_switches
       WHERE customer_id = ? AND COALESCE(deleted, 0) != 1`
    )
    .all([customerId]);
  for (const s of switches) {
    nodes.push({
      id: ID_SWITCH + s.id,
      node_name: s.node_name,
      node_type: 'Smart Network Devices',
      node_category: 'switch',
    });
  }

  const ciocs = await db
    .prepare(
      `SELECT id, name as node_name, model, redundant,
        CASE
          WHEN LOWER(name) LIKE '%csls%' OR LOWER(name) LIKE '%charms logic solver%'
            OR LOWER(name) LIKE '%smart logic solver%'
            OR LOWER(COALESCE(model,'')) LIKE '%csls%'
            OR LOWER(COALESCE(model,'')) LIKE '%logic solver%'
          THEN 'CSLS' ELSE 'CIOC'
        END as node_type
       FROM sys_charms_io_cards
       WHERE customer_id = ? AND COALESCE(deleted, 0) != 1`
    )
    .all([customerId]);
  for (const c of ciocs) {
    nodes.push({
      id: ID_CIOC + c.id,
      node_name: c.node_name,
      node_type: c.node_type,
      node_category: 'cioc',
    });
    if (isRedundantFlag(c.redundant)) {
      nodes.push({
        id: ID_CIOC_PARTNER + c.id,
        node_name: `${c.node_name}-partner`,
        node_type: c.node_type,
        node_category: 'cioc',
      });
    }
  }

  return nodes;
}

async function insertExclusionTombstone(sessionId, node) {
  const nodeId = Number(node.id);
  if (!Number.isFinite(nodeId)) return;
  const existing = await db
    .prepare(
      `SELECT id FROM session_node_maintenance WHERE session_id = ? AND node_id = ?`
    )
    .get([sessionId, nodeId]);
  if (existing) {
    await db
      .prepare(
        `UPDATE session_node_maintenance
         SET deleted = 1, synced = 0, updated_at = CURRENT_TIMESTAMP,
             node_name = COALESCE(NULLIF(TRIM(node_name), ''), ?),
             node_type = COALESCE(NULLIF(TRIM(node_type), ''), ?)
         WHERE session_id = ? AND node_id = ?`
      )
      .run([node.node_name || null, node.node_type || null, sessionId, nodeId]);
    return;
  }
  await db
    .prepare(
      `INSERT INTO session_node_maintenance
         (session_id, node_id, node_name, node_type, is_custom_node, deleted, uuid, synced)
       VALUES (?, ?, ?, ?, 0, 1, ?, 0)`
    )
    .run([
      sessionId,
      nodeId,
      node.node_name || null,
      node.node_type || null,
      uuidv4(),
    ]);
}

/**
 * Keep only selected registry node IDs in the session; soft-exclude the rest.
 * @returns {{ excluded: number, total: number, kept: number }}
 */
async function applySelectedNodeScope(sessionId, customerId, selectedIds) {
  const selected = new Set(
    (Array.isArray(selectedIds) ? selectedIds : [])
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id))
      .map((id) => String(id))
  );
  const registry = await listCustomerRegistryNodesForScope(customerId);
  let excluded = 0;
  for (const node of registry) {
    if (selected.has(String(node.id))) continue;
    await insertExclusionTombstone(sessionId, node);
    excluded += 1;
  }
  return {
    excluded,
    total: registry.length,
    kept: registry.length - excluded,
  };
}

/**
 * Preserve source session visibility: copy exclusion tombstones only (no checklist).
 * @returns {{ copied: number }}
 */
async function copySessionExclusionTombstones(sourceSessionId, destSessionId) {
  const rows = await db
    .prepare(
      `SELECT node_id, node_name, node_type, is_custom_node
       FROM session_node_maintenance
       WHERE session_id = ? AND COALESCE(deleted, 0) = 1`
    )
    .all([sourceSessionId]);
  for (const row of rows) {
    await insertExclusionTombstone(destSessionId, {
      id: row.node_id,
      node_name: row.node_name,
      node_type: row.node_type,
    });
    if (row.is_custom_node) {
      await db
        .prepare(
          `UPDATE session_node_maintenance
           SET is_custom_node = 1, synced = 0
           WHERE session_id = ? AND node_id = ?`
        )
        .run([destSessionId, row.node_id]);
    }
  }
  return { copied: rows.length };
}

async function setSessionNodeScope(sessionId, nodeScope) {
  const scope = nodeScope === 'selected' ? 'selected' : 'all';
  try {
    await db
      .prepare(
        `UPDATE sessions SET node_scope = ?, synced = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      )
      .run([scope, sessionId]);
  } catch (e) {
    // Column may not exist on very old DBs until migration runs
    if (!/no such column/i.test(String(e.message || e))) throw e;
  }
  return scope;
}

module.exports = {
  listCustomerRegistryNodesForScope,
  applySelectedNodeScope,
  copySessionExclusionTombstones,
  setSessionNodeScope,
};
