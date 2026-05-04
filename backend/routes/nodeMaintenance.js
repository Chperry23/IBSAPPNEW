const express = require('express');
const router = express.Router();
const db = require('../config/database');
const requireAuth = require('../middleware/auth');
const { isSessionCompleted } = require('../utils/session');

// Get node maintenance data for a session
router.get('/:sessionId/node-maintenance', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  
  try {
    const maintenanceData = await db.prepare(`
      SELECT node_id, dv_checked, os_checked, macafee_checked, 
             free_time, redundancy_checked, cold_restart_checked, has_io_errors,
             hdd_replaced, performance_type, performance_value, hf_updated, firmware_updated_checked,
             notes, is_custom_node, completed
      FROM session_node_maintenance 
      WHERE session_id = ?
    `).all([sessionId]);
    
    // Convert to object format {nodeId: {dv_checked: true, ...}}
    const result = {};
    maintenanceData.forEach(item => {
      result[item.node_id] = {
        dv_checked: Boolean(item.dv_checked),
        os_checked: Boolean(item.os_checked),
        macafee_checked: Boolean(item.macafee_checked),
        free_time: item.free_time || '',
        redundancy_checked: Boolean(item.redundancy_checked),
        cold_restart_checked: Boolean(item.cold_restart_checked),
        has_io_errors: item.has_io_errors == null ? true : Boolean(item.has_io_errors),
        hdd_replaced: Boolean(item.hdd_replaced),
        performance_type: item.performance_type || null,
        performance_value: item.performance_value || null,
        hf_updated: Boolean(item.hf_updated),
        firmware_updated_checked: Boolean(item.firmware_updated_checked),
        notes: item.notes || '',
        is_custom_node: Boolean(item.is_custom_node),
        completed: Boolean(item.completed)
      };
    });
    
    res.json(result);
  } catch (error) {
    console.error('Get node maintenance error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Save node maintenance data for a session (full replace: upsert per node to avoid UNIQUE constraint races)
router.post('/:sessionId/node-maintenance', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  const maintenanceData = req.body;
  
  try {
    if (await isSessionCompleted(sessionId)) {
      return res.status(403).json({ 
        error: 'Cannot modify node maintenance data - PM session is completed',
        message: 'This PM session has been completed and cannot be modified. Create a new session to make changes.'
      });
    }
    
    let count = 0;
    for (const [nodeId, maintenance] of Object.entries(maintenanceData)) {
      const hasData = maintenance.dv_checked || maintenance.os_checked || maintenance.macafee_checked ||
                     maintenance.redundancy_checked || maintenance.cold_restart_checked || 
                     (maintenance.has_io_errors !== undefined) ||
                     maintenance.hdd_replaced || maintenance.hf_updated ||
                     maintenance.firmware_updated_checked || (maintenance.free_time && String(maintenance.free_time).trim()) ||
                     maintenance.performance_type || maintenance.performance_value != null ||
                     (maintenance.notes && String(maintenance.notes).trim()) ||
                     maintenance.is_custom_node || maintenance.completed;
      
      if (!hasData) continue;
      
      const nid = parseInt(nodeId, 10);
      if (Number.isNaN(nid)) continue;
      
      await db.prepare(`
        INSERT INTO session_node_maintenance (
          session_id, node_id, dv_checked, os_checked, macafee_checked,
          free_time, redundancy_checked, cold_restart_checked, has_io_errors,
          hdd_replaced, performance_type, performance_value, hf_updated, firmware_updated_checked,
          notes, is_custom_node, completed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id, node_id) DO UPDATE SET
          dv_checked=excluded.dv_checked, os_checked=excluded.os_checked, macafee_checked=excluded.macafee_checked,
          free_time=excluded.free_time, redundancy_checked=excluded.redundancy_checked, cold_restart_checked=excluded.cold_restart_checked,
          has_io_errors=excluded.has_io_errors, hdd_replaced=excluded.hdd_replaced,
          performance_type=excluded.performance_type, performance_value=excluded.performance_value,
          hf_updated=excluded.hf_updated, firmware_updated_checked=excluded.firmware_updated_checked,
          notes=excluded.notes, is_custom_node=excluded.is_custom_node, completed=excluded.completed,
          synced=0, updated_at=CURRENT_TIMESTAMP
      `).run([
        sessionId, nid,
        maintenance.dv_checked ? 1 : 0, maintenance.os_checked ? 1 : 0, maintenance.macafee_checked ? 1 : 0,
        maintenance.free_time || null, maintenance.redundancy_checked ? 1 : 0, maintenance.cold_restart_checked ? 1 : 0,
        maintenance.has_io_errors != null ? (maintenance.has_io_errors ? 1 : 0) : 1, maintenance.hdd_replaced ? 1 : 0,
        maintenance.performance_type || 'free_time', maintenance.performance_value != null ? maintenance.performance_value : null,
        maintenance.hf_updated ? 1 : 0, maintenance.firmware_updated_checked ? 1 : 0,
        maintenance.notes || null, maintenance.is_custom_node ? 1 : 0, maintenance.completed ? 1 : 0
      ]);
      count++;
    }
    
    res.json({ success: true, message: `Maintenance data saved for ${count} nodes` });
  } catch (error) {
    console.error('Save node maintenance error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// HDD replacement history for a customer — all nodes where hdd_replaced=1 across all sessions
router.get('/:customerId/hdd-replacements', requireAuth, async (req, res) => {
  const { customerId } = req.params;
  const ID_WORKSTATION = 1000000;
  const ID_CONTROLLER  = 2000000;
  const ID_SWITCH      = 3000000;
  const ID_CIOC        = 4000000;

  try {
    // Fetch all hdd_replaced rows for this customer's sessions
    const rows = await db.prepare(`
      SELECT m.node_id, m.notes, s.id as session_id, s.session_name, s.created_at as session_date
      FROM session_node_maintenance m
      JOIN sessions s ON m.session_id = s.id
      WHERE s.customer_id = ? AND m.hdd_replaced = 1 AND (s.deleted IS NULL OR s.deleted = 0)
      ORDER BY s.created_at DESC
    `).all([customerId]);

    if (rows.length === 0) return res.json([]);

    // Resolve node names using the synthetic ID ranges
    const resolve = async (nodeId) => {
      if (nodeId >= ID_CIOC) {
        const r = await db.prepare(`SELECT name, 'CIOC' as type FROM sys_charms_io_cards WHERE id = ?`).get(nodeId - ID_CIOC);
        return r || { name: `Node ${nodeId}`, type: 'CIOC' };
      }
      if (nodeId >= ID_SWITCH) {
        const r = await db.prepare(`SELECT name, 'Smart Switch' as type FROM sys_smart_switches WHERE id = ?`).get(nodeId - ID_SWITCH);
        return r || { name: `Node ${nodeId}`, type: 'Smart Switch' };
      }
      if (nodeId >= ID_CONTROLLER) {
        const r = await db.prepare(`SELECT name, 'Controller' as type FROM sys_controllers WHERE id = ?`).get(nodeId - ID_CONTROLLER);
        return r || { name: `Node ${nodeId}`, type: 'Controller' };
      }
      if (nodeId >= ID_WORKSTATION) {
        const r = await db.prepare(`SELECT name, type FROM sys_workstations WHERE id = ?`).get(nodeId - ID_WORKSTATION);
        return r || { name: `Node ${nodeId}`, type: 'Workstation' };
      }
      // Custom node in nodes table
      const r = await db.prepare(`SELECT node_name as name, node_type as type FROM nodes WHERE id = ?`).get(nodeId);
      return r || { name: `Node ${nodeId}`, type: 'Unknown' };
    };

    const results = await Promise.all(rows.map(async row => {
      const node = await resolve(row.node_id);
      return {
        session_id:   row.session_id,
        session_name: row.session_name,
        session_date: row.session_date,
        node_id:      row.node_id,
        node_name:    node.name || `Node ${row.node_id}`,
        node_type:    node.type || 'Unknown',
        notes:        row.notes || '',
      };
    }));

    res.json(results);
  } catch (error) {
    console.error('HDD replacements error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Clear all node maintenance data for a session
router.delete('/:sessionId/node-maintenance', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  
  try {
    const result = await db.prepare('DELETE FROM session_node_maintenance WHERE session_id = ?').run([sessionId]);
    
    res.json({ 
      success: true, 
      message: `Cleared maintenance data for ${result.changes} nodes`
    });
  } catch (error) {
    console.error('Clear node maintenance error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;

