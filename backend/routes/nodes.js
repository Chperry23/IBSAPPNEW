const express = require('express');
const router = express.Router();
const db = require('../config/database');
const requireAuth = require('../middleware/auth');

// Get all nodes for a customer
router.get('/api/customers/:customerId/nodes', requireAuth, async (req, res) => {
  const customerId = req.params.customerId;
  const sessionId = req.query.sessionId;
  
  try {
    // If sessionId is provided and the session is completed, return snapshot data
    if (sessionId) {
      const session = await db.prepare('SELECT status FROM sessions WHERE id = ?').get([sessionId]);
      
      if (session && session.status === 'completed') {
        // Return node snapshot data for completed sessions
        const snapshots = await db.prepare(`
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
          WHERE sns.session_id = ?
          ORDER BY sns.node_type, sns.node_name
        `).all([sessionId]);
        
        return res.json(snapshots);
      }
    }
    
    // Return current nodes for active sessions or when no sessionId provided
    const nodes = await db.prepare(`
      SELECT n.*, c.cabinet_name as assigned_cabinet_name
      FROM nodes n
      LEFT JOIN cabinets c ON n.assigned_cabinet_id = c.id
      WHERE n.customer_id = ?
      ORDER BY n.node_type, n.node_name
    `).all([customerId]);
    
    res.json(nodes);
  } catch (error) {
    console.error('Get nodes error:', error);
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
  const sessionId = req.query.sessionId; // Get session ID from query parameter
  
  try {
    let controllers;
    
    if (sessionId) {
      // Get all controllers with their usage status in the current session
      controllers = await db.prepare(`
        SELECT 
          n.*,
          CASE 
            WHEN n.id IN (
              SELECT DISTINCT n2.id 
              FROM nodes n2
              JOIN cabinets c ON n2.assigned_cabinet_id = c.id
              WHERE c.pm_session_id = ?
            ) THEN 'used_in_session'
            WHEN n.assigned_cabinet_id IS NOT NULL THEN 'used_elsewhere'
            ELSE 'available'
          END as usage_status,
          c.cabinet_name as cabinet_location,
          s.session_name
                 FROM nodes n
         LEFT JOIN cabinets c ON n.assigned_cabinet_id = c.id
         LEFT JOIN sessions s ON c.pm_session_id = s.id
        WHERE n.customer_id = ? 
        AND n.node_type IN ('Controller', 'CIOC', 'SZ Controller', 'Charms Smart Logic Solver', 'DeltaV EIOC', 'SIS')
        AND n.node_name NOT LIKE '%-partner'
        ORDER BY 
          CASE 
            WHEN n.id IN (
              SELECT DISTINCT n2.id 
              FROM nodes n2
              JOIN cabinets c ON n2.assigned_cabinet_id = c.id
              WHERE c.pm_session_id = ?
            ) THEN 1
            WHEN n.assigned_cabinet_id IS NOT NULL THEN 2
            ELSE 0
          END,
          n.node_type, n.node_name
      `).all([sessionId, customerId, sessionId]);
      
      console.log('DEBUG: Found', controllers.length, 'controllers for customer with usage status');
    } else {
      // If no session ID provided, return all controllers (fallback)
      controllers = await db.prepare(`
        SELECT 
          *,
          CASE 
            WHEN assigned_cabinet_id IS NOT NULL THEN 'used_elsewhere'
            ELSE 'available'
          END as usage_status,
          NULL as cabinet_location,
          NULL as session_name
        FROM nodes 
      WHERE customer_id = ? 
        AND node_type IN ('Controller', 'CIOC', 'SZ Controller', 'Charms Smart Logic Solver', 'DeltaV EIOC', 'SIS')
      AND node_name NOT LIKE '%-partner'
        ORDER BY assigned_cabinet_id IS NOT NULL, node_type, node_name
      `).all([customerId]);
      
      console.log('DEBUG: Found', controllers.length, 'total controllers for customer (no session filter)');
    }
    
    res.json(controllers);
  } catch (error) {
    console.error('Get available controllers error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get available smart switches for a customer
router.get('/api/customers/:customerId/available-switches', requireAuth, async (req, res) => {
  const customerId = req.params.customerId;
  const sessionId = req.query.sessionId;
  
  try {
    let switches;
    
    if (sessionId) {
      switches = await db.prepare(`
        SELECT 
          n.*,
          CASE 
            WHEN n.id IN (
              SELECT DISTINCT n2.id 
              FROM nodes n2
              JOIN cabinets c ON n2.assigned_cabinet_id = c.id
              WHERE c.pm_session_id = ?
            ) THEN 'used_in_session'
            WHEN n.assigned_cabinet_id IS NOT NULL THEN 'used_elsewhere'
            ELSE 'available'
          END as usage_status,
          c.cabinet_name,
          s.session_name
        FROM nodes n
        LEFT JOIN cabinets c ON n.assigned_cabinet_id = c.id
        LEFT JOIN sessions s ON c.pm_session_id = s.id
        WHERE n.customer_id = ? 
        AND (n.node_type = 'Smart Network Devices' OR n.description = 'Smart Network Devices')
        ORDER BY n.node_name
      `).all([sessionId, customerId]);
    } else {
      switches = await db.prepare(`
        SELECT 
          *,
          CASE 
            WHEN assigned_cabinet_id IS NOT NULL THEN 'used_elsewhere'
            ELSE 'available'
          END as usage_status,
          NULL as cabinet_name,
          NULL as session_name
        FROM nodes 
        WHERE customer_id = ? 
        AND (node_type = 'Smart Network Devices' OR description = 'Smart Network Devices')
        ORDER BY node_name
      `).all([customerId]);
    }
    
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
            // Insert new node
            await db.prepare(`
              INSERT INTO nodes (
                customer_id, node_name, node_type, model, description, serial, 
                firmware, version, status, redundant, os_name, os_service_pack,
                bios_version, oem_type_description
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
              node.oem_type_description || null
            ]);
            importedCount++;
          }
        } else {
          // Just insert (original behavior)
          await db.prepare(`
            INSERT INTO nodes (
              customer_id, node_name, node_type, model, description, serial, 
              firmware, version, status, redundant, os_name, os_service_pack,
              bios_version, oem_type_description
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            node.oem_type_description || null
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

// Assign controller to cabinet
router.post('/api/nodes/:nodeId/assign', requireAuth, async (req, res) => {
  const nodeId = req.params.nodeId;
  const { cabinet_id } = req.body;
  
  try {
    const result = await db.prepare(`
      UPDATE nodes SET 
        assigned_cabinet_id = ?, 
        assigned_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run([cabinet_id, nodeId]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Assign node error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Unassign controllers from a specific cabinet
router.post('/api/cabinets/:cabinetId/unassign-controllers', requireAuth, async (req, res) => {
  const cabinetId = req.params.cabinetId;
  
  try {
    const result = await db.prepare(`
      UPDATE nodes SET 
        assigned_cabinet_id = NULL, 
        assigned_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE assigned_cabinet_id = ?
    `).run([cabinetId]);
    
    res.json({ 
      success: true, 
      message: `Unassigned ${result.changes} controllers from cabinet`
    });
  } catch (error) {
    console.error('Unassign cabinet controllers error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Unassign controller from cabinet
router.post('/api/nodes/:nodeId/unassign', requireAuth, async (req, res) => {
  const nodeId = req.params.nodeId;
  
  try {
    const result = await db.prepare(`
      UPDATE nodes SET 
        assigned_cabinet_id = NULL, 
        assigned_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run([nodeId]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
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

