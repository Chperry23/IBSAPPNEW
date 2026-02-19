const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const requireAuth = require('../middleware/auth');
const Logger = require('../utils/logger');
const puppeteer = require('puppeteer');
const { findChrome } = require('../utils/chrome');
const { generatePDFHtml } = require('../services/pdf/cabinetReport');

const logger = new Logger('Cabinets');

// Helper function to check if session is completed
async function isSessionCompleted(sessionId) {
  const session = await db.prepare('SELECT status FROM sessions WHERE id = ?').get([sessionId]);
  return session && session.status === 'completed';
}

// Create new cabinet
router.post('/', requireAuth, async (req, res) => {
  logger.request(req);
  logger.info('Creating new cabinet');
  
  const { 
    pm_session_id, 
    cabinet_name, 
    cabinet_date,
    cabinet_type = 'cabinet',
    power_supplies = [],
    distribution_blocks = [],
    diodes = [],
    network_equipment = [],
    inspection = {},
    location_id
  } = req.body;
  
  // Validation
  if (!pm_session_id) {
    logger.error('Missing pm_session_id');
    return res.status(400).json({ success: false, error: 'Session ID is required' });
  }
  
  if (!cabinet_name || !cabinet_name.trim()) {
    logger.error('Missing cabinet_name');
    return res.status(400).json({ success: false, error: 'Cabinet location is required' });
  }
  
  if (!cabinet_date) {
    logger.error('Missing cabinet_date');
    return res.status(400).json({ success: false, error: 'Cabinet date is required' });
  }
  
  const cabinetId = uuidv4();
  logger.debug('Generated cabinet ID', { cabinetId });
  
  const defaultInspection = {
    cabinet_fans: 'pass',
    controller_leds: 'pass',
    io_status: 'pass',
    network_status: 'pass',
    temperatures: 'pass',
    is_clean: 'pass',
    clean_filter_installed: 'pass',
    ground_inspection: 'pass',
    comments: '',
    ...inspection
  };
  
  try {
    // Check if session exists and is not completed
    logger.debug('Checking session status', { pm_session_id });
    const session = await db.prepare('SELECT id, status, session_name FROM sessions WHERE id = ?').get([pm_session_id]);
    
    if (!session) {
      logger.error('Session not found', { pm_session_id });
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    logger.debug('Session found', { session_name: session.session_name, status: session.status });
    
    if (session.status === 'completed') {
      logger.warn('Cannot add cabinet - session is completed');
      return res.status(403).json({ 
        success: false,
        error: 'Cannot add cabinet - PM session is completed',
        message: 'This PM session has been completed and cannot be modified.'
      });
    }
    
    logger.debug('Inserting cabinet into database', { 
      cabinet_name, 
      cabinet_date,
      location_id: location_id || 'none'
    });
    
    const insertSQL = location_id 
      ? `INSERT INTO cabinets (id, pm_session_id, cabinet_name, cabinet_date, cabinet_type, status, 
                           power_supplies, distribution_blocks, diodes, network_equipment, inspection_data, location_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      : `INSERT INTO cabinets (id, pm_session_id, cabinet_name, cabinet_date, cabinet_type, status, 
                           power_supplies, distribution_blocks, diodes, network_equipment, inspection_data, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
    
    const params = location_id 
      ? [
          cabinetId,
          pm_session_id,
          cabinet_name.trim(),
          cabinet_date,
          cabinet_type || 'cabinet',
          'active',
          JSON.stringify(power_supplies || []),
          JSON.stringify(distribution_blocks || []),
          JSON.stringify(diodes || []),
          JSON.stringify(network_equipment || []),
          JSON.stringify(defaultInspection),
          location_id
        ]
      : [
          cabinetId,
          pm_session_id,
          cabinet_name.trim(),
          cabinet_date,
          cabinet_type || 'cabinet',
          'active',
          JSON.stringify(power_supplies || []),
          JSON.stringify(distribution_blocks || []),
          JSON.stringify(diodes || []),
          JSON.stringify(network_equipment || []),
          JSON.stringify(defaultInspection)
        ];
    
    await db.prepare(insertSQL).run(params);
    
    logger.success('Cabinet created successfully', { cabinetId, cabinet_name });
    
    const cabinet = {
      id: cabinetId,
      pm_session_id,
      cabinet_name: cabinet_name.trim(),
      cabinet_date,
      cabinet_type: cabinet_type || 'cabinet',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      power_supplies: power_supplies || [],
      distribution_blocks: distribution_blocks || [],
      diodes: diodes || [],
      inspection: defaultInspection,
      network_equipment: network_equipment || [],
      location_id: location_id || null
    };
    
    res.json({ success: true, cabinet });
  } catch (error) {
    logger.error('Failed to create cabinet', error);
    res.status(500).json({ success: false, error: 'Database error', details: error.message });
  }
});

// Get cabinet details
router.get('/:cabinetId', requireAuth, async (req, res) => {
  const cabinetId = req.params.cabinetId;
  
  try {
    const cabinet = await db.prepare('SELECT * FROM cabinets WHERE id = ?').get([cabinetId]);
    
    if (!cabinet) {
      return res.status(404).json({ error: 'Cabinet not found' });
    }
    
    // Parse JSON fields
    let controllers = JSON.parse(cabinet.controllers || '[]');
    
    // Enhance controllers with full node details
    if (controllers.length > 0) {
      for (let i = 0; i < controllers.length; i++) {
        const controller = controllers[i];
        if (controller.node_id) {
          const nodeDetails = await db.prepare('SELECT * FROM nodes WHERE id = ?').get([controller.node_id]);
          if (nodeDetails) {
            controllers[i] = {
              ...controller,
              node_name: nodeDetails.node_name,
              model: nodeDetails.model,
              serial: nodeDetails.serial,
              firmware: nodeDetails.firmware,
              node_type: nodeDetails.node_type
            };
          }
        }
      }
    }
    
    const result = {
      ...cabinet,
      cabinet_type: cabinet.cabinet_type || 'cabinet',
      power_supplies: JSON.parse(cabinet.power_supplies || '[]'),
      distribution_blocks: JSON.parse(cabinet.distribution_blocks || '[]'),
      diodes: JSON.parse(cabinet.diodes || '[]'),
      network_equipment: JSON.parse(cabinet.network_equipment || '[]'),
      controllers: controllers,
      workstations: JSON.parse(cabinet.workstations || '[]'),
      inspection_data: cabinet.inspection_data,
      inspection: (() => {
        try {
          return typeof cabinet.inspection_data === 'string'
            ? JSON.parse(cabinet.inspection_data || '{}')
            : (cabinet.inspection_data || {});
        } catch (_) {
          return {};
        }
      })(),
      comments: cabinet.comments || '',
      rack_has_ups: Boolean(cabinet.rack_has_ups),
      rack_has_hmi: Boolean(cabinet.rack_has_hmi),
      rack_has_kvm: Boolean(cabinet.rack_has_kvm),
      rack_has_monitor: Boolean(cabinet.rack_has_monitor),
    };
    res.json(result);
  } catch (error) {
    console.error('Get cabinet details error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Generate cabinet PDF
router.post('/:cabinetId/pdf', requireAuth, async (req, res) => {
  const cabinetId = req.params.cabinetId;
  try {
    const row = await db.prepare('SELECT * FROM cabinets WHERE id = ?').get([cabinetId]);
    if (!row) {
      return res.status(404).json({ error: 'Cabinet not found' });
    }
    let controllers = JSON.parse(row.controllers || '[]');
    if (controllers.length > 0) {
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
    }
    const inspection = (() => {
      try {
        return typeof row.inspection_data === 'string'
          ? JSON.parse(row.inspection_data || '{}')
          : (row.inspection_data || {});
      } catch (_) {
        return {};
      }
    })();
    const cabinet = {
      ...row,
      cabinet_type: row.cabinet_type || 'cabinet',
      power_supplies: JSON.parse(row.power_supplies || '[]'),
      distribution_blocks: JSON.parse(row.distribution_blocks || '[]'),
      diodes: JSON.parse(row.diodes || '[]'),
      network_equipment: JSON.parse(row.network_equipment || '[]'),
      controllers,
      workstations: JSON.parse(row.workstations || '[]'),
      inspection,
      comments: row.comments || '',
      rack_has_ups: Boolean(row.rack_has_ups),
      rack_has_hmi: Boolean(row.rack_has_hmi),
      rack_has_kvm: Boolean(row.rack_has_kvm),
      rack_has_monitor: Boolean(row.rack_has_monitor),
    };
    const sessionInfo = await db.prepare(`
      SELECT s.id, s.session_name, s.status, c.name as customer_name
      FROM sessions s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.id = ?
    `).get([row.pm_session_id]) || {};
    const pdfContent = generatePDFHtml({ cabinet, sessionInfo });
    const browser = await puppeteer.launch({
      executablePath: await findChrome(),
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-web-security'],
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    await page.setContent(pdfContent, { waitUntil: 'networkidle0', timeout: 60000 });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
    });
    await browser.close();
    const safeName = (cabinet.cabinet_name || 'Cabinet').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Cabinet-PM-${safeName}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Cabinet PDF error:', error);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

// Save cabinet data
router.put('/:cabinetId', requireAuth, async (req, res) => {
  const cabinetId = req.params.cabinetId;
  const updateData = req.body;
  
  try {
    // First check if this cabinet belongs to a completed session
    const cabinet = await db.prepare(`
      SELECT c.pm_session_id, s.status 
      FROM cabinets c 
      LEFT JOIN sessions s ON c.pm_session_id = s.id 
      WHERE c.id = ?
    `).get(cabinetId);
    
    if (!cabinet) {
      return res.status(404).json({ error: 'Cabinet not found' });
    }
    
    // Prevent modifications to completed sessions
    if (cabinet.status === 'completed') {
      return res.status(403).json({ 
        error: 'Cannot modify cabinet data - PM session is completed',
        message: 'This PM session has been completed and cannot be modified. Create a new session to make changes.'
      });
    }
    
    const result = await db.prepare(`
      UPDATE cabinets SET 
        cabinet_name = ?, cabinet_date = ?, status = ?,
        power_supplies = ?, distribution_blocks = ?, diodes = ?,
        network_equipment = ?, controllers = ?, workstations = ?, inspection_data = ?,
        cabinet_type = ?, comments = ?, location_id = ?,
        rack_has_ups = ?, rack_has_hmi = ?, rack_has_kvm = ?, rack_has_monitor = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run([
      updateData.cabinet_name,
      updateData.cabinet_date,
      updateData.status || 'active',
      JSON.stringify(updateData.power_supplies || []),
      JSON.stringify(updateData.distribution_blocks || []),
      JSON.stringify(updateData.diodes || []),
      JSON.stringify(updateData.network_equipment || []),
      JSON.stringify(updateData.controllers || []),
      JSON.stringify(updateData.workstations || []),
      JSON.stringify(updateData.inspection || {}),
      updateData.cabinet_type || 'cabinet',
      updateData.comments || null,
      updateData.location_id || null,
      updateData.rack_has_ups ? 1 : 0,
      updateData.rack_has_hmi ? 1 : 0,
      updateData.rack_has_kvm ? 1 : 0,
      updateData.rack_has_monitor ? 1 : 0,
      cabinetId
    ]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Cabinet not found' });
    }
    
    res.json({ success: true, message: 'Cabinet data saved successfully' });
  } catch (error) {
    console.error('Save cabinet data error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Mark a single cabinet as completed
router.put('/:cabinetId/complete', requireAuth, async (req, res) => {
  const cabinetId = req.params.cabinetId;
  try {
    const cabinet = await db.prepare(`
      SELECT c.id, c.pm_session_id, s.status
      FROM cabinets c
      LEFT JOIN sessions s ON c.pm_session_id = s.id
      WHERE c.id = ?
    `).get(cabinetId);
    if (!cabinet) {
      return res.status(404).json({ error: 'Cabinet not found' });
    }
    if (cabinet.status === 'completed') {
      return res.status(403).json({
        error: 'Session already completed',
        message: 'This PM session has been completed.'
      });
    }
    await db.prepare('UPDATE cabinets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(['completed', cabinetId]);
    res.json({ success: true, message: 'Cabinet marked as completed' });
  } catch (error) {
    console.error('Mark cabinet complete error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete cabinet
router.delete('/:cabinetId', requireAuth, async (req, res) => {
  const cabinetId = req.params.cabinetId;
  
  try {
    // First check if this cabinet belongs to a completed session
    const cabinet = await db.prepare(`
      SELECT c.pm_session_id, s.status 
      FROM cabinets c 
      LEFT JOIN sessions s ON c.pm_session_id = s.id 
      WHERE c.id = ?
    `).get(cabinetId);
    
    if (!cabinet) {
      return res.status(404).json({ error: 'Cabinet not found' });
    }
    
    // Prevent deletion from completed sessions
    if (cabinet.status === 'completed') {
      return res.status(403).json({ 
        error: 'Cannot delete cabinet - PM session is completed',
        message: 'This PM session has been completed and cannot be modified. Create a new session to make changes.'
      });
    }
    
    // Unassign ALL nodes assigned to this cabinet across all sys_* tables
    const sysTablesWithAssignment = ['sys_controllers', 'sys_charms_io_cards', 'sys_smart_switches', 'sys_workstations'];
    for (const table of sysTablesWithAssignment) {
      try {
        await db.prepare(`UPDATE ${table} SET assigned_cabinet_id = NULL, assigned_at = NULL WHERE assigned_cabinet_id = ?`).run([cabinetId]);
      } catch (e) { /* column may not exist yet, skip */ }
    }
    // Also clear from legacy nodes table
    try {
      await db.prepare('UPDATE nodes SET assigned_cabinet_id = NULL, assigned_at = NULL WHERE assigned_cabinet_id = ?').run([cabinetId]);
    } catch (e) { /* ignore */ }
    
    // Delete the cabinet
    const result = await db.prepare('DELETE FROM cabinets WHERE id = ?').run([cabinetId]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Cabinet not found' });
    }
    
    res.json({ success: true, message: 'Cabinet deleted successfully' });
  } catch (error) {
    console.error('Delete cabinet error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Assign cabinet to location
router.post('/:cabinetId/assign-location', requireAuth, async (req, res) => {
  const cabinetId = req.params.cabinetId;
  const { location_id } = req.body;
  
  try {
    const result = await db.prepare(`
      UPDATE cabinets SET location_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run([location_id, cabinetId]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Cabinet not found' });
    }
    
    res.json({ success: true, message: 'Cabinet assigned to location successfully' });
  } catch (error) {
    console.error('Assign cabinet to location error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Bulk import cabinets
router.post('/bulk-import', requireAuth, async (req, res) => {
  const { cabinets, session_id } = req.body;
  
  if (!cabinets || !Array.isArray(cabinets) || cabinets.length === 0) {
    return res.status(400).json({ error: 'No cabinet data provided' });
  }
  
  if (!session_id) {
    return res.status(400).json({ error: 'Session ID is required' });
  }
  
  try {
    // Verify session exists and is not completed
    const session = await db.prepare('SELECT status FROM sessions WHERE id = ?').get([session_id]);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    if (session.status === 'completed') {
      return res.status(403).json({ error: 'Cannot add cabinets to completed session' });
    }
    
    let imported = 0;
    
    for (const cabinet of cabinets) {
      if (!cabinet.cabinet_name || !cabinet.cabinet_name.trim()) {
        continue; // Skip cabinets without locations
      }
      
      // Check if cabinet already exists in this session
      const existing = await db.prepare(`
        SELECT id FROM cabinets 
        WHERE pm_session_id = ? AND cabinet_name = ?
      `).get([session_id, cabinet.cabinet_name.trim()]);
      
      if (!existing) {
        await db.prepare(`
          INSERT INTO cabinets (
            id, pm_session_id, cabinet_name, cabinet_date, status,
            power_supplies, distribution_blocks, diodes, network_equipment, 
            controllers, inspection_data, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'active', '[]', '[]', '[]', '[]', '[]', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run([
          uuidv4(),
          session_id,
          cabinet.cabinet_name.trim(),
          cabinet.cabinet_date || new Date().toISOString().split('T')[0]
        ]);
        imported++;
      }
    }
    
    res.json({ success: true, imported, total: cabinets.length });
  } catch (error) {
    console.error('Bulk import cabinets error:', error);
    res.status(500).json({ error: 'Database error during import' });
  }
});

module.exports = router;

