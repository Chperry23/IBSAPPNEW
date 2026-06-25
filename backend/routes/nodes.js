const express = require('express');
const router = express.Router();
const db = require('../config/database');
const requireAuth = require('../middleware/auth');
const { finalizeSessionNodeList } = require('../utils/session-node-list');
const { syncFieldsForInsert } = require('../utils/sync-write-helper');

const ID_WORKSTATION = 1000000;
const ID_CONTROLLER = 2000000;
const ID_CONTROLLER_PARTNER = 2100000;
const ID_SWITCH = 3000000;
const ID_CIOC = 4000000;
const ID_CIOC_PARTNER = 4100000;

/** Prefer performance_value; fall back to legacy free_time text column. */
function coalescePerformanceValue(maint) {
  if (!maint) return null;
  const pv = maint.performance_value;
  if (pv != null && String(pv).trim() !== '') return pv;
  const ft = maint.free_time;
  if (ft != null && String(ft).trim() !== '') return ft;
  return null;
}

/** Resolve PM node_id (offset id) to a display node from registry or legacy nodes table */
async function resolveRegistryNodeById(nodeId, customerId, hints = {}) {
  const id = Number(nodeId);
  if (!Number.isFinite(id)) return null;

  const base = (row, category, nodeType, offsetId) => ({
    id: offsetId,
    node_name: row.node_name || row.name,
    node_type: nodeType,
    model: row.model || null,
    serial: row.serial || row.serial_number || null,
    firmware: row.firmware || row.software_revision || null,
    version: row.version || row.hardware_revision || null,
    status: row.status || 'active',
    redundant: row.redundant,
    customer_id: customerId,
    node_category: category,
    assigned_cabinet_id: row.assigned_cabinet_id,
    assigned_at: row.assigned_at,
    assigned_cabinet_name: row.assigned_cabinet_name,
  });

  if (id >= ID_CIOC_PARTNER && id < ID_CIOC_PARTNER + 1000000) {
    const raw = id - ID_CIOC_PARTNER;
    const row = await db.prepare(
      `SELECT cio.*, cio.name as node_name, c.cabinet_name as assigned_cabinet_name
       FROM sys_charms_io_cards cio
       LEFT JOIN cabinets c ON cio.assigned_cabinet_id = c.id
       WHERE cio.id = ? AND cio.customer_id = ?`
    ).get([raw, customerId]);
    if (row) {
      const nt = (row.node_name || '').toLowerCase();
      const nodeType = nt.includes('csls') || nt.includes('logic solver') ? 'CSLS' : 'CIOC';
      return { ...base(row, 'cioc', nodeType, id), node_name: `${row.node_name}-partner` };
    }
  }
  if (id >= ID_CIOC && id < ID_CIOC + 1000000) {
    const raw = id - ID_CIOC;
    let row = await db.prepare(
      `SELECT cio.*, cio.name as node_name, c.cabinet_name as assigned_cabinet_name
       FROM sys_charms_io_cards cio
       LEFT JOIN cabinets c ON cio.assigned_cabinet_id = c.id
       WHERE cio.id = ? AND cio.customer_id = ? AND (cio.deleted IS NULL OR cio.deleted = 0)`
    ).get([raw, customerId]);
    if (row) {
      const displayName = hints.node_name?.trim() || row.node_name;
      const nt = displayName.toLowerCase();
      const nodeType = nt.includes('csls') || nt.includes('logic solver') ? 'CSLS' : 'CIOC';
      return { ...base(row, 'cioc', nodeType, id), node_name: displayName };
    }
  }
  if (id >= ID_CONTROLLER_PARTNER && id < ID_CONTROLLER_PARTNER + 1000000) {
    const raw = id - ID_CONTROLLER_PARTNER;
    const row = await db.prepare(
      `SELECT ctrl.*, ctrl.name as node_name, c.cabinet_name as assigned_cabinet_name
       FROM sys_controllers ctrl
       LEFT JOIN cabinets c ON ctrl.assigned_cabinet_id = c.id
       WHERE ctrl.id = ? AND ctrl.customer_id = ?`
    ).get([raw, customerId]);
    if (row) {
      return { ...base(row, 'controller', 'Controller', id), node_name: `${row.node_name}-partner` };
    }
  }
  if (id >= ID_CONTROLLER && id < ID_CONTROLLER + 1000000) {
    const raw = id - ID_CONTROLLER;
    let row = await db.prepare(
      `SELECT ctrl.*, ctrl.name as node_name, c.cabinet_name as assigned_cabinet_name
       FROM sys_controllers ctrl
       LEFT JOIN cabinets c ON ctrl.assigned_cabinet_id = c.id
       WHERE ctrl.id = ? AND ctrl.customer_id = ? AND (ctrl.deleted IS NULL OR ctrl.deleted = 0)`
    ).get([raw, customerId]);
    if (row) {
      const displayName = hints.node_name?.trim() || row.node_name;
      return { ...base(row, 'controller', 'Controller', id), node_name: displayName };
    }
  }
  if (id >= ID_SWITCH && id < ID_SWITCH + 1000000) {
    const raw = id - ID_SWITCH;
    const row = await db.prepare(
      `SELECT sw.*, sw.name as node_name, c.cabinet_name as assigned_cabinet_name
       FROM sys_smart_switches sw
       LEFT JOIN cabinets c ON sw.assigned_cabinet_id = c.id
       WHERE sw.id = ? AND sw.customer_id = ?`
    ).get([raw, customerId]);
    if (row) return base(row, 'switch', 'Smart Network Devices', id);
  }
  if (id >= ID_WORKSTATION && id < ID_WORKSTATION + 1000000) {
    const raw = id - ID_WORKSTATION;
    let row = await db.prepare(
      `SELECT w.*, w.name as node_name, c.cabinet_name as assigned_cabinet_name
       FROM sys_workstations w
       LEFT JOIN cabinets c ON w.assigned_cabinet_id = c.id
       WHERE w.id = ? AND w.customer_id = ? AND (w.deleted IS NULL OR w.deleted = 0)`
    ).get([raw, customerId]);
    if (row) {
      const displayName = hints.node_name?.trim() || row.node_name;
      return { ...base(row, 'workstation', row.type || 'Workstation', id), node_name: displayName };
    }
  }

  const legacy = await db.prepare(
    'SELECT *, node_name FROM nodes WHERE id = ? AND customer_id = ?'
  ).get([id, customerId]);
  if (legacy) {
    return {
      id: legacy.id,
      node_name: legacy.node_name,
      node_type: legacy.node_type,
      model: legacy.model,
      serial: legacy.serial,
      firmware: legacy.firmware,
      version: legacy.version,
      status: legacy.status || 'active',
      redundant: legacy.redundant,
      customer_id: customerId,
      node_category: 'legacy',
    };
  }

  if (id > 0 && id < ID_WORKSTATION) {
    const io = await db.prepare(
      `SELECT id, node, device_type FROM sys_io_devices WHERE id = ? AND customer_id = ? AND (deleted IS NULL OR deleted = 0)`
    ).get([id, customerId]);
    if (io?.node && String(io.node).trim()) {
      const name = String(io.node).trim();
      const upper = name.toUpperCase();
      const nodeType =
        upper.includes('CIOC') || upper.includes('CSLS') ? 'CIOC' : 'Controller';
      return {
        id,
        node_name: name,
        node_type: nodeType,
        model: io.device_type || null,
        serial: null,
        firmware: null,
        version: null,
        status: 'active',
        customer_id: customerId,
        node_category: 'io_registry',
      };
    }
  }

  if (hints.node_name && String(hints.node_name).trim()) {
    return {
      id,
      node_name: String(hints.node_name).trim(),
      node_type: hints.node_type || 'Controller',
      model: null,
      serial: null,
      firmware: null,
      version: null,
      status: 'active',
      customer_id: customerId,
      node_category: 'maintenance',
    };
  }

  const snap = await db.prepare(
    `SELECT sns.node_name, sns.node_type
     FROM session_node_snapshots sns
     INNER JOIN sessions s ON s.id = sns.session_id
     WHERE sns.original_node_id = ? AND s.customer_id = ?
     ORDER BY sns.created_at DESC
     LIMIT 1`
  ).get([id, customerId]);
  if (snap?.node_name && String(snap.node_name).trim()) {
    return {
      id,
      node_name: String(snap.node_name).trim(),
      node_type: snap.node_type || 'Controller',
      model: null,
      serial: null,
      firmware: null,
      version: null,
      status: 'active',
      customer_id: customerId,
      node_category: 'snapshot',
    };
  }

  return {
    id,
    node_name: `Node ${id}`,
    node_type: 'Controller',
    model: null,
    serial: null,
    firmware: null,
    version: null,
    status: 'active',
    customer_id: customerId,
    node_category: 'maintenance',
  };
}

