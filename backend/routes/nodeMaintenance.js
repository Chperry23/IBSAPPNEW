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
             free_time, redundancy_checked, cold_restart_checked, no_errors_checked,
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
        no_errors_checked: Boolean(item.no_errors_checked),
        hdd_replaced: Boolean(item.hdd_replaced),
        performance_type: item.performance_type || 'free_time',
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
                     (maintenance.no_errors_checked !== undefined) ||
                     maintenance.hdd_replaced || maintenance.hf_updated ||
                     maintenance.firmware_updated_checked || (maintenance.free_time && String(maintenance.free_time).trim()) ||
                     maintenance.performance_value != null || (maintenance.notes && String(maintenance.notes).trim()) ||
                     maintenance.is_custom_node || maintenance.completed;
      
      if (!hasData) continue;
      
      const nid = parseInt(nodeId, 10);
      if (Number.isNaN(nid)) continue;
      
      await db.prepare(`
        INSERT INTO session_node_maintenance (
          session_id, node_id, dv_checked, os_checked, macafee_checked,
          free_time, redundancy_checked, cold_restart_checked, no_errors_checked,
          hdd_replaced, performance_type, performance_value, hf_updated, firmware_updated_checked,
          notes, is_custom_node, completed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id, node_id) DO UPDATE SET
          dv_checked=excluded.dv_checked, os_checked=excluded.os_checked, macafee_checked=excluded.macafee_checked,
          free_time=excluded.free_time, redundancy_checked=excluded.redundancy_checked, cold_restart_checked=excluded.cold_restart_checked,
          no_errors_checked=excluded.no_errors_checked, hdd_replaced=excluded.hdd_replaced,
          performance_type=excluded.performance_type, performance_value=excluded.performance_value,
          hf_updated=excluded.hf_updated, firmware_updated_checked=excluded.firmware_updated_checked,
          notes=excluded.notes, is_custom_node=excluded.is_custom_node, completed=excluded.completed,
          updated_at=CURRENT_TIMESTAMP
      `).run([
        sessionId, nid,
        maintenance.dv_checked ? 1 : 0, maintenance.os_checked ? 1 : 0, maintenance.macafee_checked ? 1 : 0,
        maintenance.free_time || null, maintenance.redundancy_checked ? 1 : 0, maintenance.cold_restart_checked ? 1 : 0,
        maintenance.no_errors_checked ? 1 : 0, maintenance.hdd_replaced ? 1 : 0,
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

