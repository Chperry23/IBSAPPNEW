const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const requireAuth = require('../middleware/auth');
const { findChrome, getPuppeteer } = require('../utils/chrome');
const { getSharedStyles, generateSingleCabinetHtml, generateRiskAssessmentPage, generateCoverPage, generateCabinetsSectionDividerPage } = require('../services/pdf/cabinetReport');
const { generateMaintenanceReportPage } = require('../services/pdf/maintenanceReport');
const { generateDiagnosticsSummary, generateControllerBreakdown } = require('../services/pdf/diagnosticsReport');
const { generateRiskAssessment } = require('../utils/risk-assessment');
const { getDefaultPerformanceType } = require('../utils/controllerType');
const {
  finalizeNodesForReport,
  normalizeNodeNameKey,
} = require('../utils/session-node-list');
const { syncFieldsForInsert, softDeleteSyncRow } = require('../utils/sync-write-helper');

const ID_WORKSTATION = 1000000;
const ID_CONTROLLER_BASE = 2000000;
const ID_SWITCH_BASE = 3000000;
const ID_CIOC_BASE = 4000000;

async function getSessionExcludedNodeIds(sessionId) {
  const rows = await db.prepare(
    `SELECT node_id FROM session_node_maintenance WHERE session_id = ? AND COALESCE(deleted, 0) = 1`
  ).all([sessionId]);
  return new Set(rows.map((r) => String(r.node_id)));
}

/**
 * Normalized name keys that should stay hidden from the session.
 * If any sibling with the same name is still active (deleted=0), do NOT exclude —
 * restore + duplicate-reconcile can leave a custom twin tombstoned while the
 * registry twin is active; excluding by name would hide the restored node.
 */
async function getSessionExcludedNameKeys(sessionId) {
  const rows = await db.prepare(
    `SELECT node_id, node_name, deleted FROM session_node_maintenance WHERE session_id = ?`
  ).all([sessionId]);
  const activeKeys = new Set();
  const deletedKeys = new Set();
  for (const row of rows) {
    let name = row.node_name;
    if (!name || !String(name).trim()) {
      if (Number(row.deleted) === 1) {
        name = await resolveNodeNameById(row.node_id);
      } else {
        continue;
      }
    }
    const key = normalizeNodeNameKey(name);
    if (!key) continue;
    if (Number(row.deleted) === 1) deletedKeys.add(key);
    else activeKeys.add(key);
  }
  const keys = new Set();
  for (const key of deletedKeys) {
    if (!activeKeys.has(key)) keys.add(key);
  }
  return keys;
}

async function getSessionExcludedControllerNames(sessionId) {
  const nameKeys = await getSessionExcludedNameKeys(sessionId);
  const rows = await db.prepare(
    `SELECT DISTINCT TRIM(node_name) as node_name
     FROM session_node_maintenance
     WHERE session_id = ? AND COALESCE(deleted, 0) = 1
       AND node_name IS NOT NULL AND TRIM(node_name) != ''`
  ).all([sessionId]);
  const names = new Set();
  for (const row of rows) {
    const raw = String(row.node_name).trim().toLowerCase();
    const key = normalizeNodeNameKey(row.node_name);
    // Skip names that still have an active sibling in the session
    if (key && !nameKeys.has(key)) continue;
    if (raw) names.add(raw);
  }

  const idOnly = await db.prepare(
    `SELECT node_id FROM session_node_maintenance
     WHERE session_id = ? AND COALESCE(deleted, 0) = 1
       AND (node_name IS NULL OR TRIM(node_name) = '')`
  ).all([sessionId]);
  for (const row of idOnly) {
    const name = await resolveNodeNameById(row.node_id);
    if (!name) continue;
    const key = normalizeNodeNameKey(name);
    if (key && !nameKeys.has(key)) continue;
    names.add(name.trim().toLowerCase());
  }
  names._keys = nameKeys;
  return names;
}

function isControllerNameExcluded(controllerName, excludedNames) {
  const raw = String(controllerName || '').trim().toLowerCase();
  if (!raw) return false;
  if (excludedNames.has(raw)) return true;
  const key = normalizeNodeNameKey(raw);
  return Boolean(key && excludedNames._keys?.has(key));
}

async function resolveNodeNameById(nodeId) {
  const id = Number(nodeId);
  if (!Number.isFinite(id)) return null;
  if (id >= ID_CIOC_BASE) {
    const r = await db.prepare('SELECT name FROM sys_charms_io_cards WHERE id = ?').get([id - ID_CIOC_BASE]);
    return r?.name || null;
  }
  if (id >= ID_SWITCH_BASE) {
    const r = await db.prepare('SELECT name FROM sys_smart_switches WHERE id = ?').get([id - ID_SWITCH_BASE]);
    return r?.name || null;
  }
  if (id >= ID_CONTROLLER_BASE) {
    const r = await db.prepare('SELECT name FROM sys_controllers WHERE id = ?').get([id - ID_CONTROLLER_BASE]);
    return r?.name || null;
  }
  if (id >= ID_WORKSTATION) {
    const r = await db.prepare('SELECT name FROM sys_workstations WHERE id = ?').get([id - ID_WORKSTATION]);
    return r?.name || null;
  }
  const legacy = await db.prepare('SELECT node_name FROM nodes WHERE id = ?').get([id]);
  return legacy?.node_name || null;
}

/** Soft-exclude a node and any same-named siblings (custom ↔ registry duplicates). */
async function excludeNodeAndNameSiblings(sessionId, nodeId, hint = {}) {
  const existing = await db.prepare(
    `SELECT * FROM session_node_maintenance WHERE session_id = ? AND node_id = ?`
  ).get([sessionId, nodeId]);

  let nodeName =
    hint.node_name ||
    existing?.node_name ||
    (await resolveNodeNameById(nodeId));

  const touch = async (nid, name, type, isCustom) => {
    const row = await db.prepare(
      `SELECT id FROM session_node_maintenance WHERE session_id = ? AND node_id = ?`
    ).get([sessionId, nid]);
    if (row) {
      await db.prepare(
        `UPDATE session_node_maintenance
         SET deleted = 1, synced = 0, updated_at = CURRENT_TIMESTAMP,
             node_name = COALESCE(NULLIF(TRIM(node_name), ''), ?),
             node_type = COALESCE(NULLIF(TRIM(node_type), ''), ?)
         WHERE session_id = ? AND node_id = ?`
      ).run([name || null, type || null, sessionId, nid]);
    } else {
      await db.prepare(
        `INSERT INTO session_node_maintenance
           (session_id, node_id, node_name, node_type, is_custom_node, deleted, uuid, synced)
         VALUES (?, ?, ?, ?, ?, 1, ?, 0)`
      ).run([sessionId, nid, name || null, type || null, isCustom ? 1 : 0, uuidv4()]);
    }
  };

  await touch(
    nodeId,
    nodeName,
    hint.node_type || existing?.node_type || null,
    Boolean(hint.is_custom_node ?? existing?.is_custom_node)
  );

  if (nodeName && String(nodeName).trim()) {
    const name = String(nodeName).trim();
    const nameKey = normalizeNodeNameKey(name);

    // Soft-delete any other maintenance rows with the same normalized name
    const activeRows = await db.prepare(
      `SELECT node_id, node_name FROM session_node_maintenance
       WHERE session_id = ? AND COALESCE(deleted, 0) != 1`
    ).all([sessionId]);
    for (const row of activeRows) {
      if (Number(row.node_id) === Number(nodeId)) continue;
      if (normalizeNodeNameKey(row.node_name) === nameKey) {
        await touch(
          row.node_id,
          row.node_name || name,
          hint.node_type || existing?.node_type || null,
          Number(row.node_id) < ID_WORKSTATION
        );
      }
    }

    // Tombstone same-named registry/custom siblings that have no maintenance row yet
    const siblingIds = new Set();
    const session = await db.prepare('SELECT customer_id FROM sessions WHERE id = ?').get([sessionId]);
    const customerId = session?.customer_id;
    if (customerId) {
      const ws = await db.prepare(
        `SELECT id, name FROM sys_workstations WHERE customer_id = ? AND COALESCE(deleted,0)!=1`
      ).all([customerId]);
      ws.filter((r) => normalizeNodeNameKey(r.name) === nameKey)
        .forEach((r) => siblingIds.add(ID_WORKSTATION + r.id));
      const ctrl = await db.prepare(
        `SELECT id, name FROM sys_controllers WHERE customer_id = ? AND COALESCE(deleted,0)!=1`
      ).all([customerId]);
      ctrl.filter((r) => normalizeNodeNameKey(r.name) === nameKey)
        .forEach((r) => siblingIds.add(ID_CONTROLLER_BASE + r.id));
      const sw = await db.prepare(
        `SELECT id, name FROM sys_smart_switches WHERE customer_id = ? AND COALESCE(deleted,0)!=1`
      ).all([customerId]);
      sw.filter((r) => normalizeNodeNameKey(r.name) === nameKey)
        .forEach((r) => siblingIds.add(ID_SWITCH_BASE + r.id));
      const cioc = await db.prepare(
        `SELECT id, name FROM sys_charms_io_cards WHERE customer_id = ? AND COALESCE(deleted,0)!=1`
      ).all([customerId]);
      cioc.filter((r) => normalizeNodeNameKey(r.name) === nameKey)
        .forEach((r) => siblingIds.add(ID_CIOC_BASE + r.id));
    }
    const customs = await db.prepare(
      `SELECT id, node_name FROM nodes WHERE COALESCE(deleted,0)!=1`
    ).all();
    customs
      .filter((r) => normalizeNodeNameKey(r.node_name) === nameKey)
      .forEach((r) => siblingIds.add(r.id));

    for (const sid of siblingIds) {
      if (Number(sid) === Number(nodeId)) continue;
      await touch(sid, name, hint.node_type || existing?.node_type || null, Number(sid) < ID_WORKSTATION);
    }
  }

  return { nodeName, existing };
}

// Helper function to check if session is completed
async function isSessionCompleted(sessionId) {
  const session = await db.prepare('SELECT status FROM sessions WHERE id = ?').get([sessionId]);
  return session && session.status === 'completed';
}

