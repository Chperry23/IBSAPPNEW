const express = require('express');
const router = express.Router();
const db = require('../config/database');
const requireAuth = require('../middleware/auth');

/**
 * Sync System Registry data to Nodes table
 * POST /api/customers/:customerId/system-registry/sync-to-nodes
 * 
 * This replaces CSV imports - creates/updates nodes from System Registry data
 */
router.post('/:customerId/sync-to-nodes', requireAuth, async (req, res) => {
  const customerId = parseInt(req.params.customerId);
  
  try {
    console.log(`🔄 [SYSREG→NODES] Starting sync for customer ${customerId}`);
    
    let totalSynced = 0;
    let totalCreated = 0;
    let totalUpdated = 0;
    
    // ========================================
    // 1. WORKSTATIONS
    // ========================================
    const workstations = await db.prepare(`
      SELECT * FROM sys_workstations WHERE customer_id = ?
    `).all([customerId]);
    
    console.log(`📋 [WORKSTATIONS] Found ${workstations.length} workstations`);
    
    for (const ws of workstations) {
      const nodeData = {
        customer_id: customerId,
        node_name: ws.name,
        node_type: ws.type || 'Workstation',
        model: ws.model || ws.computer_model,
        description: `Memory: ${ws.memory || 'N/A'} | OS: ${ws.os_name || 'N/A'}`,
        serial: ws.dell_service_tag_number,
        firmware: ws.software_revision,
        version: ws.dv_hotfixes,
        status: 'active',
        redundant: ws.redundant,
        os_name: ws.os_name,
        os_service_pack: null,
        bios_version: ws.bios_version,
        oem_type_description: ws.computer_model
      };
      
      const existing = await db.prepare(`
        SELECT id FROM nodes WHERE customer_id = ? AND node_name = ?
      `).get([customerId, ws.name]);
      
      if (existing) {
        await db.prepare(`
          UPDATE nodes SET 
            node_type = ?, model = ?, description = ?, serial = ?, firmware = ?, 
            version = ?, redundant = ?, os_name = ?, bios_version = ?, 
            oem_type_description = ?, updated_at = CURRENT_TIMESTAMP, synced = 0
          WHERE id = ?
        `).run([
          nodeData.node_type, nodeData.model, nodeData.description, nodeData.serial,
          nodeData.firmware, nodeData.version, nodeData.redundant, nodeData.os_name,
          nodeData.bios_version, nodeData.oem_type_description, existing.id
        ]);
        totalUpdated++;
      } else {
        await db.prepare(`
          INSERT INTO nodes (
            customer_id, node_name, node_type, model, description, serial, firmware, 
            version, status, redundant, os_name, bios_version, oem_type_description, synced
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `).run([
          nodeData.customer_id, nodeData.node_name, nodeData.node_type, nodeData.model,
          nodeData.description, nodeData.serial, nodeData.firmware, nodeData.version,
          nodeData.status, nodeData.redundant, nodeData.os_name, nodeData.bios_version,
          nodeData.oem_type_description
        ]);
        totalCreated++;
      }
    }
    
    // ========================================
    // 2. CONTROLLERS
    // ========================================
    const controllers = await db.prepare(`
      SELECT * FROM sys_controllers WHERE customer_id = ?
    `).all([customerId]);
    
    console.log(`🎮 [CONTROLLERS] Found ${controllers.length} controllers`);
    
    for (const ctrl of controllers) {
      const nodeData = {
        customer_id: customerId,
        node_name: ctrl.name,
        node_type: ctrl.model || 'Controller',
        model: ctrl.model,
        description: `Free Memory: ${ctrl.controller_free_memory || 'N/A'}`,
        serial: ctrl.serial_number,
        firmware: ctrl.software_revision,
        version: ctrl.hardware_revision,
        status: 'active',
        redundant: ctrl.redundant
      };
      
      const existing = await db.prepare(`
        SELECT id FROM nodes WHERE customer_id = ? AND node_name = ?
      `).get([customerId, ctrl.name]);
      
      if (existing) {
        await db.prepare(`
          UPDATE nodes SET 
            node_type = ?, model = ?, description = ?, serial = ?, firmware = ?, 
            version = ?, redundant = ?, updated_at = CURRENT_TIMESTAMP, synced = 0
          WHERE id = ?
        `).run([
          nodeData.node_type, nodeData.model, nodeData.description, nodeData.serial,
          nodeData.firmware, nodeData.version, nodeData.redundant, existing.id
        ]);
        totalUpdated++;
      } else {
        await db.prepare(`
          INSERT INTO nodes (
            customer_id, node_name, node_type, model, description, serial, firmware, 
            version, status, redundant, synced
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `).run([
          nodeData.customer_id, nodeData.node_name, nodeData.node_type, nodeData.model,
          nodeData.description, nodeData.serial, nodeData.firmware, nodeData.version,
          nodeData.status, nodeData.redundant
        ]);
        totalCreated++;
      }
      
      // Create partner node if redundant
      if (ctrl.redundant && ctrl.redundant.toLowerCase() === 'yes' && ctrl.partner_serial_number) {
        const partnerName = `${ctrl.name}-partner`;
        const partnerExists = await db.prepare(`
          SELECT id FROM nodes WHERE customer_id = ? AND node_name = ?
        `).get([customerId, partnerName]);
        
        if (!partnerExists) {
          await db.prepare(`
            INSERT INTO nodes (
              customer_id, node_name, node_type, model, description, serial, firmware, 
              version, status, redundant, synced
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
          `).run([
            customerId, partnerName, ctrl.partner_model || nodeData.node_type, ctrl.partner_model,
            'Redundant Partner', ctrl.partner_serial_number, ctrl.partner_software_revision,
            ctrl.partner_hardware_revision, 'active', 'yes'
          ]);
          totalCreated++;
        }
      }
    }
    
    // ========================================
    // 3. SMART SWITCHES
    // ========================================
    const switches = await db.prepare(`
      SELECT * FROM sys_smart_switches WHERE customer_id = ?
    `).all([customerId]);
    
    console.log(`🔀 [SWITCHES] Found ${switches.length} smart switches`);
    
    for (const sw of switches) {
      const nodeData = {
        customer_id: customerId,
        node_name: sw.name,
        node_type: sw.model || 'Smart Switch',
        model: sw.model,
        description: 'Network Smart Switch',
        serial: sw.serial_number,
        firmware: sw.software_revision,
        version: sw.hardware_revision,
        status: 'active'
      };
      
      const existing = await db.prepare(`
        SELECT id FROM nodes WHERE customer_id = ? AND node_name = ?
      `).get([customerId, sw.name]);
      
      if (existing) {
        await db.prepare(`
          UPDATE nodes SET 
            node_type = ?, model = ?, description = ?, serial = ?, firmware = ?, 
            version = ?, updated_at = CURRENT_TIMESTAMP, synced = 0
          WHERE id = ?
        `).run([
          nodeData.node_type, nodeData.model, nodeData.description, nodeData.serial,
          nodeData.firmware, nodeData.version, existing.id
        ]);
        totalUpdated++;
      } else {
        await db.prepare(`
          INSERT INTO nodes (
            customer_id, node_name, node_type, model, description, serial, firmware, 
            version, status, synced
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `).run([
          nodeData.customer_id, nodeData.node_name, nodeData.node_type, nodeData.model,
          nodeData.description, nodeData.serial, nodeData.firmware, nodeData.version,
          nodeData.status
        ]);
        totalCreated++;
      }
    }
    
    // ========================================
    // 4. CHARMS I/O CARDS
    // ========================================
    const ciocs = await db.prepare(`
      SELECT * FROM sys_charms_io_cards WHERE customer_id = ?
    `).all([customerId]);
    
    console.log(`📟 [CIOCS] Found ${ciocs.length} Charms I/O cards`);
    
    for (const cioc of ciocs) {
      const nodeData = {
        customer_id: customerId,
        node_name: cioc.name,
        node_type: cioc.model || 'Charms I/O Card',
        model: cioc.model,
        description: 'Charms I/O Card',
        serial: cioc.serial_number,
        firmware: cioc.software_revision,
        version: cioc.hardware_revision,
        status: 'active',
        redundant: cioc.redundant
      };
      
      const existing = await db.prepare(`
        SELECT id FROM nodes WHERE customer_id = ? AND node_name = ?
      `).get([customerId, cioc.name]);
      
      if (existing) {
        await db.prepare(`
          UPDATE nodes SET 
            node_type = ?, model = ?, description = ?, serial = ?, firmware = ?, 
            version = ?, redundant = ?, updated_at = CURRENT_TIMESTAMP, synced = 0
          WHERE id = ?
        `).run([
          nodeData.node_type, nodeData.model, nodeData.description, nodeData.serial,
          nodeData.firmware, nodeData.version, nodeData.redundant, existing.id
        ]);
        totalUpdated++;
      } else {
        await db.prepare(`
          INSERT INTO nodes (
            customer_id, node_name, node_type, model, description, serial, firmware, 
            version, status, redundant, synced
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `).run([
          nodeData.customer_id, nodeData.node_name, nodeData.node_type, nodeData.model,
          nodeData.description, nodeData.serial, nodeData.firmware, nodeData.version,
          nodeData.status, nodeData.redundant
        ]);
        totalCreated++;
      }
      
      // Create partner node if redundant
      if (cioc.redundant && cioc.redundant.toLowerCase() === 'yes' && cioc.partner_serial_number) {
        const partnerName = `${cioc.name}-partner`;
        const partnerExists = await db.prepare(`
          SELECT id FROM nodes WHERE customer_id = ? AND node_name = ?
        `).get([customerId, partnerName]);
        
        if (!partnerExists) {
          await db.prepare(`
            INSERT INTO nodes (
              customer_id, node_name, node_type, model, description, serial, firmware, 
              version, status, redundant, synced
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
          `).run([
            customerId, partnerName, cioc.partner_model || nodeData.node_type, cioc.partner_model,
            'Redundant Partner', cioc.partner_serial_number, cioc.partner_software_revision,
            cioc.partner_hardware_revision, 'active', 'yes'
          ]);
          totalCreated++;
        }
      }
    }
    
    totalSynced = totalCreated + totalUpdated;
    
    console.log(`✅ [SYSREG→NODES] Sync complete: ${totalCreated} created, ${totalUpdated} updated`);
    
    res.json({
      success: true,
      message: `Synced ${totalSynced} nodes from System Registry`,
      stats: {
        total: totalSynced,
        created: totalCreated,
        updated: totalUpdated,
        workstations: workstations.length,
        controllers: controllers.length,
        switches: switches.length,
        ciocs: ciocs.length
      }
    });
    
  } catch (error) {
    console.error('❌ [SYSREG→NODES] Sync error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync System Registry to nodes',
      details: error.message
    });
  }
});

