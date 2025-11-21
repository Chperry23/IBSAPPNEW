const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const requireAuth = require('../middleware/auth');

// Helper function to check if session is completed
async function isSessionCompleted(sessionId) {
  const session = await db.prepare('SELECT status FROM sessions WHERE id = ?').get([sessionId]);
  return session && session.status === 'completed';
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
             (SELECT COUNT(*) FROM cabinets cab WHERE cab.pm_session_id = s.id AND COALESCE(cab.deleted, 0) = 0) as cabinet_count
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
    const result = await db.prepare('UPDATE sessions SET session_name = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run([session_name, status, sessionId]);
    
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
    
    // 2. Clear node assignments for cabinets in this session
    if (cabinetIds.length > 0) {
      for (const cabinet of cabinetIds) {
        await db.prepare('UPDATE nodes SET assigned_cabinet_id = NULL, assigned_at = NULL WHERE assigned_cabinet_id = ?').run([cabinet.id]);
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
      LEFT JOIN cabinet_locations cl ON c.location_id = cl.id
      WHERE c.pm_session_id = ? 
      ORDER BY cl.sort_order, cl.location_name, c.created_at
    `).all([sessionId]);
    
    // Get all locations for this session
    const locations = await db.prepare(`
      SELECT * FROM cabinet_locations 
      WHERE session_id = ? 
      ORDER BY sort_order, location_name
    `).all([sessionId]);
    
    // Parse JSON fields for cabinets
    const cabinets = sessionCabinets.map(cabinet => ({
      ...cabinet,
      power_supplies: JSON.parse(cabinet.power_supplies || '[]'),
      distribution_blocks: JSON.parse(cabinet.distribution_blocks || '[]'),
      diodes: JSON.parse(cabinet.diodes || '[]'),
      network_equipment: JSON.parse(cabinet.network_equipment || '[]'),
      controllers: JSON.parse(cabinet.controllers || '[]'),
      inspection: JSON.parse(cabinet.inspection_data || '{}')
    }));
    
    const result = {
      ...session,
      cabinets,
      locations
    };
    
    res.json(result);
  } catch (error) {
    console.error('Get session details error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Complete PM session
router.put('/:sessionId/complete', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  
  try {
    // First, get the session to find the customer ID
    const session = await db.prepare('SELECT customer_id FROM sessions WHERE id = ?').get([sessionId]);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Create snapshots of all nodes for this customer at completion time
    const nodes = await db.prepare(`
      SELECT n.*, c.cabinet_location as assigned_cabinet_location
      FROM nodes n
      LEFT JOIN cabinets c ON n.assigned_cabinet_id = c.id
      WHERE n.customer_id = ?
      ORDER BY n.node_type, n.node_name
    `).all([session.customer_id]);
    
    // Insert node snapshots for this session
    for (const node of nodes) {
      try {
        await db.prepare(`
          INSERT OR REPLACE INTO session_node_snapshots (
            session_id, original_node_id, node_name, node_type, model, description, 
            serial, firmware, version, status, redundant, os_name, os_service_pack,
            bios_version, oem_type_description, assigned_cabinet_location
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run([
          sessionId,
          node.id,
          node.node_name,
          node.node_type,
          node.model,
          node.description,
          node.serial,
          node.firmware,
          node.version,
          node.status,
          node.redundant,
          node.os_name,
          node.os_service_pack,
          node.bios_version,
          node.oem_type_description,
          node.assigned_cabinet_location
        ]);
      } catch (snapshotError) {
        console.error('Error creating node snapshot:', snapshotError);
        // Continue with other nodes even if one fails
      }
    }
    
    // Mark the session as completed
    const result = await db.prepare('UPDATE sessions SET status = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(['completed', sessionId]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json({ success: true, message: 'Session marked as completed' });
  } catch (error) {
    console.error('Complete session error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Duplicate PM session
router.post('/:sessionId/duplicate', requireAuth, async (req, res) => {
  const sourceSessionId = req.params.sessionId;
  const { session_name } = req.body;
  const newSessionId = uuidv4();
  
  try {
    console.log('🔄 DUPLICATE SESSION DEBUG - Starting duplication');
    console.log('📋 Source Session ID:', sourceSessionId);
    console.log('📋 New Session Name:', session_name);
    console.log('📋 New Session ID:', newSessionId);
    
    // Get source session
    const sourceSession = await db.prepare('SELECT * FROM sessions WHERE id = ?').get([sourceSessionId]);
    if (!sourceSession) {
      console.log('❌ Source session not found');
      return res.status(404).json({ error: 'Source session not found' });
    }
    
    console.log('✅ Source session found:', sourceSession.session_name);
    
    // Create new session
    await db.prepare('INSERT INTO sessions (id, customer_id, user_id, session_name, status) VALUES (?, ?, ?, ?, ?)').run([
      newSessionId, 
      sourceSession.customer_id, 
      req.session.userId, 
      session_name, 
      'active'
    ]);
    
    console.log('✅ New session created');
    
    // Get all cabinets from source session
    const sourceCabinets = await db.prepare('SELECT * FROM cabinets WHERE pm_session_id = ?').all([sourceSessionId]);
    console.log('📦 Found', sourceCabinets.length, 'cabinets to duplicate');
    
    // Copy each cabinet and its controller assignments
    for (const sourceCabinet of sourceCabinets) {
      const newCabinetId = uuidv4();
      
      console.log('📦 Duplicating cabinet:', sourceCabinet.cabinet_location);
      console.log('📦 Source cabinet ID:', sourceCabinet.id);
      console.log('📦 New cabinet ID:', newCabinetId);
      console.log('📦 Source controllers JSON:', sourceCabinet.controllers);

      // Parse and clear readings from power supplies and diodes
      let powerSupplies = [];
      let diodes = [];
      
      if (sourceCabinet.power_supplies) {
        const sourcePowerSupplies = JSON.parse(sourceCabinet.power_supplies);
        powerSupplies = sourcePowerSupplies.map(ps => ({
          voltage_type: ps.voltage_type,
          dc_reading: '', // Clear reading
          line_neutral: '', // Clear reading
          line_ground: '', // Clear reading
          neutral_ground: '', // Clear reading
          status: 'pass' // Reset status
        }));
      }
      
      if (sourceCabinet.diodes) {
        const sourceDiodes = JSON.parse(sourceCabinet.diodes);
        diodes = sourceDiodes.map(diode => ({
          dc_reading: '', // Clear reading
          status: 'pass' // Reset status
        }));
      }

      // Create new cabinet
      await db.prepare(`
        INSERT INTO cabinets (
          id, pm_session_id, cabinet_location, cabinet_date, status,
          power_supplies, distribution_blocks, diodes, network_equipment, 
          inspection_data, controllers, location_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run([
        newCabinetId,
        newSessionId,
        sourceCabinet.cabinet_location,
        sourceCabinet.cabinet_date,
        'active', // Reset status to active
        JSON.stringify(powerSupplies),
        sourceCabinet.distribution_blocks, // Keep distribution blocks
        JSON.stringify(diodes),
        sourceCabinet.network_equipment, // Keep network equipment
        '{}', // Clear inspection data
        sourceCabinet.controllers, // Keep controller assignments
        sourceCabinet.location_id // Keep location assignment
      ]);
      
      console.log('✅ Cabinet created in database');
      
      // Assign controllers to the new cabinet based on the controllers JSON field
      if (sourceCabinet.controllers) {
        const controllers = JSON.parse(sourceCabinet.controllers);
        console.log('🎮 Parsed controllers:', controllers);
        
        for (const controller of controllers) {
          if (controller.node_id) {
            console.log('🎮 Assigning controller:', controller.node_id, 'to cabinet:', newCabinetId);
            try {
              const result = await db.prepare(`
                UPDATE nodes SET 
                  assigned_cabinet_id = ?, 
                  assigned_at = CURRENT_TIMESTAMP,
                  updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `).run([newCabinetId, controller.node_id]);
              console.log('✅ Controller assigned, changes:', result.changes);
            } catch (error) {
              console.error('❌ Error assigning controller during duplication:', error);
            }
          }
        }
      } else {
        console.log('📦 No controllers to assign for this cabinet');
      }
    }
    
    // Copy session node maintenance data (keep structure but clear actual maintenance data)
    const sourceNodeMaintenance = await db.prepare('SELECT * FROM session_node_maintenance WHERE session_id = ?').all([sourceSessionId]);
    
    for (const maintenance of sourceNodeMaintenance) {
      await db.prepare(`
        INSERT INTO session_node_maintenance (
          session_id, node_id, dv_checked, os_checked, macafee_checked,
          free_time, redundancy_checked, cold_restart_checked, no_errors_checked,
          hdd_replaced, performance_type, performance_value, hf_updated, firmware_updated_checked,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run([
        newSessionId,
        maintenance.node_id,
        0, // Clear dv_checked
        0, // Clear os_checked
        0, // Clear macafee_checked
        null, // Clear free_time
        0, // Clear redundancy_checked
        0, // Clear cold_restart_checked
        0, // Clear no_errors_checked
        0, // Clear hdd_replaced
        maintenance.performance_type || 'free_time', // Keep performance type
        null, // Clear performance value
        0, // Clear hf_updated
        0 // Clear firmware_updated_checked
      ]);
    }
    
    // Get the new session data
    const newSession = await db.prepare(`
      SELECT s.*, c.name as customer_name, c.location
      FROM sessions s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.id = ?
    `).get([newSessionId]);
    
    console.log('✅ DUPLICATE SESSION COMPLETED');
    console.log('📋 New session data:', newSession);
    
    res.json({ 
      success: true, 
      session: newSession,
      message: 'Session duplicated successfully'
    });
  } catch (error) {
    console.error('❌ DUPLICATE SESSION ERROR:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