const ID_CONTROLLER = 2000000;
const ID_SWITCH = 3000000;
const ID_CIOC = 4000000;

async function getRegistryControllerCount(customerId) {
  if (!customerId) return 0;
  try {
    const ctrlTotal = await db.prepare('SELECT COUNT(*) as count FROM sys_controllers WHERE customer_id = ?').get([customerId]);
    const ciocTotal = await db.prepare('SELECT COUNT(*) as count FROM sys_charms_io_cards WHERE customer_id = ?').get([customerId]);
    return (ctrlTotal?.count ?? 0) + (ciocTotal?.count ?? 0);
  } catch (_) {
    return 0;
  }
}

/** Controllers/CIOCs/CSLS in session maintenance — better PM scope than customer registry alone */
async function getSessionMaintenanceControllerCount(sessionId) {
  try {
    const row = await db.prepare(`
      SELECT COUNT(DISTINCT node_id) as count FROM session_node_maintenance
      WHERE session_id = ? AND COALESCE(deleted, 0) != 1
        AND (
          (node_id >= ? AND node_id < ?)
          OR (node_id >= ? AND node_id < ?)
          OR LOWER(COALESCE(node_type, '')) IN ('controller', 'cioc', 'csls')
        )
    `).get([sessionId, ID_CONTROLLER, ID_SWITCH, ID_CIOC, ID_CIOC + 1000000]);
    return row?.count ?? 0;
  } catch (_) {
    return 0;
  }
}

async function resolveControllerAssignmentTotal(sessionId, customerId, assignedCount) {
  const registryTotal = await getRegistryControllerCount(customerId);
  const maintenanceTotal = await getSessionMaintenanceControllerCount(sessionId);
  return Math.max(registryTotal, maintenanceTotal, assignedCount);
}

