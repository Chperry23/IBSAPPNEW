const express = require('express');
const router = express.Router();
const db = require('../config/database');
const requireAuth = require('../middleware/auth');

// Get all nodes for a customer
router.get('/api/customers/:customerId/nodes', requireAuth, async (req, res) => {
  const customerId = req.params.customerId;
  const sessionId = req.query.sessionId;
  
  console.log('🔍 [NODES] GET request:', { customerId, sessionId });
  
  try {
    // If sessionId is provided and the session is completed, return snapshot data
    if (sessionId) {
      const session = await db.prepare('SELECT status FROM sessions WHERE id = ?').get([sessionId]);
      console.log('🔍 [NODES] Session status:', session?.status);
      
      if (session && session.status === 'completed') {
        console.log('🔍 [NODES] Loading snapshots for completed session...');
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
        
        console.log(`🔍 [NODES] Found ${snapshots.length} snapshots`);
        return res.json(snapshots);
      }
    }
    
    // Return nodes from System Registry (replaces CSV import)
    console.log('🔍 [NODES] Loading nodes from System Registry tables...');
    
    const nodes = [];
    
    // Load Workstations from sys_workstations
    const workstations = await db.prepare(`
      SELECT 
        id,
        name as node_name,
        type as node_type,
        model,
        dell_service_tag_number as serial,
        software_revision as firmware,
        dv_hotfixes as version,
        os_name,
        bios_version,
        'active' as status,
        redundant,
        customer_id
      FROM sys_workstations
      WHERE customer_id = ?
    `).all([customerId]);
    
    nodes.push(...workstations);
    console.log(`   📋 Loaded ${workstations.length} workstations from sys_workstations`);
    
    // Load Controllers from sys_controllers
    const controllers = await db.prepare(`
      SELECT 
        id,
        name as node_name,
        model as node_type,
        model,
        serial_number as serial,
        software_revision as firmware,
        hardware_revision as version,
        'active' as status,
        redundant,
        customer_id
      FROM sys_controllers
      WHERE customer_id = ?
    `).all([customerId]);
    
    nodes.push(...controllers);
    console.log(`   🎮 Loaded ${controllers.length} controllers from sys_controllers`);
    
    // Add partner nodes for redundant controllers
    for (const ctrl of controllers) {
      if (ctrl.redundant && ctrl.redundant.toLowerCase() === 'yes') {
        nodes.push({
          id: `${ctrl.id}-partner`,
          node_name: `${ctrl.node_name}-partner`,
          node_type: ctrl.node_type,
          model: ctrl.model,
          serial: null,
          firmware: ctrl.firmware,
          version: ctrl.version,
          status: 'active',
          redundant: 'yes',
          customer_id: ctrl.customer_id
        });
      }
    }
    
    // Load Smart Switches from sys_smart_switches
    const switches = await db.prepare(`
      SELECT 
        id,
        name as node_name,
        model as node_type,
        model,
        serial_number as serial,
        software_revision as firmware,
        hardware_revision as version,
        'active' as status,
        customer_id
      FROM sys_smart_switches
      WHERE customer_id = ?
    `).all([customerId]);
    
    nodes.push(...switches);
    console.log(`   🔀 Loaded ${switches.length} smart switches from sys_smart_switches`);
    
    // Load Charms I/O Cards from sys_charms_io_cards
    const ciocs = await db.prepare(`
      SELECT 
        id,
        name as node_name,
        model as node_type,
        model,
        serial_number as serial,
        software_revision as firmware,
        hardware_revision as version,
        'active' as status,
        redundant,
        customer_id
      FROM sys_charms_io_cards
      WHERE customer_id = ?
    `).all([customerId]);
    
    nodes.push(...ciocs);
    console.log(`   📟 Loaded ${ciocs.length} Charms I/O cards from sys_charms_io_cards`);
    
    // Add partner nodes for redundant CIOCs
    for (const cioc of ciocs) {
      if (cioc.redundant && cioc.redundant.toLowerCase() === 'yes') {
        nodes.push({
          id: `${cioc.id}-partner`,
          node_name: `${cioc.node_name}-partner`,
          node_type: cioc.node_type,
          model: cioc.model,
          serial: null,
          firmware: cioc.firmware,
          version: cioc.version,
          status: 'active',
          redundant: 'yes',
          customer_id: cioc.customer_id
        });
      }
    }
    
    // If this is an active session, merge with maintenance data
    if (sessionId) {
      console.log(`🔍 [NODES] Merging with maintenance data for session ${sessionId}`);
      const maintenanceData = await db.prepare(`
        SELECT * FROM session_node_maintenance WHERE session_id = ?
      `).all([sessionId]);
      
      console.log(`   📊 Found ${maintenanceData.length} maintenance records`);
      
      // Create a map of maintenance data by node_name
      const maintMap = {};
      maintenanceData.forEach(m => {
        maintMap[m.node_name] = m;
      });
      
      // Merge maintenance data into nodes
      nodes.forEach(node => {
        const maint = maintMap[node.node_name];
        if (maint) {
          console.log(`   ✅ [NODES] Found maintenance for ${node.node_name}, no_errors_checked=${maint.no_errors_checked}`);
          node.dv_checked = Boolean(maint.dv_checked);
          node.dv_version = maint.dv_version;
          node.hf_checked = Boolean(maint.hf_checked);
          node.hf_updated = Boolean(maint.hf_updated);
          node.windows_update_checked = Boolean(maint.windows_update_checked);
          node.macafee_checked = Boolean(maint.macafee_checked);
          node.free_time = maint.free_time || '';
          node.redundancy_checked = Boolean(maint.redundancy_checked);
          node.cold_restart_checked = Boolean(maint.cold_restart_checked);
          node.no_errors_checked = Boolean(maint.no_errors_checked);
          node.hdd_replaced = Boolean(maint.hdd_replaced);
          node.performance_type = maint.performance_type || 'free_time';
          node.performance_value = maint.performance_value;
          node.notes = maint.notes || '';
        } else {
          // Default values for nodes without maintenance records
          node.dv_checked = false;
          node.hf_checked = false;
          node.hf_updated = false;
          node.windows_update_checked = false;
          node.macafee_checked = false;
          node.free_time = '';
          node.redundancy_checked = false;
          node.cold_restart_checked = false;
          node.no_errors_checked = true; // Default to "No Error"
          node.hdd_replaced = false;
          node.performance_type = 'free_time';
          node.performance_value = null;
          node.notes = '';
        }
      });
    }
    
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
        model as node_type,
        model,
        serial_number as serial,
        software_revision as firmware,
        hardware_revision as version,
        redundant,
        'available' as usage_status,
        customer_id
      FROM sys_controllers
      WHERE customer_id = ?
      ORDER BY name
    `).all([customerId]);
    
    const ciocs = await db.prepare(`
      SELECT 
        id,
        name as node_name,
        model as node_type,
        model,
        serial_number as serial,
        software_revision as firmware,
        hardware_revision as version,
        redundant,
        'available' as usage_status,
        customer_id
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
        model as node_type,
        model,
        serial_number as serial,
        software_revision as firmware,
        hardware_revision as version,
        'available' as usage_status,
        customer_id
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