async function backfillMaintenanceNodeNames(sessionId, customerId) {
  const rows = await db.prepare(
    `SELECT id, node_id, node_name FROM session_node_maintenance
     WHERE session_id = ? AND (node_name IS NULL OR TRIM(node_name) = '')`
  ).all([sessionId]);
  for (const row of rows) {
    const resolved = await resolveRegistryNodeById(row.node_id, customerId);
    const name = resolved?.node_name;
    if (!name || name.startsWith('Node ')) continue;
    await db.prepare(
      `UPDATE session_node_maintenance
       SET node_name = ?, node_type = ?, synced = 0, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run([name, resolved.node_type || 'Controller', row.id]);
  }
}

async function appendNodesFromSessionMaintenance(nodes, customerId, sessionId) {
  const maintRows = await db.prepare(
    `SELECT DISTINCT node_id, node_name, node_type
     FROM session_node_maintenance
     WHERE session_id = ? AND node_id IS NOT NULL AND COALESCE(deleted, 0) != 1`
  ).all([sessionId]);
  const existing = new Set(nodes.map((n) => String(n.id)));
  let added = 0;
  for (const m of maintRows) {
    if (existing.has(String(m.node_id))) continue;
    const resolved = await resolveRegistryNodeById(m.node_id, customerId, {
      node_name: m.node_name,
      node_type: m.node_type,
    });
    if (resolved) {
      nodes.push(resolved);
      existing.add(String(resolved.id));
      added++;
    }
  }
  if (added > 0) {
    console.log(`   🔧 Added ${added} node(s) from session_node_maintenance for session ${sessionId}`);
  }
}

const SESSION_SNAPSHOT_SELECT = `
  SELECT
    sns.original_node_id as id,
    sns.node_name,
    sns.node_type,
    sns.model,
    sns.description,
    sns.serial,
    sns.firmware,
    sns.version,
    sns.status,
    sns.redundant,
    sns.os_name,
    sns.os_service_pack,
    sns.bios_version,
    sns.oem_type_description,
    sns.assigned_cabinet_name
  FROM session_node_snapshots sns
`;

async function loadSessionSnapshotNodes(sessionId) {
  return db.prepare(
    `${SESSION_SNAPSHOT_SELECT}
     WHERE sns.session_id = ?
     ORDER BY sns.node_type, sns.node_name`
  ).all([sessionId]);
}

async function mergeMaintenanceNodesIntoList(nodes, customerId, sessionId) {
  await backfillMaintenanceNodeNames(sessionId, customerId);
  await appendNodesFromSessionMaintenance(nodes, customerId, sessionId);
}

/** Node ids in scope for a PM session — maintenance rows, cabinet JSON, registry assigned to session cabinets */
async function collectSessionNodeIds(customerId, sessionId) {
  const ids = new Set();

  const maint = await db.prepare(
    `SELECT DISTINCT node_id FROM session_node_maintenance
     WHERE session_id = ? AND node_id IS NOT NULL AND COALESCE(deleted, 0) != 1`
  ).all([sessionId]);
  maint.forEach((r) => ids.add(String(r.node_id)));

  const cabinets = await db.prepare(
    `SELECT id, controllers, workstations, network_equipment FROM cabinets
     WHERE pm_session_id = ? AND COALESCE(deleted, 0) != 1`
  ).all([sessionId]);

  const cabinetIds = [];
  for (const cab of cabinets) {
    cabinetIds.push(cab.id);
    for (const key of ['controllers', 'workstations']) {
      try {
        const arr = JSON.parse(cab[key] || '[]');
        for (const item of arr) {
          if (item?.node_id != null) ids.add(String(item.node_id));
        }
      } catch (_) { /* ignore */ }
    }
    try {
      const netEquip = JSON.parse(cab.network_equipment || '[]');
      const switches = Array.isArray(netEquip) ? netEquip : (netEquip?.switches || []);
      for (const sw of switches) {
        if (sw?.node_id != null) ids.add(String(sw.node_id));
      }
    } catch (_) { /* ignore */ }
  }

  if (cabinetIds.length > 0) {
    const ph = cabinetIds.map(() => '?').join(',');
    const params = [...cabinetIds, customerId];
    const ctrl = await db
      .prepare(
        `SELECT id FROM sys_controllers
         WHERE assigned_cabinet_id IN (${ph}) AND customer_id = ? AND COALESCE(deleted, 0) != 1`
      )
      .all(params);
    ctrl.forEach((r) => ids.add(String(ID_CONTROLLER + r.id)));

    const cioc = await db
      .prepare(
        `SELECT id FROM sys_charms_io_cards
         WHERE assigned_cabinet_id IN (${ph}) AND customer_id = ? AND COALESCE(deleted, 0) != 1`
      )
      .all(params);
    cioc.forEach((r) => ids.add(String(ID_CIOC + r.id)));

    const ws = await db
      .prepare(
        `SELECT id FROM sys_workstations
         WHERE assigned_cabinet_id IN (${ph}) AND customer_id = ? AND COALESCE(deleted, 0) != 1`
      )
      .all(params);
    ws.forEach((r) => ids.add(String(ID_WORKSTATION + r.id)));

    const sw = await db
      .prepare(
        `SELECT id FROM sys_smart_switches
         WHERE assigned_cabinet_id IN (${ph}) AND customer_id = ? AND COALESCE(deleted, 0) != 1`
      )
      .all(params);
    sw.forEach((r) => ids.add(String(ID_SWITCH + r.id)));
  }

  return ids;
}

async function buildSessionScopedNodeList(customerId, sessionId) {
  await backfillMaintenanceNodeNames(sessionId, customerId);

  const maintRows = await db.prepare(
    `SELECT DISTINCT node_id, node_name, node_type FROM session_node_maintenance
     WHERE session_id = ? AND node_id IS NOT NULL AND COALESCE(deleted, 0) != 1`
  ).all([sessionId]);
  const maintByNodeId = new Map(maintRows.map((r) => [String(r.node_id), r]));

  const nodeIds = await collectSessionNodeIds(customerId, sessionId);
  const nodes = [];

  for (const idStr of nodeIds) {
    const hints = maintByNodeId.get(idStr) || {};
    const resolved = await resolveRegistryNodeById(Number(idStr), customerId, {
      node_name: hints.node_name,
      node_type: hints.node_type,
    });
    if (resolved) nodes.push(resolved);
  }

  nodes.sort((a, b) => String(a.node_name || '').localeCompare(String(b.node_name || '')));
  return nodes;
}

async function attachMaintenanceToNodes(nodes, sessionId, customerId) {
  const maintenanceData = await db.prepare(
    `SELECT * FROM session_node_maintenance WHERE session_id = ? AND COALESCE(deleted, 0) != 1`
  ).all([sessionId]);

  const maintMap = {};
  const maintByName = {};
  maintenanceData.forEach((m) => {
    maintMap[m.node_id] = m;
    const name = String(m.node_name || '').trim().toLowerCase();
    if (name) maintByName[name] = m;
  });

  for (const node of nodes) {
    let maint = maintMap[node.id];
    if (!maint) {
      const name = String(node.node_name || '').trim().toLowerCase();
      if (name) maint = maintByName[name];
    }
    if (maint) {
      if (maint.node_name && String(maint.node_name).trim()) {
        node.node_name = String(maint.node_name).trim();
      }
      if (maint.node_type && String(maint.node_type).trim()) {
        node.node_type = String(maint.node_type).trim();
      }
      node.dv_checked = Boolean(maint.dv_checked);
      node.dv_version = maint.dv_version;
      node.hf_checked = Boolean(maint.hf_checked);
      node.hf_updated = Boolean(maint.hf_updated);
      node.windows_update_checked = Boolean(maint.os_checked);
      node.macafee_checked = Boolean(maint.macafee_checked);
      node.free_time = maint.free_time || '';
      node.redundancy_checked = Boolean(maint.redundancy_checked);
      node.cold_restart_checked = Boolean(maint.cold_restart_checked);
      node.has_io_errors =
        maint.has_io_errors == null ? true : Boolean(Number(maint.has_io_errors));
      node.hdd_replaced = Boolean(maint.hdd_replaced);
      node.performance_type = maint.performance_type || null;
      node.performance_value = coalescePerformanceValue(maint);
      node.firmware_updated_checked = Boolean(maint.firmware_updated_checked);
      node.notes = maint.notes || '';
      node.is_custom_node = Boolean(maint.is_custom_node);
    } else {
      node.dv_checked = false;
      node.hf_checked = false;
      node.hf_updated = false;
      node.windows_update_checked = false;
      node.macafee_checked = false;
      node.free_time = '';
      node.redundancy_checked = false;
      node.cold_restart_checked = false;
      node.has_io_errors = true;
      node.hdd_replaced = false;
      node.performance_type = null;
      node.performance_value = null;
      node.firmware_updated_checked = false;
      node.notes = '';
      node.is_custom_node = false;
    }
  }

  for (const node of nodes) {
    const name = node.node_name || '';
    if (!name.startsWith('Node ')) continue;
    const hints = maintMap[node.id] || {};
    const better = await resolveRegistryNodeById(node.id, customerId, {
      node_name: hints.node_name,
      node_type: hints.node_type,
    });
    if (better?.node_name && !better.node_name.startsWith('Node ')) {
      node.node_name = better.node_name;
      node.node_type = better.node_type || node.node_type;
    }
  }
}

async function getSessionExcludedNodeIds(sessionId) {
  const rows = await db.prepare(
    `SELECT node_id FROM session_node_maintenance WHERE session_id = ? AND COALESCE(deleted, 0) = 1`
  ).all([sessionId]);
  return new Set(rows.map((r) => String(r.node_id)));
}

/** Move maintenance from dropped duplicate custom nodes onto the registry node with the same name. */
async function reconcileDuplicateMaintenance(sessionId, visibleNodes) {
  const rows = await db.prepare(`
    SELECT node_id, node_name FROM session_node_maintenance
    WHERE session_id = ? AND COALESCE(deleted, 0) != 1
  `).all([sessionId]);

  const visibleById = new Set(visibleNodes.map((n) => String(n.id)));
  const visibleByName = new Map();
  for (const n of visibleNodes) {
    const name = String(n.node_name || '').trim().toLowerCase();
    if (name) visibleByName.set(name, n);
  }

  for (const row of rows) {
    if (visibleById.has(String(row.node_id))) continue;
    const name = String(row.node_name || '').trim().toLowerCase();
    if (!name) continue;
    const target = visibleByName.get(name);
    if (!target) continue;

    const targetId = Number(target.id);
    const targetHasMaint = rows.some((r) => String(r.node_id) === String(targetId));
    if (targetHasMaint) {
      await db.prepare(`
        UPDATE session_node_maintenance
        SET deleted = 1, synced = 0, updated_at = CURRENT_TIMESTAMP
        WHERE session_id = ? AND node_id = ?
      `).run([sessionId, row.node_id]);
    } else {
      const isCustom = Number.isFinite(targetId) && targetId > 0 && targetId < ID_WORKSTATION;
      await db.prepare(`
        UPDATE session_node_maintenance
        SET node_id = ?, is_custom_node = ?, synced = 0, updated_at = CURRENT_TIMESTAMP
        WHERE session_id = ? AND node_id = ?
      `).run([targetId, isCustom ? 1 : 0, sessionId, row.node_id]);
    }
  }
}

async function mergeCustomNodesForSession(nodes, sessionId) {
  const customNodes = await db.prepare(`
    SELECT n.id, n.node_name, n.node_type, n.model, n.serial, n.firmware, n.version,
           'active' as status, n.redundant, n.customer_id, n.assigned_cabinet_id
    FROM nodes n
    INNER JOIN session_node_maintenance m ON m.node_id = n.id
    WHERE m.session_id = ? AND m.is_custom_node = 1 AND COALESCE(m.deleted, 0) != 1
  `).all([sessionId]);

  const existingIds = new Set(nodes.map((n) => String(n.id)));
  for (const cn of customNodes) {
    if (!existingIds.has(String(cn.id))) {
      nodes.push({ ...cn, node_category: 'legacy' });
      existingIds.add(String(cn.id));
    }
  }
  return customNodes.length;
}

/** Full customer topology from sys_* tables (System Registry import). */
async function loadFullCustomerRegistryNodes(customerId) {
  const isRedundantFlag = (r) => {
    if (r == null || r === '') return false;
    const v = String(r).trim().toLowerCase();
    return v === 'yes' || v === 'true' || v === '1';
  };

  const nodes = [];

  const workstations = await db.prepare(`
    SELECT
      w.id,
      w.name as node_name,
      w.type as node_type,
      w.model,
      w.dell_service_tag_number as serial,
      w.software_revision as firmware,
      w.dv_hotfixes as version,
      w.os_name,
      w.bios_version,
      'active' as status,
      w.redundant,
      w.customer_id,
      'workstation' as node_category,
      w.assigned_cabinet_id,
      w.assigned_at,
      c.cabinet_name as assigned_cabinet_name
    FROM sys_workstations w
    LEFT JOIN cabinets c ON w.assigned_cabinet_id = c.id
    WHERE w.customer_id = ? AND (w.deleted IS NULL OR w.deleted = 0)
  `).all([customerId]);
  workstations.forEach((w) => { w.id = ID_WORKSTATION + w.id; });
  nodes.push(...workstations);

  const controllers = await db.prepare(`
    SELECT
      ctrl.id,
      ctrl.name as node_name,
      'Controller' as node_type,
      ctrl.model,
      ctrl.serial_number as serial,
      ctrl.software_revision as firmware,
      ctrl.hardware_revision as version,
      'active' as status,
      ctrl.redundant,
      ctrl.customer_id,
      'controller' as node_category,
      ctrl.assigned_cabinet_id,
      ctrl.assigned_at,
      c.cabinet_name as assigned_cabinet_name
    FROM sys_controllers ctrl
    LEFT JOIN cabinets c ON ctrl.assigned_cabinet_id = c.id
    WHERE ctrl.customer_id = ? AND (ctrl.deleted IS NULL OR ctrl.deleted = 0)
  `).all([customerId]);
  controllers.forEach((c) => { c.id = ID_CONTROLLER + c.id; });
  nodes.push(...controllers);

  for (const ctrl of controllers) {
    if (isRedundantFlag(ctrl.redundant)) {
      const baseId = ctrl.id - ID_CONTROLLER;
      nodes.push({
        id: ID_CONTROLLER_PARTNER + baseId,
        node_name: `${ctrl.node_name}-partner`,
        node_type: 'Controller',
        node_category: 'controller',
        model: ctrl.model,
        serial: null,
        firmware: ctrl.firmware,
        version: ctrl.version,
        status: 'active',
        redundant: 'yes',
        customer_id: ctrl.customer_id,
        assigned_cabinet_id: ctrl.assigned_cabinet_id,
        assigned_at: ctrl.assigned_at,
        assigned_cabinet_name: ctrl.assigned_cabinet_name,
      });
    }
  }

  const switches = await db.prepare(`
    SELECT
      sw.id,
      sw.name as node_name,
      'Smart Network Devices' as node_type,
      sw.model,
      sw.serial_number as serial,
      sw.software_revision as firmware,
      sw.hardware_revision as version,
      'active' as status,
      sw.customer_id,
      'switch' as node_category,
      sw.assigned_cabinet_id,
      sw.assigned_at,
      c.cabinet_name as assigned_cabinet_name
    FROM sys_smart_switches sw
    LEFT JOIN cabinets c ON sw.assigned_cabinet_id = c.id
    WHERE sw.customer_id = ? AND (sw.deleted IS NULL OR sw.deleted = 0)
  `).all([customerId]);
  switches.forEach((s) => { s.id = ID_SWITCH + s.id; });
  nodes.push(...switches);

  const ciocs = await db.prepare(`
    SELECT
      cio.id,
      cio.name as node_name,
      CASE
        WHEN LOWER(cio.name)  LIKE '%csls%' OR LOWER(cio.name)  LIKE '%charms logic solver%' OR LOWER(cio.name)  LIKE '%smart logic solver%'
          OR LOWER(cio.model) LIKE '%csls%' OR LOWER(cio.model) LIKE '%logic solver%'
        THEN 'CSLS'
        ELSE 'CIOC'
      END as node_type,
      cio.model,
      cio.serial_number as serial,
      cio.software_revision as firmware,
      cio.hardware_revision as version,
      'active' as status,
      cio.redundant,
      cio.customer_id,
      'cioc' as node_category,
      cio.assigned_cabinet_id,
      cio.assigned_at,
      c.cabinet_name as assigned_cabinet_name
    FROM sys_charms_io_cards cio
    LEFT JOIN cabinets c ON cio.assigned_cabinet_id = c.id
    WHERE cio.customer_id = ? AND (cio.deleted IS NULL OR cio.deleted = 0)
  `).all([customerId]);
  ciocs.forEach((c) => { c.id = ID_CIOC + c.id; });
  nodes.push(...ciocs);

  for (const cioc of ciocs) {
    if (isRedundantFlag(cioc.redundant)) {
      const baseId = cioc.id - ID_CIOC;
      nodes.push({
        id: ID_CIOC_PARTNER + baseId,
        node_name: `${cioc.node_name}-partner`,
        node_type: cioc.node_type,
        node_category: 'cioc',
        model: cioc.model,
        serial: null,
        firmware: cioc.firmware,
        version: cioc.version,
        status: 'active',
        redundant: 'yes',
        customer_id: cioc.customer_id,
        assigned_cabinet_id: cioc.assigned_cabinet_id,
        assigned_at: cioc.assigned_at,
        assigned_cabinet_name: cioc.assigned_cabinet_name,
      });
    }
  }

  const ioNodeRows = await db.prepare(
    `SELECT DISTINCT node FROM sys_io_devices
     WHERE customer_id = ? AND node IS NOT NULL AND TRIM(node) != ''`
  ).all([customerId]);
  const existingNames = new Set(nodes.map((n) => n.node_name));
  for (const row of ioNodeRows) {
    const name = String(row.node).trim();
    if (!name || existingNames.has(name)) continue;
    const upper = name.toUpperCase();
    const nodeType = upper.includes('CIOC') || upper.includes('CSLS') ? 'CIOC' : 'Controller';
    nodes.push({
      id: `io-${name}`,
      node_name: name,
      node_type: nodeType,
      model: null,
      serial: null,
      firmware: null,
      version: null,
      status: 'active',
      customer_id: customerId,
      node_category: 'io_registry',
    });
    existingNames.add(name);
  }

  return nodes;
}

// Get all nodes for a customer
router.get('/api/customers/:customerId/nodes', requireAuth, async (req, res) => {
  const customerId = req.params.customerId;
  const sessionId = req.query.sessionId;
  
  console.log('🔍 [NODES] GET request:', { customerId, sessionId });
  
  try {
    if (sessionId) {
      const session = await db.prepare(
        'SELECT status, customer_id FROM sessions WHERE id = ?'
      ).get([sessionId]);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      if (String(session.customer_id) !== String(customerId)) {
        return res.status(400).json({ error: 'Session does not belong to this customer' });
      }

      console.log('🔍 [NODES] Session status:', session.status);

      if (session.status === 'completed') {
        const snapshots = await loadSessionSnapshotNodes(sessionId);
        if (snapshots.length > 0) {
          console.log(`🔍 [NODES] ${snapshots.length} snapshot(s) for completed session — merging maintenance`);
          const nodes = [...snapshots];
          await mergeMaintenanceNodesIntoList(nodes, customerId, sessionId);
          const excludedIds = await getSessionExcludedNodeIds(sessionId);
          const finalNodes = finalizeSessionNodeList(nodes, excludedIds);
          await reconcileDuplicateMaintenance(sessionId, finalNodes);
          await attachMaintenanceToNodes(finalNodes, sessionId, customerId);
          console.log(`🔍 [NODES] Returning ${finalNodes.length} node(s) (snapshots + maintenance)`);
          return res.json(finalNodes);
        }
        console.log('🔍 [NODES] Completed session has no snapshots — session-scoped maintenance list');
      } else {
        console.log('🔍 [NODES] Active session — loading full customer registry from System Registry');
        const nodes = await loadFullCustomerRegistryNodes(customerId);
        await mergeMaintenanceNodesIntoList(nodes, customerId, sessionId);
        const customCount = await mergeCustomNodesForSession(nodes, sessionId);
        if (customCount > 0) {
          console.log(`   🔧 Merged ${customCount} custom node(s) for session ${sessionId}`);
        }
        const excludedIds = await getSessionExcludedNodeIds(sessionId);
        const finalNodes = finalizeSessionNodeList(nodes, excludedIds);
        await reconcileDuplicateMaintenance(sessionId, finalNodes);
        await attachMaintenanceToNodes(finalNodes, sessionId, customerId);
        console.log(`✅ [NODES] Returning ${finalNodes.length} node(s) for active session (customer ${customerId})`);
        return res.json(finalNodes);
      }

      console.log('🔍 [NODES] Session-scoped node list (maintenance + cabinet assignments only)');
      const nodes = await buildSessionScopedNodeList(customerId, sessionId);
      const customCount = await mergeCustomNodesForSession(nodes, sessionId);
      if (customCount > 0) {
        console.log(`   🔧 Merged ${customCount} custom node(s) for session ${sessionId}`);
      }
      const excludedIds = await getSessionExcludedNodeIds(sessionId);
      const finalNodes = finalizeSessionNodeList(nodes, excludedIds);
      await reconcileDuplicateMaintenance(sessionId, finalNodes);
      await attachMaintenanceToNodes(finalNodes, sessionId, customerId);
      console.log(`✅ [NODES] Returning ${finalNodes.length} session-scoped node(s) for customer ${customerId}`);
      return res.json(finalNodes);
    }

    // No sessionId — full customer registry (System Registry browser, cabinet assign picker, etc.)
    console.log('🔍 [NODES] Loading full customer registry...');

    const nodes = await loadFullCustomerRegistryNodes(customerId);
    console.log(`   📋 Loaded ${nodes.filter((n) => n.node_category === 'workstation').length} workstations from sys_workstations`);
    console.log(`   🎮 Loaded ${nodes.filter((n) => n.node_category === 'controller').length} controllers from sys_controllers`);
    console.log(`   🔀 Loaded ${nodes.filter((n) => n.node_category === 'switch').length} smart switches from sys_smart_switches`);
    console.log(`   📟 Loaded ${nodes.filter((n) => n.node_category === 'cioc' && !String(n.node_name).endsWith('-partner')).length} Charms I/O cards from sys_charms_io_cards`);

    console.log(`✅ [NODES] Returning ${nodes.length} nodes from System Registry for customer ${customerId}`);
    if (nodes.length === 0) {
      console.warn('⚠️  [NODES] NO NODES FOUND IN SYSTEM REGISTRY!');
      console.warn('   💡 Import System Registry XML first: Customer Profile → Import Nodes');
    } else {
      console.log(`   First 5 nodes: ${nodes.slice(0, 5).map(n => n.node_name).join(', ')}`);
    }
    
    res.json(nodes);
  } catch (error) {
    console.error('❌ [NODES] Get nodes error:', error);
    console.error('❌ [NODES] Error stack:', error.stack);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get controller usage information for a customer
router.get('/api/customers/:customerId/controller-usage', requireAuth, async (req, res) => {
  const customerId = req.params.customerId;
  
  try {
    const controllerUsage = await db.prepare(`
      SELECT 
        n.id,
        n.node_name,
        n.node_type,
        n.model,
        n.serial,
        n.assigned_cabinet_id,
        n.assigned_at,
        c.cabinet_name as cabinet_location,
        s.session_name,
        s.id as session_id
      FROM nodes n
      LEFT JOIN cabinets c ON n.assigned_cabinet_id = c.id
      LEFT JOIN sessions s ON c.pm_session_id = s.id
      WHERE n.customer_id = ? 
      AND n.node_type IN ('Controller', 'CIOC', 'SZ Controller', 'Charms Smart Logic Solver', 'DeltaV EIOC')
      AND n.node_name NOT LIKE '%-partner'
      ORDER BY n.assigned_cabinet_id IS NULL, n.node_type, n.node_name
    `).all([customerId]);
    
    res.json(controllerUsage);
  } catch (error) {
    console.error('Get controller usage error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get available controllers for a customer with usage status
router.get('/api/customers/:customerId/available-controllers', requireAuth, async (req, res) => {
  const customerId = req.params.customerId;
  const sessionId = req.query.sessionId;
  
  try {
    console.log('🎮 [CONTROLLERS] Loading from System Registry for customer:', customerId);
    
    // Load controllers from sys_controllers and sys_charms_io_cards
    const controllers = await db.prepare(`
      SELECT 
        id,
        name as node_name,
        'Controller' as node_type,
        model,
        serial_number as serial,
        software_revision as firmware,
        hardware_revision as version,
        redundant,
        'available' as usage_status,
        customer_id,
        'controller' as node_category
      FROM sys_controllers
      WHERE customer_id = ?
      ORDER BY name
    `).all([customerId]);
    
    const ciocs = await db.prepare(`
      SELECT
        id,
        name as node_name,
        CASE
          WHEN LOWER(name)  LIKE '%csls%' OR LOWER(name)  LIKE '%charms logic solver%' OR LOWER(name)  LIKE '%smart logic solver%'
            OR LOWER(model) LIKE '%csls%' OR LOWER(model) LIKE '%logic solver%'
          THEN 'CSLS'
          ELSE 'CIOC'
        END as node_type,
        model,
        serial_number as serial,
        software_revision as firmware,
        hardware_revision as version,
        redundant,
        'available' as usage_status,
        customer_id,
        'cioc' as node_category
      FROM sys_charms_io_cards
      WHERE customer_id = ?
      ORDER BY name
    `).all([customerId]);
    
    const allControllers = [...controllers, ...ciocs];
    console.log(`✅ [CONTROLLERS] Found ${allControllers.length} controllers (${controllers.length} controllers + ${ciocs.length} CIOCs)`);
    
    res.json(allControllers);
  } catch (error) {
    console.error('Get available controllers error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get available smart switches for a customer
router.get('/api/customers/:customerId/available-switches', requireAuth, async (req, res) => {
  const customerId = req.params.customerId;
  
  try {
    console.log('🔀 [SWITCHES] Loading from System Registry for customer:', customerId);
    
    const switches = await db.prepare(`
      SELECT 
        id,
        name as node_name,
        'Smart Network Devices' as node_type,
        model,
        serial_number as serial,
        software_revision as firmware,
        hardware_revision as version,
        'available' as usage_status,
        customer_id,
        'switch' as node_category
      FROM sys_smart_switches
      WHERE customer_id = ?
      ORDER BY name
    `).all([customerId]);
    
    console.log(`✅ [SWITCHES] Found ${switches.length} smart switches from sys_smart_switches`);
    
    res.json(switches);
  } catch (error) {
    console.error('Get available switches error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Bulk import nodes from CSV
router.post('/api/customers/:customerId/nodes/import', requireAuth, async (req, res) => {
  const customerId = req.params.customerId;
  const { nodes, replace = false, merge = true } = req.body;
  
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return res.status(400).json({ error: 'No nodes provided' });
  }
  
  try {
    let importedCount = 0;
    let updatedCount = 0;
    let errors = [];
    
    // If replace is true, delete all existing nodes for this customer first
    if (replace) {
      // Clear node assignments first, but only for active sessions
      await db.prepare(`
        UPDATE nodes SET assigned_cabinet_id = NULL, assigned_at = NULL 
        WHERE customer_id = ? 
        AND (assigned_cabinet_id IS NULL OR assigned_cabinet_id IN (
          SELECT c.id FROM cabinets c 
          JOIN sessions s ON c.pm_session_id = s.id 
          WHERE s.status != 'completed'
        ))
      `).run([customerId]);
      
      // Delete session node maintenance records, but only for non-completed sessions
      await db.prepare(`
        DELETE FROM session_node_maintenance 
        WHERE node_id IN (SELECT id FROM nodes WHERE customer_id = ?)
        AND session_id IN (SELECT id FROM sessions WHERE status != 'completed')
      `).run([customerId]);
      
      // Delete session node tracker records, but only for non-completed sessions
      await db.prepare(`
        DELETE FROM session_node_tracker 
        WHERE session_id IN (SELECT id FROM sessions WHERE status != 'completed')
        AND node_id IN (SELECT id FROM nodes WHERE customer_id = ?)
      `).run([customerId]);
      
      // Delete all existing nodes
      await db.prepare('DELETE FROM nodes WHERE customer_id = ?').run([customerId]);
    }
    
    // Process nodes: merge (upsert) if merge=true, otherwise just insert
    for (const node of nodes) {
      try {
        if (merge && !replace) {
          // Check if node exists by matching node_name and customer_id
          const existingNode = await db.prepare(`
            SELECT id FROM nodes 
            WHERE customer_id = ? AND node_name = ?
          `).get([customerId, node.node_name]);
          
          if (existingNode) {
            // Update existing node - preserves ID and relationships
            await db.prepare(`
              UPDATE nodes SET 
                node_type = ?,
                model = ?,
                description = ?,
                serial = ?,
                firmware = ?,
                version = ?,
                status = ?,
                redundant = ?,
                os_name = ?,
                os_service_pack = ?,
                bios_version = ?,
                oem_type_description = ?,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run([
              node.node_type,
              node.model || null,
              node.description || null,
              node.serial || null,
              node.firmware || null,
              node.version || null,
              node.status || null,
              node.redundant || null,
              node.os_name || null,
              node.os_service_pack || null,
              node.bios_version || null,
              node.oem_type_description || null,
              existingNode.id
            ]);
            updatedCount++;
          } else {
            const { uuid } = syncFieldsForInsert('nodes');
            await db.prepare(`
              INSERT INTO nodes (
                customer_id, node_name, node_type, model, description, serial, 
                firmware, version, status, redundant, os_name, os_service_pack,
                bios_version, oem_type_description, uuid, synced
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            `).run([
              customerId,
              node.node_name,
              node.node_type,
              node.model || null,
              node.description || null,
              node.serial || null,
              node.firmware || null,
              node.version || null,
              node.status || null,
              node.redundant || null,
              node.os_name || null,
              node.os_service_pack || null,
              node.bios_version || null,
              node.oem_type_description || null,
              uuid,
            ]);
            importedCount++;
          }
        } else {
          const { uuid } = syncFieldsForInsert('nodes');
          await db.prepare(`
            INSERT INTO nodes (
              customer_id, node_name, node_type, model, description, serial, 
              firmware, version, status, redundant, os_name, os_service_pack,
              bios_version, oem_type_description, uuid, synced
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
          `).run([
            customerId,
            node.node_name,
            node.node_type,
            node.model || null,
            node.description || null,
            node.serial || null,
            node.firmware || null,
            node.version || null,
            node.status || null,
            node.redundant || null,
            node.os_name || null,
            node.os_service_pack || null,
            node.bios_version || null,
            node.oem_type_description || null,
            uuid,
          ]);
          importedCount++;
        }
      } catch (nodeError) {
        errors.push(`${node.node_name}: ${nodeError.message}`);
      }
    }
    
    res.json({ 
      success: true, 
      imported: importedCount, 
      updated: updatedCount,
      total: nodes.length,
      replaced: replace,
      merged: merge,
      errors: errors.length > 0 ? errors : null
    });
  } catch (error) {
    console.error('Import nodes error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete all nodes for a customer
router.delete('/api/customers/:customerId/nodes', requireAuth, async (req, res) => {
  const customerId = req.params.customerId;
  
  try {
    // First clear any node assignments, but only for active sessions
    await db.prepare(`
      UPDATE nodes SET assigned_cabinet_id = NULL, assigned_at = NULL 
      WHERE customer_id = ? 
      AND (assigned_cabinet_id IS NULL OR assigned_cabinet_id IN (
        SELECT c.id FROM cabinets c 
        JOIN sessions s ON c.pm_session_id = s.id 
        WHERE s.status != 'completed'
      ))
    `).run([customerId]);
    
    // Delete session node maintenance records, but only for non-completed sessions
    await db.prepare(`
      DELETE FROM session_node_maintenance 
      WHERE node_id IN (SELECT id FROM nodes WHERE customer_id = ?)
      AND session_id IN (SELECT id FROM sessions WHERE status != 'completed')
    `).run([customerId]);
    
    // Delete session node tracker records, but only for non-completed sessions
    await db.prepare(`
      DELETE FROM session_node_tracker 
      WHERE session_id IN (SELECT id FROM sessions WHERE status != 'completed')
      AND node_id IN (SELECT id FROM nodes WHERE customer_id = ?)
    `).run([customerId]);
    
    // Then delete all nodes
    const result = await db.prepare('DELETE FROM nodes WHERE customer_id = ?').run([customerId]);
    
    res.json({ 
      success: true, 
      deleted: result.changes,
      message: `Successfully deleted ${result.changes} nodes`
    });
  } catch (error) {
    console.error('Delete all nodes error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Helper: map node_category to the correct sys_* table
function getSysTable(nodeCategory) {
  const tableMap = {
    'controller': 'sys_controllers',
    'cioc': 'sys_charms_io_cards',
    'switch': 'sys_smart_switches',
    'workstation': 'sys_workstations',
  };
  return tableMap[nodeCategory] || null;
}

// Helper: try to assign in the correct sys_* table, fallback to trying all tables
async function assignNodeInSysTables(nodeId, cabinetId, nodeCategory) {
  // If we know the category, update directly
  if (nodeCategory) {
    const table = getSysTable(nodeCategory);
    if (table) {
      const result = await db.prepare(`
        UPDATE ${table} SET assigned_cabinet_id = ?, assigned_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run([cabinetId, nodeId]);
      if (result.changes > 0) return true;
    }
  }
  
  // Fallback: try all sys_* tables (handles cases where category wasn't passed)
  const tables = ['sys_controllers', 'sys_charms_io_cards', 'sys_smart_switches', 'sys_workstations'];
  for (const table of tables) {
    try {
      const result = await db.prepare(`
        UPDATE ${table} SET assigned_cabinet_id = ?, assigned_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run([cabinetId, nodeId]);
      if (result.changes > 0) return true;
    } catch (e) { /* table might not have the column yet, skip */ }
  }
  
  // Also try legacy nodes table
  try {
    const result = await db.prepare(`
      UPDATE nodes SET assigned_cabinet_id = ?, assigned_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run([cabinetId, nodeId]);
    if (result.changes > 0) return true;
  } catch (e) { /* ignore */ }
  
  return false;
}

// Helper: try to unassign from the correct sys_* table
async function unassignNodeInSysTables(nodeId, nodeCategory) {
  if (nodeCategory) {
    const table = getSysTable(nodeCategory);
    if (table) {
      const result = await db.prepare(`
        UPDATE ${table} SET assigned_cabinet_id = NULL, assigned_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run([nodeId]);
      if (result.changes > 0) return true;
    }
  }
  
  const tables = ['sys_controllers', 'sys_charms_io_cards', 'sys_smart_switches', 'sys_workstations'];
  for (const table of tables) {
    try {
      const result = await db.prepare(`
        UPDATE ${table} SET assigned_cabinet_id = NULL, assigned_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run([nodeId]);
      if (result.changes > 0) return true;
    } catch (e) { /* skip */ }
  }
  
  // Also try legacy nodes table
  try {
    const result = await db.prepare(`
      UPDATE nodes SET assigned_cabinet_id = NULL, assigned_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run([nodeId]);
    if (result.changes > 0) return true;
  } catch (e) { /* ignore */ }
  
  return false;
}

// Assign node to cabinet
router.post('/api/nodes/:nodeId/assign', requireAuth, async (req, res) => {
  const nodeId = req.params.nodeId;
  const { cabinet_id, node_category } = req.body;
  
  try {
    console.log(`🔗 Assigning node ${nodeId} (category: ${node_category || 'unknown'}) to cabinet ${cabinet_id}`);
    const success = await assignNodeInSysTables(nodeId, cabinet_id, node_category);
    
    if (!success) {
      console.warn(`⚠️ Node ${nodeId} not found in any table`);
      return res.status(404).json({ error: 'Node not found' });
    }
    
    console.log(`✅ Node ${nodeId} assigned to cabinet ${cabinet_id}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Assign node error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Unassign all nodes from a specific cabinet
router.post('/api/cabinets/:cabinetId/unassign-controllers', requireAuth, async (req, res) => {
  const cabinetId = req.params.cabinetId;
  
  try {
    let totalChanges = 0;
    
    // Unassign from all sys_* tables
    const tables = ['sys_controllers', 'sys_charms_io_cards', 'sys_smart_switches', 'sys_workstations'];
    for (const table of tables) {
      try {
        const result = await db.prepare(`
          UPDATE ${table} SET assigned_cabinet_id = NULL, assigned_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE assigned_cabinet_id = ?
        `).run([cabinetId]);
        totalChanges += result.changes;
      } catch (e) { /* skip */ }
    }
    
    // Also try legacy nodes table
    try {
      const result = await db.prepare(`
        UPDATE nodes SET assigned_cabinet_id = NULL, assigned_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE assigned_cabinet_id = ?
      `).run([cabinetId]);
      totalChanges += result.changes;
    } catch (e) { /* ignore */ }
    
    res.json({ 
      success: true, 
      message: `Unassigned ${totalChanges} nodes from cabinet`
    });
  } catch (error) {
    console.error('Unassign cabinet controllers error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Unassign single node from cabinet
router.post('/api/nodes/:nodeId/unassign', requireAuth, async (req, res) => {
  const nodeId = req.params.nodeId;
  const { node_category } = req.body;
  
  try {
    console.log(`🔓 Unassigning node ${nodeId} (category: ${node_category || 'unknown'})`);
    const success = await unassignNodeInSysTables(nodeId, node_category);
    
    if (!success) {
      console.warn(`⚠️ Node ${nodeId} not found in any table for unassign`);
      return res.status(404).json({ error: 'Node not found' });
    }
    
    console.log(`✅ Node ${nodeId} unassigned`);
    res.json({ success: true });
  } catch (error) {
    console.error('Unassign node error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update node (type, description, and other fields for categorization)
router.put('/api/nodes/:nodeId', requireAuth, async (req, res) => {
  const nodeId = req.params.nodeId;
  const {
    node_type,
    model,
    description,
    serial,
    firmware,
    version,
    status,
    redundant,
    os_name,
    os_service_pack,
    bios_version,
    oem_type_description
  } = req.body;

  try {
    const result = await db.prepare(`
      UPDATE nodes SET 
        node_type = COALESCE(?, node_type),
        model = ?,
        description = ?,
        serial = ?,
        firmware = ?,
        version = ?,
        status = ?,
        redundant = ?,
        os_name = ?,
        os_service_pack = ?,
        bios_version = ?,
        oem_type_description = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run([
      node_type ?? null,
      model ?? null,
      description ?? null,
      serial ?? null,
      firmware ?? null,
      version ?? null,
      status ?? null,
      redundant ?? null,
      os_name ?? null,
      os_service_pack ?? null,
      bios_version ?? null,
      oem_type_description ?? null,
      nodeId
    ]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Node not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Update node error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete node
router.delete('/api/nodes/:nodeId', requireAuth, async (req, res) => {
  const nodeId = req.params.nodeId;
  
  try {
    const result = await db.prepare('DELETE FROM nodes WHERE id = ?').run([nodeId]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete node error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;