/**
 * Get enhanced I/O device information for diagnostics
 * GET /api/customers/:customerId/system-registry/io-devices/:controllerName/:cardNumber/:channelNumber
 */
router.get('/:customerId/io-devices/:controllerName/:cardNumber/:channelNumber', requireAuth, async (req, res) => {
  const { customerId, controllerName, cardNumber, channelNumber } = req.params;
  
  try {
    const device = await db.prepare(`
      SELECT * FROM sys_io_devices 
      WHERE customer_id = ? 
        AND LOWER(node) = LOWER(?) 
        AND card = ? 
        AND channel = ?
      LIMIT 1
    `).get([customerId, controllerName, cardNumber, channelNumber]);
    
    if (device) {
      res.json({
        success: true,
        device: {
          device_name: device.device_name,
          bus_type: device.bus_type,
          device_type: device.device_type,
          full_path: `${device.node}/${device.card}/${device.channel}`,
          description: `${device.device_type || 'Device'} on ${device.bus_type || 'Bus'} - ${device.device_name || 'Unnamed'}`
        }
      });
    } else {
      res.json({
        success: true,
        device: null
      });
    }
  } catch (error) {
    console.error('Error fetching I/O device info:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get all I/O devices for a controller
 * GET /api/customers/:customerId/system-registry/io-devices/controller/:controllerName
 */
router.get('/:customerId/io-devices/controller/:controllerName', requireAuth, async (req, res) => {
  const { customerId, controllerName } = req.params;
  
  try {
    const devices = await db.prepare(`
      SELECT * FROM sys_io_devices 
      WHERE customer_id = ? 
        AND LOWER(node) = LOWER(?)
      ORDER BY CAST(card AS INTEGER), CAST(channel AS INTEGER)
    `).all([customerId, controllerName]);
    
    res.json({
      success: true,
      devices,
      count: devices.length
    });
  } catch (error) {
    console.error('Error fetching I/O devices:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