// NEW: Efficient endpoint to get ALL sessions with customer info in one call
router.get('/all', requireAuth, async (req, res) => {
  try {
    // Get all sessions with customer and user info in one efficient query (exclude deleted)
    const allSessions = await db.prepare(`
      SELECT s.*, 
             c.name as customer_name,
             c.location as customer_location,
             s.customer_id,
             u.username,
             (SELECT COUNT(*) FROM cabinets cab WHERE cab.pm_session_id = s.id AND COALESCE(cab.deleted, 0) = 0) as cabinet_count,
             (SELECT COUNT(*) FROM cabinets cab WHERE cab.pm_session_id = s.id AND COALESCE(cab.deleted, 0) = 0 AND cab.status = 'completed') as completed_cabinet_count
      FROM sessions s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN users u ON s.user_id = u.id
      WHERE (s.deleted IS NULL OR s.deleted = 0)
      ORDER BY s.created_at DESC
    `).all();
    
    res.json(allSessions);
  } catch (error) {
    console.error('Get all sessions error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create new session (PM or I&I)
router.post('/', requireAuth, async (req, res) => {
  const { customer_id, session_name, session_type = 'pm' } = req.body;
  const sessionId = uuidv4();
  const sessionUuid = uuidv4();
  
  try {
    await db.prepare('INSERT INTO sessions (id, customer_id, user_id, session_name, session_type, status, uuid, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run([sessionId, parseInt(customer_id), req.session.userId, session_name, session_type, 'active', sessionUuid, 0]);
    
    const session = {
      id: sessionId,
      customer_id: parseInt(customer_id),
      user_id: req.session.userId,
      session_name,
      session_type,
      status: 'active',
      uuid: sessionUuid,
      synced: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    res.json({ success: true, session });
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update PM session
router.put('/:sessionId', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  const { session_name, status } = req.body;
  
  try {
    const result = await db.prepare('UPDATE sessions SET session_name = ?, status = ?, updated_at = CURRENT_TIMESTAMP, synced = 0 WHERE id = ?').run([session_name, status, sessionId]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Update session error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete PM session (soft delete for sync)
router.delete('/:sessionId', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  
  try {
    // 1. First, get all cabinet IDs for this session
    const cabinetIds = await db.prepare('SELECT id FROM cabinets WHERE pm_session_id = ?').all([sessionId]);
    
    // 2. Clear node assignments for cabinets in this session (across all sys_* tables + legacy nodes)
    if (cabinetIds.length > 0) {
      const sysTablesWithAssignment = ['sys_controllers', 'sys_charms_io_cards', 'sys_smart_switches', 'sys_workstations', 'nodes'];
      for (const cabinet of cabinetIds) {
        for (const table of sysTablesWithAssignment) {
          try {
            await db.prepare(`UPDATE ${table} SET assigned_cabinet_id = NULL, assigned_at = NULL WHERE assigned_cabinet_id = ?`).run([cabinet.id]);
          } catch (e) { /* column may not exist yet, skip */ }
        }
      }
    }
    
    // 3. Soft delete session node maintenance records
    await db.prepare('UPDATE session_node_maintenance SET deleted = 1, synced = 0, updated_at = CURRENT_TIMESTAMP WHERE session_id = ?').run([sessionId]);
    
    // 4. Soft delete session node tracker records
    await db.prepare('UPDATE session_node_tracker SET deleted = 1, synced = 0, updated_at = CURRENT_TIMESTAMP WHERE session_id = ?').run([sessionId]);
    
    // 5. Soft delete session diagnostics
    await db.prepare('UPDATE session_diagnostics SET deleted = 1, synced = 0, updated_at = CURRENT_TIMESTAMP WHERE session_id = ?').run([sessionId]);
    
    // 6. Soft delete cabinets
    await db.prepare('UPDATE cabinets SET deleted = 1, synced = 0, updated_at = CURRENT_TIMESTAMP WHERE pm_session_id = ?').run([sessionId]);
    
    // 7. Finally soft delete the session
    const result = await db.prepare('UPDATE sessions SET deleted = 1, synced = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run([sessionId]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json({ success: true, message: 'Session marked for deletion and will be synced to cloud' });
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get session details
// Check if session is completed (for frontend)
router.get('/:sessionId/status', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  
  try {
    const session = await db.prepare('SELECT status FROM sessions WHERE id = ?').get([sessionId]);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json({ 
      sessionId,
      status: session.status,
      isCompleted: session.status === 'completed'
    });
  } catch (error) {
    console.error('Get session status error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

router.get('/:sessionId', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  
  try {
    const session = await db.prepare(`
      SELECT s.*, c.name as customer_name, c.location
      FROM sessions s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.id = ?
    `).get([sessionId]);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const sessionCabinets = await db.prepare(`
      SELECT c.*, cl.location_name, cl.id as location_id
      FROM cabinets c
      LEFT JOIN cabinet_names cl ON c.location_id = cl.id
      WHERE c.pm_session_id = ? 
      ORDER BY cl.sort_order, cl.location_name, c.created_at
    `).all([sessionId]);
    
    // Get all locations for this session
    const locations = await db.prepare(`
      SELECT * FROM cabinet_names 
      WHERE session_id = ? 
      ORDER BY sort_order, location_name
    `).all([sessionId]);
    
    // Parse JSON fields for cabinets
    const cabinets = sessionCabinets.map(cabinet => ({
      ...cabinet,
      cabinet_type: cabinet.cabinet_type || 'cabinet',
      power_supplies: JSON.parse(cabinet.power_supplies || '[]'),
      distribution_blocks: JSON.parse(cabinet.distribution_blocks || '[]'),
      diodes: JSON.parse(cabinet.diodes || '[]'),
      media_converters: JSON.parse(cabinet.media_converters || '[]'),
      power_injected_baseplates: JSON.parse(cabinet.power_injected_baseplates || '[]'),
      network_equipment: JSON.parse(cabinet.network_equipment || '[]'),
      controllers: JSON.parse(cabinet.controllers || '[]'),
      workstations: JSON.parse(cabinet.workstations || '[]'),
      inspection: (() => {
        const base = JSON.parse(cabinet.inspection_data || '{}');
        // Merge top-level comments column into inspection so PDF template finds it
        if (cabinet.comments && cabinet.comments.trim() && !base.comments) {
          base.comments = cabinet.comments;
        }
        return base;
      })()
    }));

    // Controller/CIOC assignment stats
    const customerId = session.customer_id;
    let controllerAssignmentStats = { assigned: 0, total: 0 };
    
    if (session.status === 'completed') {
      // For COMPLETED sessions: compute stats from the frozen cabinet JSON data
      // This ensures historical data isn't affected by future duplications or reassignments
      let assignedFromJson = 0;
      for (const cab of cabinets) {
        const ctrls = cab.controllers || [];
        assignedFromJson += ctrls.filter(c => c.node_id).length;
        // Also count CIOCs if stored in controllers array
      }
      controllerAssignmentStats.assigned = assignedFromJson;
      controllerAssignmentStats.total = await resolveControllerAssignmentTotal(
        sessionId,
        customerId,
        assignedFromJson
      );
    } else {
      // For ACTIVE sessions: union of live sys_* assigned_cabinet_id AND cabinet JSON blobs
      const assignedNodeIds = new Set();
      for (const cab of cabinets) {
        const ctrls = cab.controllers || [];
        for (const c of ctrls) {
          if (c.node_id) assignedNodeIds.add(String(c.node_id));
        }
      }
      controllerAssignmentStats.assigned = assignedNodeIds.size;
      controllerAssignmentStats.total = await resolveControllerAssignmentTotal(
        sessionId,
        customerId,
        assignedNodeIds.size
      );
    }

    const result = {
      ...session,
      cabinets,
      locations,
      controllerAssignmentStats
    };
    
    res.json(result);
  } catch (error) {
    console.error('Get session details error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Full session PDF (cabinets + diagnostics + node maintenance + PM notes)
router.post('/:sessionId/export-pdfs', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  const log = (msg, ...args) => console.log('[PM-PDF]', msg, ...args);
  const logErr = (msg, ...args) => console.error('[PM-PDF]', msg, ...args);
  log('Request received', { sessionId, time: new Date().toISOString() });

  const pptr = getPuppeteer();
  if (!pptr) {
    logErr('Puppeteer not available (packaged build or not installed)');
    return res.status(503).json({
      error: 'PDF export is not available',
      details: 'This installation cannot generate PDFs. Run the app from source (npm start) with puppeteer installed, or install Google Chrome or Microsoft Edge and use a full build that includes PDF support.'
    });
  }

  try {
    log('Loading session...');
    const session = await db.prepare(`
      SELECT s.*, c.name as customer_name
      FROM sessions s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.id = ?
    `).get([sessionId]);
    if (!session) {
      logErr('Session not found', sessionId);
      return res.status(404).json({ error: 'Session not found' });
    }
    if (session.session_type === 'ii') {
      logErr('Rejected: I&I session — use I&I export');
      return res.status(400).json({ error: 'Use I&I export for I&I sessions' });
    }
    log('Session loaded', { session_name: session.session_name, customer_name: session.customer_name });

    const sessionCabinets = await db.prepare(`
      SELECT c.* FROM cabinets c WHERE c.pm_session_id = ? ORDER BY c.created_at
    `).all([sessionId]);
    log('Cabinets loaded', { count: sessionCabinets.length });

    const sessionInfo = { id: session.id, session_name: session.session_name, status: session.status, customer_name: session.customer_name };

    // Build cabinet list with parsed JSON and enriched controllers
    const cabinets = [];
    for (const row of sessionCabinets) {
      let controllers = JSON.parse(row.controllers || '[]');
      for (let i = 0; i < controllers.length; i++) {
        if (controllers[i].node_id) {
          const nodeDetails = await db.prepare('SELECT * FROM nodes WHERE id = ?').get([controllers[i].node_id]);
          if (nodeDetails) {
            controllers[i] = {
              ...controllers[i],
              node_name: nodeDetails.node_name,
              model: nodeDetails.model,
              serial: nodeDetails.serial,
              firmware: nodeDetails.firmware,
              node_type: nodeDetails.node_type
            };
          }
        }
      }
      const inspection = (() => {
        try {
          const base = typeof row.inspection_data === 'string' ? JSON.parse(row.inspection_data || '{}') : (row.inspection_data || {});
          // Merge top-level comments column into inspection so PDF template finds it
          if (row.comments && row.comments.trim() && !base.comments) {
            base.comments = row.comments;
          }
          return base;
        } catch (_) { return {}; }
      })();
      cabinets.push({
        ...row,
        cabinet_type: row.cabinet_type || 'cabinet',
        power_supplies: JSON.parse(row.power_supplies || '[]'),
        distribution_blocks: JSON.parse(row.distribution_blocks || '[]'),
        diodes: JSON.parse(row.diodes || '[]'),
        media_converters: JSON.parse(row.media_converters || '[]'),
        power_injected_baseplates: JSON.parse(row.power_injected_baseplates || '[]'),
        network_equipment: JSON.parse(row.network_equipment || '[]'),
        controllers,
        workstations: JSON.parse(row.workstations || '[]'),
        inspection,
        comments: row.comments || '',
        rack_has_ups: Boolean(row.rack_has_ups),
        rack_has_hmi: Boolean(row.rack_has_hmi),
        rack_has_kvm: Boolean(row.rack_has_kvm),
        rack_has_monitor: Boolean(row.rack_has_monitor),
      });
    }

    // Node maintenance data: use same node source and synthetic ids as UI (nodes API) so maintByNode lookup matches saved node_id
    const ID_WORKSTATION = 1000000;
    const ID_CONTROLLER = 2000000;
    const ID_SWITCH = 3000000;
    const ID_CIOC = 4000000;
    let nodeMaintenanceData = [];
    if (session.customer_id) {
      const maintenanceRows = await db.prepare(`
        SELECT node_id, node_name, node_type, is_custom_node,
               dv_checked, os_checked, macafee_checked, free_time, redundancy_checked, cold_restart_checked, has_io_errors, hdd_replaced, performance_type, performance_value, hf_updated, firmware_updated_checked, notes, completed
        FROM session_node_maintenance WHERE session_id = ? AND COALESCE(deleted, 0) != 1
      `).all([sessionId]);
      const nodes = [];
      const ws = await db.prepare(`SELECT id, name as node_name, type as node_type, model, dell_service_tag_number as serial FROM sys_workstations WHERE customer_id = ? AND (deleted IS NULL OR deleted = 0)`).all([session.customer_id]);
      ws.forEach((n) => { n.id = ID_WORKSTATION + n.id; });
      const ctrl = await db.prepare(`SELECT id, name as node_name, 'Controller' as node_type, model, serial_number as serial, redundant, partner_serial_number FROM sys_controllers WHERE customer_id = ? AND (deleted IS NULL OR deleted = 0)`).all([session.customer_id]);
      ctrl.forEach((n) => { n.id = ID_CONTROLLER + n.id; });
      const sw = await db.prepare(`SELECT id, name as node_name, 'Smart Network Devices' as node_type, model, serial_number as serial, software_revision as firmware FROM sys_smart_switches WHERE customer_id = ? AND (deleted IS NULL OR deleted = 0)`).all([session.customer_id]);
      sw.forEach((n) => { n.id = ID_SWITCH + n.id; });
      const cioc = await db.prepare(`SELECT id, name as node_name, CASE WHEN LOWER(name) LIKE '%csls%' OR LOWER(name) LIKE '%charms logic solver%' OR LOWER(name) LIKE '%smart logic solver%' OR LOWER(model) LIKE '%csls%' OR LOWER(model) LIKE '%logic solver%' THEN 'CSLS' ELSE 'CIOC' END as node_type, model, serial_number as serial FROM sys_charms_io_cards WHERE customer_id = ? AND (deleted IS NULL OR deleted = 0)`).all([session.customer_id]);
      cioc.forEach((n) => { n.id = ID_CIOC + n.id; });
      nodes.push(...ws, ...ctrl, ...sw, ...cioc);
      // Include custom nodes from legacy nodes table (keep original id)
      const customNodes = await db.prepare(`
        SELECT n.id, n.node_name, n.node_type, n.model, n.serial
        FROM nodes n
        INNER JOIN session_node_maintenance m ON m.node_id = n.id
        WHERE m.session_id = ? AND m.is_custom_node = 1 AND COALESCE(m.deleted, 0) != 1
      `).all([sessionId]);
      const existingIds = new Set(nodes.map(n => String(n.id)));
      for (const cn of customNodes) {
        if (!existingIds.has(String(cn.id))) {
          nodes.push(cn);
          existingIds.add(String(cn.id));
        }
      }
      // Maintenance rows for custom/non-registry nodes (name stored on maintenance row)
      for (const m of maintenanceRows) {
        if (existingIds.has(String(m.node_id))) continue;
        if (!m.is_custom_node && !m.node_name) continue;
        nodes.push({
          id: m.node_id,
          node_name: m.node_name || `Node ${m.node_id}`,
          node_type: m.node_type || 'Unknown',
          model: null,
          serial: null,
        });
        existingIds.add(String(m.node_id));
      }
      const excludedIds = await getSessionExcludedNodeIds(sessionId);
      const excludedNameKeys = await getSessionExcludedNameKeys(sessionId);
      const reportNodes = finalizeNodesForReport(nodes, excludedIds, excludedNameKeys);
      const maintByNode = {};
      maintenanceRows.forEach(m => { maintByNode[m.node_id] = m; });
      nodeMaintenanceData = reportNodes.map(n => {
        const storedType = maintByNode[n.id]?.performance_type || null;
        const storedValue = maintByNode[n.id]?.performance_value ?? null;
        // Infer performance_type when missing or when value 1-5 was wrongly stored as free_time (perf index scale)
        let performance_type = storedType || 'free_time';
        if (!storedType || (storedType === 'free_time' && storedValue >= 1 && storedValue <= 5)) {
          const inferred = getDefaultPerformanceType(n);
          if (inferred) performance_type = inferred;
        }
        return {
          ...n,
          serial: n.serial ?? null,
          is_custom_node: Boolean(maintByNode[n.id]?.is_custom_node),
          dv_checked: Boolean(maintByNode[n.id]?.dv_checked),
          os_checked: Boolean(maintByNode[n.id]?.os_checked),
          macafee_checked: Boolean(maintByNode[n.id]?.macafee_checked),
          free_time: maintByNode[n.id]?.free_time || '',
          redundancy_checked: Boolean(maintByNode[n.id]?.redundancy_checked),
          cold_restart_checked: Boolean(maintByNode[n.id]?.cold_restart_checked),
          has_io_errors:
            maintByNode[n.id] === undefined
              ? true
              : maintByNode[n.id].has_io_errors == null
                ? true
                : Boolean(Number(maintByNode[n.id].has_io_errors)),
          hdd_replaced: Boolean(maintByNode[n.id]?.hdd_replaced),
          performance_type,
          performance_value: storedValue,
          hf_updated: Boolean(maintByNode[n.id]?.hf_updated),
          firmware_updated_checked: Boolean(maintByNode[n.id]?.firmware_updated_checked),
          notes: maintByNode[n.id]?.notes || '',
          completed: Boolean(maintByNode[n.id]?.completed),
        };
      });
    }

    const excludedNames = await getSessionExcludedControllerNames(sessionId);
    const diagnosticsRaw = await db.prepare(`
      SELECT * FROM session_diagnostics WHERE session_id = ? AND (deleted IS NULL OR deleted = 0) ORDER BY controller_name, card_number, channel_number
    `).all([sessionId]);
    const diagnostics = diagnosticsRaw.filter(
      (d) =>
        d.error_type !== 'io_card_slot' &&
        !isControllerNameExcluded(d.controller_name, excludedNames)
    );

    const pmNotesRow = await db.prepare(`
      SELECT * FROM session_pm_notes WHERE session_id = ? AND (deleted IS NULL OR deleted = 0) LIMIT 1
    `).get([sessionId]);

    // Fetch custom error types so the diagnostics report can show real labels
    const customErrorTypeRows = await db.prepare(
      `SELECT id, label, icon FROM custom_io_error_types WHERE (deleted IS NULL OR deleted = 0) ORDER BY id`
    ).all([]).catch(() => []);
    const customErrorLabels = {};
    (customErrorTypeRows || []).forEach((r) => {
      customErrorLabels[`custom_${r.id}`] = `${r.icon || '⚠️'} ${r.label}`;
    });

    // IO Subsystem: total IO = card channel counts + active charm count
    // Cards contribute their channel count (8 Ch = 8 IO points, 32 Ch = 32 IO points, etc.)
    // Each charm in sys_charms with real data = 1 active IO point
    // Active charms are any row that survived import (empty/Not-available placeholders are skipped at import time)
    let ioSubsystem = null;
    if (session.customer_id) {
      const cardRow = await db.prepare(
        'SELECT COALESCE(SUM(channel_count), 0) as total_channels FROM sys_cards WHERE customer_id = ?'
      ).get([session.customer_id]).catch(() => null);

      // Active charms: exclude empty/undefined slots (same logic as import-time filter)
      const charmRow = await db.prepare(`
        SELECT COUNT(*) as charm_count FROM sys_charms
        WHERE customer_id = ?
          AND (deleted IS NULL OR deleted = 0)
          AND model IS NOT NULL AND TRIM(model) != ''
          AND LOWER(TRIM(model)) NOT IN (
            'not available','no charm','none','undefined',
            'sis_chmio_undefined_charm','undefined_charm','uninstalled'
          )
          AND LOWER(TRIM(model)) NOT LIKE '%undefined_charm%'
          AND LOWER(TRIM(model)) NOT LIKE '%no charm%'
      `).get([session.customer_id]).catch(() => null);

      const totalChannels = (cardRow?.total_channels || 0) + (charmRow?.charm_count || 0);
      if (totalChannels > 0) {
        ioSubsystem = {
          totalChannels,
          cardChannels: cardRow?.total_channels || 0,
          charmCount: charmRow?.charm_count || 0,
          totalErrors: diagnostics.length
        };
      }
    }

    log('Building report sections (risk, maintenance, diagnostics, cabinets HTML)...');
    const riskResult = generateRiskAssessment(cabinets, nodeMaintenanceData);

    // ── DEBUG: dump full scoring breakdown to console ─────────────────────────
    log('');
    log('══════════════════════════════════════════════════════════════');
    log(`  RISK ASSESSMENT DEBUG — ${session.session_name}`);
    log('══════════════════════════════════════════════════════════════');
    log(`  Site Health Score : ${riskResult.siteScore} / 100`);
    log(`  Penalty Score     : ${riskResult.riskScore} / 100`);
    log(`  Risk Level (badge): ${riskResult.riskLevel}`);
    log(`  Total Components  : ${riskResult.totalComponents}`);
    log(`  Failed Components : ${riskResult.failedComponents}`);
    log(`  Coverage          : ${riskResult.coverageCompleted} / ${riskResult.coverageTotal} check-points`);
    log('');
    log('  Domain Scores (penalty 0=healthy, 100=all bad):');
    Object.entries(riskResult.domainScores || {}).forEach(([domain, val]) => {
      log(`    ${domain.padEnd(24)}: ${val === null ? 'not inspected' : val}`);
    });
    log('');
    if (riskResult.criticalIssues?.length) {
      log(`  CRITICAL issues (${riskResult.criticalIssues.length}):`);
      riskResult.criticalIssues.forEach(i => log(`    [CRITICAL] ${i}`));
    } else {
      log('  CRITICAL issues: none');
    }
    if (riskResult.warnings?.length) {
      log(`  MODERATE / Warning issues (${riskResult.warnings.length}):`);
      riskResult.warnings.forEach(i => log(`    [MODERATE] ${i}`));
    } else {
      log('  MODERATE issues: none');
    }
    if (riskResult.slightIssues?.length) {
      log(`  Advisory issues (${riskResult.slightIssues.length}):`);
      riskResult.slightIssues.forEach(i => log(`    [ADVISORY] ${i}`));
    } else {
      log('  Advisory issues: none');
    }
    log('');
    log('  Risk tier breakdown:', JSON.stringify(riskResult.riskBreakdown, null, 0));
    log('══════════════════════════════════════════════════════════════');
    log('');
    // ── END DEBUG ─────────────────────────────────────────────────────────────

    const riskAssessmentHtml = generateRiskAssessmentPage(riskResult, session.session_name, ioSubsystem);
    const maintenanceHtml = generateMaintenanceReportPage(nodeMaintenanceData);
    
    // Generate I/O Errors Summary (chart + Complete Error Log table, before cabinets)
    const dvSummaryHtml = generateDiagnosticsSummary(diagnostics, customErrorLabels);
    
    const cabinetsHtml = cabinets.map((cab, i) => generateSingleCabinetHtml(cab, sessionInfo, i + 1)).join('');
    
    // Generate professional cover page
    const coverPageHtml = generateCoverPage(sessionInfo, session.customer_name, session.completed_at || session.created_at);

    // Task label mapping — must match task IDs in PMNotes.jsx
    const taskLabels = {
      // Backups
      'backup_database':          'Database',
      'backup_sound':             'Sound',
      'backup_powerup':           'Power-up',
      'backup_charts':            'Charts',
      'backup_event_chronicle':   'Event Chronicle',
      'backup_srs':               'SRS',
      'backup_graphics':          'Graphics',
      'backup_maintenance_tool':  'Maintenance Tool',
      'backup_ddc':               'DDC',
      'backup_uploaded_sys_reg':  'Uploaded Sys Reg',
      // Cleaning
      'all_machines_blown_out':   'All machines blown out',
      'keyboards_cleaned':        'Keyboards cleaned',
      'monitors_cleaned':         'Monitors cleaned',
      // Legacy / other keys (kept for backward compatibility)
      'inspect_status_leds': 'Inspect Status LEDs',
      'clean_enclosure': 'Clean Enclosure',
      'test_fans': 'Test Fans',
      'check_power_supplies': 'Check Power Supplies',
      'test_controllers': 'Test Controllers',
      'update_firmware': 'Update Firmware',
      'document_changes': 'Document Changes',
      'backup_configuration': 'Backup Configuration',
      'inspect_network': 'Inspect Network',
      'inspect_wiring': 'Inspect Wiring',
      'check_temperatures': 'Check Temperatures',
      'inspect_terminals': 'Inspect Terminals',
    };
    // Fallback: format unknown task IDs by replacing underscores and title-casing
    const formatTaskLabel = (task) =>
      taskLabels[task] ||
      String(task).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    let pmNotesHtml = '';
    if (pmNotesRow && (pmNotesRow.common_tasks || pmNotesRow.additional_work_notes || pmNotesRow.troubleshooting_notes || pmNotesRow.recommendations_notes)) {
      const tasks = typeof pmNotesRow.common_tasks === 'string' ? JSON.parse(pmNotesRow.common_tasks || '[]') : (pmNotesRow.common_tasks || []);
      const formattedTasks = tasks.map(task => formatTaskLabel(task)).filter(t => t);
      
      pmNotesHtml = `
        <div class="page-break" style="page-break-before: always;">
          <h2 style="text-align: center; color: #2563eb; font-size: 28px; margin: 20px 0; padding: 15px; border-bottom: 3px solid #2563eb;">PM Notes</h2>
          
          <div style="margin: 30px 0;">
            ${formattedTasks.length > 0 ? `
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #0066cc; margin-bottom: 25px;">
              <h3 style="color: #0066cc; margin: 0 0 15px 0; font-size: 18px; font-weight: bold;">✓ Tasks Completed</h3>
              <ul style="margin: 0; padding-left: 25px; line-height: 1.8;">
                ${formattedTasks.map(task => `<li style="margin: 8px 0; color: #333;">${task}</li>`).join('')}
              </ul>
            </div>
            ` : ''}
            
            ${pmNotesRow.additional_work_notes ? `
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #0066cc; margin-bottom: 25px;">
              <h3 style="color: #0066cc; margin: 0 0 15px 0; font-size: 18px; font-weight: bold;">Additional Work</h3>
              <p style="margin: 0; line-height: 1.6; color: #333; white-space: pre-wrap;">${String(pmNotesRow.additional_work_notes).replace(/\n/g, '<br>')}</p>
            </div>
            ` : ''}
            
            ${pmNotesRow.troubleshooting_notes ? `
            <div style="background: #fff5f5; padding: 20px; border-radius: 8px; border-left: 4px solid #dc3545; margin-bottom: 25px;">
              <h3 style="color: #dc3545; margin: 0 0 15px 0; font-size: 18px; font-weight: bold;">⚠️ Troubleshooting</h3>
              <p style="margin: 0; line-height: 1.6; color: #333; white-space: pre-wrap;">${String(pmNotesRow.troubleshooting_notes).replace(/\n/g, '<br>')}</p>
            </div>
            ` : ''}
            
            ${pmNotesRow.recommendations_notes ? `
            <div style="background: #f0f8ff; padding: 20px; border-radius: 8px; border-left: 4px solid #17a2b8; margin-bottom: 25px;">
              <h3 style="color: #17a2b8; margin: 0 0 15px 0; font-size: 18px; font-weight: bold;">💡 Recommendations</h3>
              <p style="margin: 0; line-height: 1.6; color: #333; white-space: pre-wrap;">${String(pmNotesRow.recommendations_notes).replace(/\n/g, '<br>')}</p>
            </div>
            ` : ''}
          </div>
        </div>
      `;
    }

    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>PM Session Report - ${session.session_name}</title>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <style>
          body { font-family: Arial, sans-serif; font-size: 12px; line-height: 1.4; margin: 0; padding: 20px; color: #333; }
          .page-break { page-break-before: always; }
          .page-break:first-of-type { page-break-before: avoid; }
          .no-errors-section { text-align: center; padding: 24px; background: #f8f9fa; border-radius: 8px; border: 2px solid #28a745; }
          .no-errors-section .success-icon { font-size: 32px; margin-bottom: 8px; }
          .no-errors-section h2 { color: #28a745; margin: 8px 0; font-size: 18px; }
          ${getSharedStyles()}
        </style>
      </head>
      <body>
        ${coverPageHtml}
        ${riskAssessmentHtml}
        ${maintenanceHtml}
        ${dvSummaryHtml}
        ${pmNotesHtml}
        ${generateCabinetsSectionDividerPage()}
        ${cabinetsHtml}
      </body>
      </html>
    `;

    log('HTML built', { lengthKB: Math.round(fullHtml.length / 1024) });

    let chromePath;
    try {
      chromePath = await findChrome();
      log('Chrome path resolved', { path: chromePath || '(null)' });
      if (!chromePath) {
        logErr('Chrome not found. Install Chrome/Chromium or set PUPPETEER_EXECUTABLE_PATH.');
      }
    } catch (chromeErr) {
      logErr('findChrome failed', chromeErr.message);
      throw chromeErr;
    }

    log('Launching browser...');
    const browser = await pptr.launch({
      executablePath: chromePath,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-web-security'],
    });
    log('Browser launched');
    const page = await browser.newPage();
    const pdfTimeoutMs = 10 * 60 * 1000; // 10 minutes for large session reports
    page.setDefaultTimeout(pdfTimeoutMs);
    log('Setting page content (waitUntil: networkidle0, timeout: 10m)...');
    await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: pdfTimeoutMs });
    log('Page content set');
    // Wait for Chart.js to render (done in Node, not browser context, so pkg serialization is not an issue)
    await new Promise(r => setTimeout(r, 800));
    log('Generating PDF buffer...');
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
    });
    log('PDF generated', { sizeKB: Math.round(pdfBuffer.length / 1024) });
    await browser.close();
    log('Browser closed');

    const safeName = (session.session_name || 'Session').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="PM-Session-Report-${safeName}.pdf"`);
    res.send(pdfBuffer);
    log('Response sent OK');
  } catch (error) {
    logErr('FAILED', error.message);
    logErr('Stack:', error.stack);
    if (error.message && (error.message.includes('Could not find Chrome') || error.message.includes('executablePath') || error.message.includes('Failed to launch'))) {
      logErr('Hint: Chrome/Chromium may be missing on this machine, or set PUPPETEER_EXECUTABLE_PATH to your Chrome path.');
    }
    if (error.message && (error.message.includes('timeout') || error.message.includes('Timeout'))) {
      logErr('Hint: Page load or PDF render timed out; try again or reduce report size.');
    }
    console.error('Session export-pdfs error:', error);
    res.status(500).json({ error: 'PDF generation failed', details: error.message });
  }
});

// Complete PM session (optional body: { saveHistory: true } to record metrics for customer trend)
router.put('/:sessionId/complete', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  const saveHistory = !!(req.body && req.body.saveHistory);
  
  try {
    // First, get the session to find the customer ID and name
    const session = await db.prepare('SELECT id, customer_id, session_name FROM sessions WHERE id = ?').get([sessionId]);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Create snapshots of all nodes for this customer at completion time
    // Pull from BOTH legacy nodes table AND sys_* tables for comprehensive snapshot
    const legacyNodes = await db.prepare(`
      SELECT n.*, c.cabinet_name as assigned_cabinet_name
      FROM nodes n
      LEFT JOIN cabinets c ON n.assigned_cabinet_id = c.id
      WHERE n.customer_id = ?
      ORDER BY n.node_type, n.node_name
    `).all([session.customer_id]);
    
    // Same id ranges as GET /nodes so snapshot original_node_id matches maintenance node_id (avoids note collision across Controller vs Computer)
    const ID_WORKSTATION = 1000000;
    const ID_CONTROLLER = 2000000;
    const ID_SWITCH = 3000000;
    const ID_CIOC = 4000000;

    // Also get nodes from sys_* tables (the real source of truth)
    const sysControllers = await db.prepare(`
      SELECT ctrl.id, ctrl.name as node_name, 'Controller' as node_type, ctrl.model,
             ctrl.serial_number as serial, ctrl.software_revision as firmware, ctrl.hardware_revision as version,
             'active' as status, ctrl.redundant, ctrl.assigned_cabinet_id,
             c.cabinet_name as assigned_cabinet_name
      FROM sys_controllers ctrl
      LEFT JOIN cabinets c ON ctrl.assigned_cabinet_id = c.id
      WHERE ctrl.customer_id = ?
    `).all([session.customer_id]);
    sysControllers.forEach((n) => { n.id = ID_CONTROLLER + n.id; });

    const sysCiocs = await db.prepare(`
      SELECT cioc.id, cioc.name as node_name,
        CASE WHEN LOWER(cioc.name) LIKE '%csls%' OR LOWER(cioc.name) LIKE '%charms logic solver%' OR LOWER(cioc.name) LIKE '%smart logic solver%' OR LOWER(cioc.model) LIKE '%csls%' OR LOWER(cioc.model) LIKE '%logic solver%' THEN 'CSLS' ELSE 'CIOC' END as node_type,
        cioc.model,
             cioc.serial_number as serial, cioc.software_revision as firmware, cioc.hardware_revision as version,
             'active' as status, cioc.redundant, cioc.assigned_cabinet_id,
             c.cabinet_name as assigned_cabinet_name
      FROM sys_charms_io_cards cioc
      LEFT JOIN cabinets c ON cioc.assigned_cabinet_id = c.id
      WHERE cioc.customer_id = ?
    `).all([session.customer_id]);
    sysCiocs.forEach((n) => { n.id = ID_CIOC + n.id; });

    const sysWorkstations = await db.prepare(`
      SELECT ws.id, ws.name as node_name, ws.type as node_type, ws.model,
             ws.dell_service_tag_number as serial, ws.software_revision as firmware, ws.dv_hotfixes as version,
             'active' as status, ws.redundant, ws.assigned_cabinet_id, ws.os_name, ws.bios_version,
             c.cabinet_name as assigned_cabinet_name
      FROM sys_workstations ws
      LEFT JOIN cabinets c ON ws.assigned_cabinet_id = c.id
      WHERE ws.customer_id = ?
    `).all([session.customer_id]);
    sysWorkstations.forEach((n) => { n.id = ID_WORKSTATION + n.id; });

    const sysSwitches = await db.prepare(`
      SELECT sw.id, sw.name as node_name, 'Smart Switch' as node_type, sw.model,
             sw.serial_number as serial, sw.software_revision as firmware, sw.hardware_revision as version,
             'active' as status, sw.assigned_cabinet_id,
             c.cabinet_name as assigned_cabinet_name
      FROM sys_smart_switches sw
      LEFT JOIN cabinets c ON sw.assigned_cabinet_id = c.id
      WHERE sw.customer_id = ?
    `).all([session.customer_id]);
    sysSwitches.forEach((n) => { n.id = ID_SWITCH + n.id; });

    // Combine all nodes, preferring sys_* tables, deduplicating by name
    const seenNames = new Set();
    const allNodes = [...sysControllers, ...sysCiocs, ...sysWorkstations, ...sysSwitches, ...legacyNodes];

    for (const node of allNodes) {
      const key = `${node.node_name}-${node.node_type}`;
      if (seenNames.has(key)) continue;
      seenNames.add(key);
      
      try {
        await db.prepare(`
          INSERT OR REPLACE INTO session_node_snapshots (
            session_id, original_node_id, node_name, node_type, model, description, 
            serial, firmware, version, status, redundant, os_name, os_service_pack,
            bios_version, oem_type_description, assigned_cabinet_name
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run([
          sessionId,
          node.id || node.original_node_id,
          node.node_name,
          node.node_type || 'Unknown',
          node.model,
          node.description || null,
          node.serial,
          node.firmware,
          node.version,
          node.status || 'active',
          node.redundant,
          node.os_name || null,
          node.os_service_pack || null,
          node.bios_version || null,
          node.oem_type_description || null,
          node.assigned_cabinet_name || null
        ]);
      } catch (snapshotError) {
        console.error('Error creating node snapshot:', snapshotError);
      }
    }
    
    // Mark the session as completed and mark as unsynced so it syncs to other devices
    const result = await db.prepare('UPDATE sessions SET status = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, synced = 0 WHERE id = ?').run(['completed', sessionId]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Mark all cabinets in this session as completed
    await db.prepare('UPDATE cabinets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE pm_session_id = ?').run(['completed', sessionId]);
    
    // Optionally save metrics to customer history for trend over time
    if (saveHistory && session.customer_id) {
      try {
        const sessionCabinets = await db.prepare('SELECT * FROM cabinets WHERE pm_session_id = ? ORDER BY created_at').all([sessionId]);
        const cabinets = sessionCabinets.map((row) => {
          const inspection = (() => {
            try {
              return typeof row.inspection_data === 'string' ? JSON.parse(row.inspection_data || '{}') : (row.inspection_data || {});
            } catch (_) { return {}; }
          })();
          let controllers = JSON.parse(row.controllers || '[]');
          return {
            cabinet_name: row.cabinet_name || row.cabinet_location,
            cabinet_location: row.cabinet_location,
            power_supplies: JSON.parse(row.power_supplies || '[]'),
            distribution_blocks: JSON.parse(row.distribution_blocks || '[]'),
            diodes: JSON.parse(row.diodes || '[]'),
            media_converters: JSON.parse(row.media_converters || '[]'),
            power_injected_baseplates: JSON.parse(row.power_injected_baseplates || '[]'),
            network_equipment: JSON.parse(row.network_equipment || '[]'),
            controllers,
            workstations: JSON.parse(row.workstations || '[]'),
            inspection,
          };
        });
        const maintenanceRows = await db.prepare(`
          SELECT node_id, dv_checked, os_checked, macafee_checked, free_time, redundancy_checked, cold_restart_checked, has_io_errors, hdd_replaced, performance_type, performance_value, hf_updated, firmware_updated_checked, notes, completed
          FROM session_node_maintenance WHERE session_id = ? AND COALESCE(deleted, 0) != 1
        `).all([sessionId]);
        const nodes = [];
        const histWs = await db.prepare('SELECT id, name as node_name, type as node_type, model FROM sys_workstations WHERE customer_id = ? AND COALESCE(deleted,0)!=1').all([session.customer_id]);
        histWs.forEach((n) => { n.id = ID_WORKSTATION + n.id; });
        const histCtrl = await db.prepare("SELECT id, name as node_name, 'Controller' as node_type, model FROM sys_controllers WHERE customer_id = ? AND COALESCE(deleted,0)!=1").all([session.customer_id]);
        histCtrl.forEach((n) => { n.id = ID_CONTROLLER + n.id; });
        const histSw = await db.prepare("SELECT id, name as node_name, 'Smart Network Devices' as node_type, model FROM sys_smart_switches WHERE customer_id = ? AND COALESCE(deleted,0)!=1").all([session.customer_id]);
        histSw.forEach((n) => { n.id = ID_SWITCH + n.id; });
        const histCioc = await db.prepare("SELECT id, name as node_name, CASE WHEN LOWER(name) LIKE '%csls%' OR LOWER(name) LIKE '%charms logic solver%' OR LOWER(name) LIKE '%smart logic solver%' OR LOWER(model) LIKE '%csls%' OR LOWER(model) LIKE '%logic solver%' THEN 'CSLS' ELSE 'CIOC' END as node_type, model FROM sys_charms_io_cards WHERE customer_id = ? AND COALESCE(deleted,0)!=1").all([session.customer_id]);
        histCioc.forEach((n) => { n.id = ID_CIOC + n.id; });
        nodes.push(...histWs, ...histCtrl, ...histSw, ...histCioc);
        // Include custom nodes from legacy nodes table
        const histCustomNodes = await db.prepare(`
          SELECT n.id, n.node_name, n.node_type, n.model
          FROM nodes n
          INNER JOIN session_node_maintenance m ON m.node_id = n.id
          WHERE m.session_id = ? AND m.is_custom_node = 1 AND COALESCE(m.deleted, 0) != 1
        `).all([sessionId]);
        const histExistingIds = new Set(nodes.map(n => String(n.id)));
        for (const cn of histCustomNodes) {
          if (!histExistingIds.has(String(cn.id))) nodes.push(cn);
        }
        const excludedIds = await getSessionExcludedNodeIds(sessionId);
        const excludedNameKeys = await getSessionExcludedNameKeys(sessionId);
        const reportNodes = finalizeNodesForReport(nodes, excludedIds, excludedNameKeys);
        const maintByNode = {};
        maintenanceRows.forEach((m) => { maintByNode[m.node_id] = m; });
        const nodeMaintenanceData = reportNodes.map((n) => {
          const storedType = maintByNode[n.id]?.performance_type || null;
          const storedValue = maintByNode[n.id]?.performance_value ?? null;
          let performance_type = storedType || 'free_time';
          if (!storedType || (storedType === 'free_time' && storedValue >= 1 && storedValue <= 5)) {
            const inferred = getDefaultPerformanceType(n);
            if (inferred) performance_type = inferred;
          }
          return {
            ...n,
            dv_checked: Boolean(maintByNode[n.id]?.dv_checked),
            os_checked: Boolean(maintByNode[n.id]?.os_checked),
            macafee_checked: Boolean(maintByNode[n.id]?.macafee_checked),
            free_time: maintByNode[n.id]?.free_time || '',
            redundancy_checked: Boolean(maintByNode[n.id]?.redundancy_checked),
            cold_restart_checked: Boolean(maintByNode[n.id]?.cold_restart_checked),
            has_io_errors:
            maintByNode[n.id] === undefined
              ? true
              : maintByNode[n.id].has_io_errors == null
                ? true
                : Boolean(Number(maintByNode[n.id].has_io_errors)),
            hdd_replaced: Boolean(maintByNode[n.id]?.hdd_replaced),
            performance_type,
            performance_value: storedValue,
            hf_updated: Boolean(maintByNode[n.id]?.hf_updated),
            firmware_updated_checked: Boolean(maintByNode[n.id]?.firmware_updated_checked),
            notes: maintByNode[n.id]?.notes || '',
            completed: Boolean(maintByNode[n.id]?.completed),
          };
        });
        const riskResult = generateRiskAssessment(cabinets, nodeMaintenanceData);
        const excludedNamesHist = await getSessionExcludedControllerNames(sessionId);
        const diagRows = await db.prepare(
          'SELECT controller_name FROM session_diagnostics WHERE session_id = ? AND (deleted IS NULL OR deleted = 0)'
        ).all([sessionId]);
        const diagCount = {
          c: diagRows.filter(
            (d) => !isControllerNameExcluded(d.controller_name, excludedNamesHist)
          ).length,
        };
        const metricUuid = syncFieldsForInsert('customer_metric_history').uuid;
        await db.prepare(`
          INSERT INTO customer_metric_history (customer_id, session_id, session_name, recorded_at, error_count, risk_score, risk_level, total_components, failed_components, cabinet_count, domain_scores, coverage_completed, coverage_total, uuid, synced)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `).run([
          session.customer_id,
          sessionId,
          session.session_name || '',
          diagCount?.c ?? 0,
          riskResult.siteScore ?? 100,
          riskResult.riskLevel || '',
          riskResult.totalComponents ?? 0,
          riskResult.failedComponents ?? 0,
          cabinets.length,
          riskResult.domainScores ? JSON.stringify(riskResult.domainScores) : null,
          riskResult.coverageCompleted ?? 0,
          riskResult.coverageTotal ?? 0,
          metricUuid,
        ]);
      } catch (histErr) {
        console.error('Error saving customer metric history:', histErr);
      }
    }
    
    res.json({ success: true, message: 'Session marked as completed', savedToHistory: saveHistory });
  } catch (error) {
    console.error('Complete session error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Duplicate PM session
router.post('/:sessionId/duplicate', requireAuth, async (req, res) => {
  const sourceSessionId = req.params.sessionId;
  let { session_name } = req.body;
  const newSessionId = uuidv4();
  
  try {
    console.log('🔄 DUPLICATE SESSION DEBUG - Starting duplication');
    console.log('📋 Source Session ID:', sourceSessionId);
    
    // Get source session
    const sourceSession = await db.prepare('SELECT * FROM sessions WHERE id = ?').get([sourceSessionId]);
    if (!sourceSession) {
      console.log('❌ Source session not found');
      return res.status(404).json({ error: 'Source session not found' });
    }
    
    console.log('✅ Source session found:', sourceSession.session_name);
    
    if (!session_name || String(session_name).trim() === '') {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      const m = d.getMonth() + 1;
      const day = d.getDate();
      const yr = d.getFullYear();
      const tail = `${m}/${day}/${yr}`;
      const src = String(sourceSession.session_name || '').trim();
      const li = src.match(/^(.+?)\s+I&I-\d{1,2}\/\d{1,2}\/\d{4}$/i);
      const lp = src.match(/^(.+?)\s+PM-\d{1,2}\/\d{1,2}\/\d{4}$/i);
      if (li) session_name = `${li[1].trim()} I&I-${tail}`;
      else if (lp) session_name = `${lp[1].trim()} PM-${tail}`;
      else if (/^I&I-\d{1,2}\/\d{1,2}\/\d{4}$/i.test(src)) session_name = `I&I-${tail}`;
      else if (/^PM-\d{1,2}\/\d{1,2}\/\d{4}$/i.test(src)) session_name = `PM-${tail}`;
      else {
        const replaced = src.replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/, tail);
        session_name = replaced !== src ? replaced : `${src}-${tail}`;
      }
    }
    
    console.log('📋 New Session Name:', session_name);
    console.log('📋 New Session ID:', newSessionId);
    
    const newSessionUuid = uuidv4();
    
    // Create new session (uuid + synced=0 required for cloud push)
    await db.prepare(
      'INSERT INTO sessions (id, customer_id, user_id, session_name, status, uuid, synced) VALUES (?, ?, ?, ?, ?, ?, 0)'
    ).run([
      newSessionId,
      sourceSession.customer_id,
      req.session.userId,
      session_name,
      'active',
      newSessionUuid,
    ]);
    
    console.log('✅ New session created');
    
    // Duplicate locations (cabinet_names) for the new session and build a remap
    let sourceLocations = [];
    try {
      sourceLocations = await db.prepare('SELECT * FROM cabinet_names WHERE session_id = ? AND (deleted = 0 OR deleted IS NULL) ORDER BY sort_order, location_name').all([sourceSessionId]);
    } catch (e) {
      // Fallback if deleted column doesn't exist
      try {
        sourceLocations = await db.prepare('SELECT * FROM cabinet_names WHERE session_id = ? ORDER BY sort_order, location_name').all([sourceSessionId]);
      } catch (e2) { console.error('Error loading locations:', e2.message); }
    }
    const locationIdMap = {}; // old location ID -> new location ID
    
    for (const loc of sourceLocations) {
      const newLocationId = uuidv4();
      locationIdMap[loc.id] = newLocationId;
      
      await db.prepare(`
        INSERT INTO cabinet_names (id, session_id, location_name, description, is_collapsed, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run([newLocationId, newSessionId, loc.location_name, loc.description || '', loc.is_collapsed || 0, loc.sort_order || 0]);
    }
    
    console.log('📍 Duplicated', sourceLocations.length, 'locations');
    
    // Get all cabinets from source session
    const sourceCabinets = await db.prepare('SELECT * FROM cabinets WHERE pm_session_id = ?').all([sourceSessionId]);
    console.log('📦 Found', sourceCabinets.length, 'cabinets to duplicate');
    
    // Copy each cabinet and its controller assignments
    for (const sourceCabinet of sourceCabinets) {
      const newCabinetId = uuidv4();
      
      console.log('📦 Duplicating cabinet:', sourceCabinet.cabinet_name);
      console.log('📦 Source cabinet ID:', sourceCabinet.id);
      console.log('📦 New cabinet ID:', newCabinetId);
      console.log('📦 Source controllers JSON:', sourceCabinet.controllers);

      // Parse power supplies — preserve structural fields/comments/ids; clear readings for fresh PM
      let powerSupplies = [];
      if (sourceCabinet.power_supplies) {
        try {
          const sourcePowerSupplies = JSON.parse(sourceCabinet.power_supplies);
          powerSupplies = sourcePowerSupplies.map((ps) => ({
            ...ps,
            dc_reading: '',
            line_neutral: '',
            line_ground: '',
            neutral_ground: '',
            status: 'pass',
          }));
        } catch (_) {
          powerSupplies = [];
        }
      }

      // Distribution blocks — keep labels/metadata; clear DC readings / status for new session
      let distributionBlocksStr = sourceCabinet.distribution_blocks || '[]';
      try {
        const distArr = JSON.parse(sourceCabinet.distribution_blocks || '[]');
        if (Array.isArray(distArr)) {
          distributionBlocksStr = JSON.stringify(
            distArr.map((b) => ({ ...b, dc_reading: '', status: 'pass' }))
          );
        }
      } catch (_) { /* keep original string */ }

      // Diodes — preserve names and voltage selector; clear readings
      let diodesJson = '[]';
      if (sourceCabinet.diodes) {
        try {
          const sourceDiodes = JSON.parse(sourceCabinet.diodes);
          diodesJson = JSON.stringify(
            sourceDiodes.map((diode) => ({
              ...diode,
              dc_reading: '',
              status: 'pass',
            }))
          );
        } catch (_) {
          diodesJson = '[]';
        }
      }

      // Media converters / carrier-baseplates — copy through with readings cleared (were missing from INSERT entirely)
      let mediaConvertersJson = '[]';
      if (sourceCabinet.media_converters) {
        try {
          const mcs = JSON.parse(sourceCabinet.media_converters);
          mediaConvertersJson = JSON.stringify(
            mcs.map((mc) => ({
              ...mc,
              dc_reading: '',
              status: 'pass',
            }))
          );
        } catch (_) {
          mediaConvertersJson = '[]';
        }
      }

      let powerInjectedBaseplatesJson = '[]';
      if (sourceCabinet.power_injected_baseplates) {
        try {
          const pibs = JSON.parse(sourceCabinet.power_injected_baseplates);
          powerInjectedBaseplatesJson = JSON.stringify(
            pibs.map((pib) => ({
              ...pib,
              dc_reading: '',
              status: 'pass',
            }))
          );
        } catch (_) {
          powerInjectedBaseplatesJson = '[]';
        }
      }

      // Clear inspection data but keep pass/fail structure reset to pass
      let inspectionData = '{}';
      if (sourceCabinet.inspection_data) {
        try {
          const srcInspection = JSON.parse(sourceCabinet.inspection_data);
          // Reset all pass/fail fields to 'pass', clear notes
          const resetInspection = {};
          for (const [key, value] of Object.entries(srcInspection)) {
            if (typeof value === 'string' && (value === 'pass' || value === 'fail')) {
              resetInspection[key] = 'pass';
            } else if (key.includes('notes') || key.includes('comment')) {
              resetInspection[key] = '';
            } else {
              resetInspection[key] = value; // Keep structural fields
            }
          }
          inspectionData = JSON.stringify(resetInspection);
        } catch (e) { /* keep as {} */ }
      }

      // Create new cabinet - include cabinet_type, workstations, media converters, carrier/baseplates
      await db.prepare(`
        INSERT INTO cabinets (
          id, pm_session_id, cabinet_name, cabinet_type, status,
          power_supplies, distribution_blocks, diodes, media_converters, power_injected_baseplates,
          network_equipment,
          inspection_data, controllers, workstations, location_id, uuid, synced, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run([
        newCabinetId,
        newSessionId,
        sourceCabinet.cabinet_name,
        sourceCabinet.cabinet_type || 'cabinet', // Keep cabinet type
        'active', // Reset status to active
        JSON.stringify(powerSupplies),
        distributionBlocksStr,
        diodesJson,
        mediaConvertersJson,
        powerInjectedBaseplatesJson,
        sourceCabinet.network_equipment, // Keep network equipment
        inspectionData, // Reset inspection data
        sourceCabinet.controllers, // Keep controller assignments
        sourceCabinet.workstations || '[]', // Keep workstation assignments
        sourceCabinet.location_id ? (locationIdMap[sourceCabinet.location_id] || sourceCabinet.location_id) : null, // Remap to new location ID
        newCabinetId,
      ]);
      
      console.log('✅ Cabinet created in database');
      
      // Re-assign nodes to the NEW cabinet in sys_* tables
      // Node IDs stored in cabinet JSON are frontend offset IDs (workstation +1M, controller +2M,
      // switch +3M, cioc +4M). Strip the offset before writing to sys_* tables.
      const NODE_OFFSETS = {
        workstation: 1000000,
        controller:  2000000,
        switch:      3000000,
        cioc:        4000000,
      };
      function rawIdForCategory(nodeId, nodeCategory) {
        const offset = NODE_OFFSETS[nodeCategory];
        if (offset && nodeId > offset) return nodeId - offset;
        return nodeId; // unknown category or already raw
      }

      async function reassignNodeToNewCabinet(nodeId, newCabId, nodeCategory) {
        const tablePriority = {
          'controller': 'sys_controllers',
          'cioc': 'sys_charms_io_cards',
          'switch': 'sys_smart_switches',
          'workstation': 'sys_workstations'
        };

        const rawId = rawIdForCategory(nodeId, nodeCategory);

        // Try the priority table first using the raw (non-offset) ID
        if (nodeCategory && tablePriority[nodeCategory]) {
          try {
            const r = await db.prepare(`UPDATE ${tablePriority[nodeCategory]} SET assigned_cabinet_id = ?, assigned_at = CURRENT_TIMESTAMP WHERE id = ?`).run([newCabId, rawId]);
            if (r.changes > 0) return;
          } catch (e) { /* try others */ }
        }
        
        // Try all sys_* tables with raw ID
        const allTables = ['sys_controllers', 'sys_charms_io_cards', 'sys_smart_switches', 'sys_workstations'];
        for (const table of allTables) {
          try {
            const r = await db.prepare(`UPDATE ${table} SET assigned_cabinet_id = ?, assigned_at = CURRENT_TIMESTAMP WHERE id = ?`).run([newCabId, rawId]);
            if (r.changes > 0) return;
          } catch (e) { /* skip */ }
        }
        
        // Fallback to legacy nodes table (legacy IDs are not offset)
        try {
          await db.prepare('UPDATE nodes SET assigned_cabinet_id = ?, assigned_at = CURRENT_TIMESTAMP WHERE id = ?').run([newCabId, nodeId]);
        } catch (e) { /* skip */ }
      }
      
      // Reassign controllers
      if (sourceCabinet.controllers) {
        try {
          const controllers = JSON.parse(sourceCabinet.controllers);
          for (const controller of controllers) {
            if (controller.node_id) {
              await reassignNodeToNewCabinet(controller.node_id, newCabinetId, controller.node_category || 'controller');
              console.log('✅ Controller reassigned:', controller.node_id);
            }
          }
        } catch (e) {
          console.error('Error reassigning controllers:', e.message);
        }
      }
      
      // Reassign workstations
      if (sourceCabinet.workstations) {
        try {
          const workstations = JSON.parse(sourceCabinet.workstations);
          for (const ws of workstations) {
            if (ws.node_id) {
              await reassignNodeToNewCabinet(ws.node_id, newCabinetId, ws.node_category || 'workstation');
              console.log('✅ Workstation reassigned:', ws.node_id);
            }
          }
        } catch (e) {
          console.error('Error reassigning workstations:', e.message);
        }
      }
      
      // Reassign network equipment/switches from JSON
      if (sourceCabinet.network_equipment) {
        try {
          const netEquip = JSON.parse(sourceCabinet.network_equipment);
          // Network equipment can be an array of switch objects
          const switches = Array.isArray(netEquip) ? netEquip : (netEquip.switches || []);
          for (const sw of switches) {
            if (sw.node_id) {
              await reassignNodeToNewCabinet(sw.node_id, newCabinetId, sw.node_category || 'switch');
              console.log('✅ Switch reassigned:', sw.node_id);
            }
          }
        } catch (e) {
          // network_equipment might not be JSON array of assigned nodes
        }
      }
    }
    
    // Clear all node maintenance / troubleshooting data (DO NOT copy)
    // Diagnostics (I/O errors) are also NOT copied - start fresh
    // Node maintenance will be created fresh when the user opens nodes in the new session
    console.log('🧹 Skipping node maintenance and diagnostics copy (cleared for new session)');
    
    // Get the new session data and compute controller assignment stats (so UI shows correct count)
    const newSession = await db.prepare(`
      SELECT s.*, c.name as customer_name, c.location
      FROM sessions s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.id = ?
    `).get([newSessionId]);
    const newCabinets = await db.prepare('SELECT id FROM cabinets WHERE pm_session_id = ?').all([newSessionId]);
    const newCabinetIds = newCabinets.map(c => c.id);
    let controllerAssignmentStats = { assigned: 0, total: 0 };
    const custId = newSession.customer_id;
    if (custId && newCabinetIds.length > 0) {
      try {
        const placeholders = newCabinetIds.map(() => '?').join(',');
        const ctrlAssigned = await db.prepare(`SELECT COUNT(*) as count FROM sys_controllers WHERE customer_id = ? AND assigned_cabinet_id IN (${placeholders})`).get([custId, ...newCabinetIds]);
        const ciocAssigned = await db.prepare(`SELECT COUNT(*) as count FROM sys_charms_io_cards WHERE customer_id = ? AND assigned_cabinet_id IN (${placeholders})`).get([custId, ...newCabinetIds]);
        controllerAssignmentStats.assigned = (ctrlAssigned?.count ?? 0) + (ciocAssigned?.count ?? 0);
      } catch (e) { /* ignore */ }
    }
    controllerAssignmentStats.total = await resolveControllerAssignmentTotal(
      newSessionId,
      custId,
      controllerAssignmentStats.assigned
    );
    
    console.log('✅ DUPLICATE SESSION COMPLETED');
    console.log('📋 New session data:', newSession);
    
    res.json({ 
      success: true, 
      session: { ...newSession, controllerAssignmentStats },
      message: 'Session duplicated successfully'
    });
  } catch (error) {
    console.error('❌ DUPLICATE SESSION ERROR:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Add custom node for session
router.post('/:sessionId/custom-node', requireAuth, async (req, res) => {
  const { sessionId } = req.params;
  const { node_name, node_type, model, serial, customer_id } = req.body;
  
  try {
    console.log('Adding custom node:', { sessionId, node_name, node_type, customer_id });
    
    // Check if node with this name already exists for this customer
    const existingNode = await db.prepare(`
      SELECT * FROM nodes WHERE customer_id = ? AND node_name = ?
    `).get([customer_id, node_name]);
    
    let nodeId;
    
    if (existingNode) {
      // Node already exists, just link it to this session
      nodeId = existingNode.id;
      console.log('Node already exists, using existing node ID:', nodeId);
    } else {
      const { uuid: nodeUuid } = syncFieldsForInsert('nodes');
      const result = await db.prepare(`
        INSERT INTO nodes (customer_id, node_name, node_type, model, serial, description, uuid, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      `).run([customer_id, node_name, node_type, model || '', serial || '', 'Custom node added during PM', nodeUuid]);
      
      nodeId = result.lastInsertRowid;
      console.log('Created new node with ID:', nodeId);
    }
    
    // Check if maintenance entry already exists
    const existingMaintenance = await db.prepare(`
      SELECT * FROM session_node_maintenance WHERE session_id = ? AND node_id = ?
    `).get([sessionId, nodeId]);
    
    if (!existingMaintenance) {
      // Create a maintenance entry for this node and session
      await db.prepare(`
        INSERT INTO session_node_maintenance (session_id, node_id, is_custom_node, uuid, synced)
        VALUES (?, ?, 1, ?, 0)
      `).run([sessionId, nodeId, uuidv4()]);
      console.log('Created maintenance entry for node:', nodeId);
    } else {
      console.log('Maintenance entry already exists');
    }
    
    // Return the node
    const newNode = await db.prepare(`
      SELECT * FROM nodes WHERE id = ?
    `).get([nodeId]);
    
    console.log('Returning node:', newNode);
    res.json(newNode);
  } catch (error) {
    console.error('Error adding custom node:', error);
    res.status(500).json({ error: 'Failed to add custom node: ' + error.message });
  }
});

// List equipment removed from this PM session (for restore UI)
router.get('/:sessionId/removed-nodes', requireAuth, async (req, res) => {
  const { sessionId } = req.params;
  try {
    const rows = await db.prepare(`
      SELECT node_id, node_name, node_type, is_custom_node, updated_at
      FROM session_node_maintenance
      WHERE session_id = ? AND COALESCE(deleted, 0) = 1
      ORDER BY COALESCE(node_name, ''), node_id
    `).all([sessionId]);

    const byName = new Map();
    for (const row of rows) {
      let name = row.node_name;
      if (!name || !String(name).trim()) {
        name = (await resolveNodeNameById(row.node_id)) || `Node ${row.node_id}`;
      }
      const key = normalizeNodeNameKey(name) || String(name).trim().toLowerCase();
      const candidate = {
        node_id: row.node_id,
        node_name: name,
        node_type: row.node_type || null,
        is_custom_node: Boolean(row.is_custom_node),
        updated_at: row.updated_at,
      };
      const prev = byName.get(key);
      if (!prev) {
        byName.set(key, candidate);
        continue;
      }
      // Prefer registry (non-custom / higher synthetic id) so restore brings back the real node
      const prevScore = (prev.is_custom_node ? 0 : 2) + (Number(prev.node_id) >= ID_WORKSTATION ? 1 : 0);
      const nextScore = (candidate.is_custom_node ? 0 : 2) + (Number(candidate.node_id) >= ID_WORKSTATION ? 1 : 0);
      if (nextScore > prevScore) byName.set(key, candidate);
    }
    res.json([...byName.values()]);
  } catch (error) {
    console.error('List removed session nodes error:', error);
    res.status(500).json({ error: 'Failed to list removed nodes' });
  }
});

// Restore equipment previously removed from this PM session
router.post('/:sessionId/session-node/:nodeId/restore', requireAuth, async (req, res) => {
  const { sessionId, nodeId } = req.params;
  const nid = parseInt(nodeId, 10);
  if (Number.isNaN(nid)) {
    return res.status(400).json({ error: 'Invalid node id' });
  }

  try {
    if (await isSessionCompleted(sessionId)) {
      return res.status(403).json({ error: 'Cannot modify nodes — PM session is completed' });
    }

    const existing = await db.prepare(`
      SELECT * FROM session_node_maintenance WHERE session_id = ? AND node_id = ?
    `).get([sessionId, nid]);

    if (!existing || Number(existing.deleted) !== 1) {
      return res.status(404).json({ error: 'Removed node not found for this session' });
    }

    let nodeName = existing.node_name || (await resolveNodeNameById(nid));

    // Restore this node and any same-named tombstones (custom ↔ registry twins)
    if (nodeName && String(nodeName).trim()) {
      const nameKey = normalizeNodeNameKey(nodeName);
      const tombstones = await db.prepare(`
        SELECT node_id, node_name FROM session_node_maintenance
        WHERE session_id = ? AND COALESCE(deleted, 0) = 1
      `).all([sessionId]);
      for (const row of tombstones) {
        const matchId = Number(row.node_id) === nid;
        const matchName = normalizeNodeNameKey(row.node_name) === nameKey;
        if (!matchId && !matchName) continue;
        await db.prepare(`
          UPDATE session_node_maintenance
          SET deleted = 0, synced = 0, updated_at = CURRENT_TIMESTAMP
          WHERE session_id = ? AND node_id = ?
        `).run([sessionId, row.node_id]);
      }
    } else {
      await db.prepare(`
        UPDATE session_node_maintenance
        SET deleted = 0, synced = 0, updated_at = CURRENT_TIMESTAMP
        WHERE session_id = ? AND node_id = ?
      `).run([sessionId, nid]);
    }

    // If it was a soft-deleted custom nodes row, revive it
    if (existing.is_custom_node || nid < ID_WORKSTATION) {
      await db.prepare(`
        UPDATE nodes SET deleted = 0, synced = 0, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND COALESCE(deleted, 0) = 1
      `).run([nid]);
    }

    res.json({
      success: true,
      message: 'Equipment restored to session',
      node_id: nid,
      node_name: nodeName || null,
    });
  } catch (error) {
    console.error('Restore session node error:', error);
    res.status(500).json({ error: 'Failed to restore node to session' });
  }
});

// Remove a node from this PM session (registry or custom). Soft-deletes maintenance row
// and same-named siblings so custom/registry duplicates do not bounce back.
router.delete('/:sessionId/session-node/:nodeId', requireAuth, async (req, res) => {
  const { sessionId, nodeId } = req.params;
  const nid = parseInt(nodeId, 10);
  const hint = {
    node_name: req.body?.node_name || req.query?.node_name || null,
    node_type: req.body?.node_type || req.query?.node_type || null,
    is_custom_node: req.body?.is_custom_node,
  };

  // Legacy synthetic ids (e.g. io-DVNET002) are not numeric — exclude by name only
  if (Number.isNaN(nid)) {
    const name = hint.node_name || String(nodeId).replace(/^io-/i, '');
    if (!name) {
      return res.status(400).json({ error: 'Invalid node id' });
    }
    try {
      if (await isSessionCompleted(sessionId)) {
        return res.status(403).json({ error: 'Cannot modify nodes — PM session is completed' });
      }
      // Create a name tombstone so report/diagnostics stay filtered even if a synthetic returns
      const existing = await db.prepare(
        `SELECT * FROM session_node_maintenance WHERE session_id = ? AND LOWER(TRIM(COALESCE(node_name,''))) = LOWER(?)`
      ).get([sessionId, name]);
      if (existing) {
        await excludeNodeAndNameSiblings(sessionId, existing.node_id, {
          node_name: name,
          node_type: hint.node_type || existing.node_type,
        });
      } else {
        await db.prepare(`
          INSERT INTO session_node_maintenance
            (session_id, node_id, node_name, node_type, is_custom_node, deleted, uuid, synced)
          VALUES (?, ?, ?, ?, 0, 1, ?, 0)
        `).run([sessionId, -Math.abs(Date.now() % 1e9), name, hint.node_type || 'Controller', uuidv4()]);
      }
      return res.json({ success: true, message: 'Node removed from session' });
    } catch (error) {
      console.error('Remove session node error:', error);
      return res.status(500).json({ error: 'Failed to remove node from session' });
    }
  }

  try {
    if (await isSessionCompleted(sessionId)) {
      return res.status(403).json({ error: 'Cannot modify nodes — PM session is completed' });
    }

    const { existing } = await excludeNodeAndNameSiblings(sessionId, nid, hint);

    if (existing?.is_custom_node || nid < ID_WORKSTATION) {
      const others = await db.prepare(`
        SELECT COUNT(*) as count FROM session_node_maintenance
        WHERE node_id = ? AND session_id != ? AND COALESCE(deleted, 0) != 1
      `).get([nid, sessionId]);
      if ((others?.count ?? 0) === 0) {
        await softDeleteSyncRow(db, 'nodes', nid);
      }
    }

    res.json({ success: true, message: 'Node removed from session' });
  } catch (error) {
    console.error('Remove session node error:', error);
    res.status(500).json({ error: 'Failed to remove node from session' });
  }
});

// Delete custom node from session (same exclusion rules as session-node)
router.delete('/:sessionId/custom-node/:nodeId', requireAuth, async (req, res) => {
  const { sessionId, nodeId } = req.params;
  const nid = parseInt(nodeId, 10);
  if (Number.isNaN(nid)) {
    return res.status(400).json({ error: 'Invalid node id' });
  }

  try {
    const maintenance = await db.prepare(`
      SELECT is_custom_node, node_name, node_type FROM session_node_maintenance
      WHERE session_id = ? AND node_id = ? AND COALESCE(deleted, 0) != 1
    `).get([sessionId, nid]);

    if (!maintenance) {
      return res.status(404).json({ error: 'Node not found in this session' });
    }
    if (!maintenance.is_custom_node) {
      return res.status(400).json({ error: 'Use session-node removal for registry equipment' });
    }

    if (await isSessionCompleted(sessionId)) {
      return res.status(403).json({ error: 'Cannot modify nodes — PM session is completed' });
    }

    await excludeNodeAndNameSiblings(sessionId, nid, {
      node_name: maintenance.node_name,
      node_type: maintenance.node_type,
      is_custom_node: true,
    });

    const others = await db.prepare(`
      SELECT COUNT(*) as count FROM session_node_maintenance
      WHERE node_id = ? AND session_id != ? AND COALESCE(deleted, 0) != 1
    `).get([nid, sessionId]);
    if ((others?.count ?? 0) === 0) {
      await softDeleteSyncRow(db, 'nodes', nid);
    }

    res.json({ success: true, message: 'Custom node removed' });
  } catch (error) {
    console.error('Error deleting custom node:', error);
    res.status(500).json({ error: 'Failed to delete custom node' });
  }
});

module.exports = router;
