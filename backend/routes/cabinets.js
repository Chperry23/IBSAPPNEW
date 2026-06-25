const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const requireAuth = require('../middleware/auth');
const Logger = require('../utils/logger');
const { findChrome, getPuppeteer } = require('../utils/chrome');
const { generatePDFHtml } = require('../services/pdf/cabinetReport');

const logger = new Logger('Cabinets');
const { syncFieldsForInsert, softDeleteSyncRow } = require('../utils/sync-write-helper');

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
      location_id: location_id || 'none'
    });
    
    const insertSQL = location_id 
      ? `INSERT INTO cabinets (id, pm_session_id, cabinet_name, cabinet_type, status, 
                           power_supplies, distribution_blocks, diodes, network_equipment, inspection_data, location_id, uuid, synced, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      : `INSERT INTO cabinets (id, pm_session_id, cabinet_name, cabinet_type, status, 
                           power_supplies, distribution_blocks, diodes, network_equipment, inspection_data, uuid, synced, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
    
    const cabinetUuid = syncFieldsForInsert('cabinets', { id: cabinetId }).uuid;
    const params = location_id 
      ? [
          cabinetId,
          pm_session_id,
          cabinet_name.trim(),
          cabinet_type || 'cabinet',
          'active',
          JSON.stringify(power_supplies || []),
          JSON.stringify(distribution_blocks || []),
          JSON.stringify(diodes || []),
          JSON.stringify(network_equipment || []),
          JSON.stringify(defaultInspection),
          location_id,
          cabinetUuid,
        ]
      : [
          cabinetId,
          pm_session_id,
          cabinet_name.trim(),
          cabinet_type || 'cabinet',
          'active',
          JSON.stringify(power_supplies || []),
          JSON.stringify(distribution_blocks || []),
          JSON.stringify(diodes || []),
          JSON.stringify(network_equipment || []),
          JSON.stringify(defaultInspection),
          cabinetUuid,
        ];
    
    await db.prepare(insertSQL).run(params);
    
    logger.success('Cabinet created successfully', { cabinetId, cabinet_name });
    
    const cabinet = {
      id: cabinetId,
      pm_session_id,
      cabinet_name: cabinet_name.trim(),
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
      media_converters: JSON.parse(cabinet.media_converters || '[]'),
      power_injected_baseplates: JSON.parse(cabinet.power_injected_baseplates || '[]'),
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
  const pptr = getPuppeteer();
  if (!pptr) {
    return res.status(503).json({ error: 'PDF export is not available', details: 'Puppeteer is not available in this build. Install Google Chrome or Edge and use a full build with PDF support.' });
  }
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
    };
    const sessionInfo = await db.prepare(`
      SELECT s.id, s.session_name, s.status, s.created_at, s.completed_at, c.name as customer_name
      FROM sessions s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.id = ?
    `).get([row.pm_session_id]) || {};
    const pdfContent = generatePDFHtml({ cabinet, sessionInfo });
    const browser = await pptr.launch({
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
        cabinet_name = ?, status = ?,
        power_supplies = ?, distribution_blocks = ?, diodes = ?,
        media_converters = ?, power_injected_baseplates = ?,
        network_equipment = ?, controllers = ?, workstations = ?, inspection_data = ?,
        cabinet_type = ?, comments = ?, location_id = ?,
        rack_has_ups = ?, rack_has_hmi = ?, rack_has_kvm = ?, rack_has_monitor = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run([
      updateData.cabinet_name,
      updateData.status || 'active',
      JSON.stringify(updateData.power_supplies || []),
      JSON.stringify(updateData.distribution_blocks || []),
      JSON.stringify(updateData.diodes || []),
      JSON.stringify(updateData.media_converters || []),
      JSON.stringify(updateData.power_injected_baseplates || []),
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

// Duplicate a cabinet (copies counts/inspection, clears controllers)
router.post('/:cabinetId/duplicate', requireAuth, async (req, res) => {
  const cabinetId = req.params.cabinetId;
  const { new_name, preserve_equipment_labels, copy_count } = req.body || {};

  try {
    const source = await db.prepare(`
      SELECT c.*, s.status as session_status
      FROM cabinets c
      LEFT JOIN sessions s ON c.pm_session_id = s.id
      WHERE c.id = ?
    `).get(cabinetId);

    if (!source) {
      return res.status(404).json({ error: 'Cabinet not found' });
    }
    if (source.session_status === 'completed') {
      return res.status(403).json({ error: 'Cannot duplicate cabinet in a completed session' });
    }

    const preserve = Boolean(preserve_equipment_labels);
    let n = parseInt(copy_count, 10);
    if (!Number.isFinite(n) || n < 1) n = 1;
    if (n > 20) n = 20;

    const userBaseTrim = String(new_name || '').trim();

    /** Names: one copy uses user-provided name or `{source} (Copy)`; multiple uses `{stem} (Copy)`, `{stem} (Copy 2)`, ... */
    const defaultStem = source.cabinet_name || 'Cabinet';
    const stem = userBaseTrim
      ? userBaseTrim.replace(/\s*\(Copy\)(\s*\d+)?\s*$/i, '').trim() || defaultStem
      : defaultStem;
    const names = [];
    for (let i = 0; i < n; i += 1) {
      if (n === 1) {
        names.push(userBaseTrim || `${defaultStem} (Copy)`);
      } else if (i === 0) {
        names.push(`${stem} (Copy)`);
      } else {
        names.push(`${stem} (Copy ${i + 1})`);
      }
    }

    // Helper: generate N blank items of a given shape (preserves count, clears all values)
    const blankItems = (jsonStr, blankFn) => {
      try {
        const items = JSON.parse(jsonStr || '[]');
        return JSON.stringify(items.map((_, idx) => blankFn(idx)));
      } catch (_) { return '[]'; }
    };

    const blankPs = (i) => ({ id: Date.now() + i, voltage_type: '24VDC', line_neutral: '', line_ground: '', neutral_ground: '', dc_reading: '', status: '', psu_dead: false, comments: '' });
    const blankDb = (i) => ({ id: Date.now() + i, type: '', condition: '', comments: '', voltage_type: '24VDC', dc_reading: '' });
    const blankDiode = (i) => ({ id: Date.now() + i, diode_name: `Diode ${i + 1}`, voltage_type: '24VDC', dc_reading: '' });
    const blankMc = (i) => ({ id: Date.now() + i, mc_name: `MC ${i + 1}`, voltage_type: '24VDC', dc_reading: '' });
    const blankPib = (i) => ({ id: Date.now() + i, pib_name: `Carrier/Baseplate ${i + 1}` });
    const blankNet = (i) => ({ id: Date.now() + i, equipment_type: '', model_number: '', port_count: '', condition: '', comments: '', serial: '', firmware: '' });

    const parseJsonArray = (jsonStr) => {
      try {
        const parsed = JSON.parse(jsonStr || '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    };

    /** Keep custom labels/metadata; clear inspection readings only (matches session duplicate semantics). */
    const cloneEquipWithClearedReadings = (items, mapper) =>
      JSON.stringify(items.map(mapper));

    let distributionPayload;
    let diodesPayload;
    let mcPayload;
    let pibPayload;

    if (preserve) {
      const distArr = parseJsonArray(source.distribution_blocks);
      distributionPayload = cloneEquipWithClearedReadings(distArr, (b) => ({
        ...b,
        dc_reading: '',
        status: 'pass',
      }));

      const diodeArr = parseJsonArray(source.diodes);
      diodesPayload = cloneEquipWithClearedReadings(diodeArr, (d) => ({
        ...d,
        dc_reading: '',
        status: 'pass',
      }));

      const mcArr = parseJsonArray(source.media_converters);
      mcPayload = cloneEquipWithClearedReadings(mcArr, (mc) => ({
        ...mc,
        dc_reading: '',
        status: 'pass',
      }));

      const pibArr = parseJsonArray(source.power_injected_baseplates);
      pibPayload = cloneEquipWithClearedReadings(pibArr, (pib) => ({
        ...pib,
        dc_reading: '',
        status: 'pass',
      }));
    } else {
      distributionPayload = blankItems(source.distribution_blocks, blankDb);
      diodesPayload = blankItems(source.diodes, blankDiode);
      mcPayload = blankItems(source.media_converters, blankMc);
      pibPayload = blankItems(source.power_injected_baseplates, blankPib);
    }

    const crypto = require('crypto');
    const insertSql = `
      INSERT INTO cabinets (
        id, pm_session_id, cabinet_name, cabinet_type,
        power_supplies, distribution_blocks, diodes, media_converters,
        power_injected_baseplates, network_equipment,
        controllers, workstations,
        inspection_data, comments,
        rack_has_ups, rack_has_hmi, rack_has_kvm, rack_has_monitor,
        status, uuid, synced, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    `;

    const created = [];
    for (let i = 0; i < n; i += 1) {
      const newId = crypto.randomUUID();
      const insertName = names[i];
      await db.prepare(insertSql).run([
        newId,
        source.pm_session_id,
        insertName,
        source.cabinet_type || 'cabinet',
        blankItems(source.power_supplies, blankPs),
        distributionPayload,
        diodesPayload,
        mcPayload,
        pibPayload,
        blankItems(source.network_equipment, blankNet),
        '[]',
        '[]',
        '{}',
        null,
        source.rack_has_ups || 0,
        source.rack_has_hmi || 0,
        source.rack_has_kvm || 0,
        source.rack_has_monitor || 0,
        'active',
        newId,
        0,
      ]);
      const row = await db.prepare('SELECT * FROM cabinets WHERE id = ?').get(newId);
      if (row) created.push(row);
    }

    res.json({
      success: true,
      message: n === 1 ? 'Cabinet duplicated' : `Duplicated ${n} cabinets`,
      cabinet: created[created.length - 1] || null,
      cabinets: created,
    });
  } catch (error) {
    console.error('Duplicate cabinet error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Bulk-complete all active cabinets in a session
router.put('/session/:sessionId/complete-all', requireAuth, async (req, res) => {
  const { sessionId } = req.params;
  try {
    const session = await db.prepare(`SELECT id, status FROM sessions WHERE id = ?`).get(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.status === 'completed') {
      return res.status(403).json({ error: 'Session is already completed' });
    }
    const result = await db.prepare(`
      UPDATE cabinets SET status = 'completed', synced = 0, updated_at = CURRENT_TIMESTAMP
      WHERE pm_session_id = ? AND (deleted IS NULL OR deleted = 0) AND status != 'completed'
    `).run([sessionId]);
    console.log(`[CABINETS] Bulk completed ${result.changes} cabinets for session ${sessionId}`);
    res.json({ success: true, count: result.changes });
  } catch (error) {
    console.error('Bulk complete cabinets error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Mark a single cabinet as completed
router.put('/:cabinetId/complete', requireAuth, async (req, res) => {
  const cabinetId = req.params.cabinetId;
  try {
    const cabinet = await db.prepare(`
      SELECT c.id, c.pm_session_id, c.status, s.status as session_status
      FROM cabinets c
      LEFT JOIN sessions s ON c.pm_session_id = s.id
      WHERE c.id = ?
    `).get(cabinetId);
    if (!cabinet) {
      return res.status(404).json({ error: 'Cabinet not found' });
    }
    if (cabinet.session_status === 'completed') {
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

// Uncomplete a cabinet (set status back to active; only when session is not completed)
router.put('/:cabinetId/uncomplete', requireAuth, async (req, res) => {
  const cabinetId = req.params.cabinetId;
  try {
    const cabinet = await db.prepare(`
      SELECT c.id, c.pm_session_id, c.status, s.status as session_status
      FROM cabinets c
      LEFT JOIN sessions s ON c.pm_session_id = s.id
      WHERE c.id = ?
    `).get(cabinetId);
    if (!cabinet) {
      return res.status(404).json({ error: 'Cabinet not found' });
    }
    if (cabinet.session_status === 'completed') {
      return res.status(403).json({
        error: 'Cannot uncomplete cabinet',
        message: 'The PM session is completed. Uncomplete the session first to change cabinet status.'
      });
    }
    if (cabinet.status !== 'completed') {
      return res.json({ success: true, message: 'Cabinet was not completed' });
    }
    await db.prepare('UPDATE cabinets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(['active', cabinetId]);
    res.json({ success: true, message: 'Cabinet marked as active (uncompleted)' });
  } catch (error) {
    console.error('Uncomplete cabinet error:', error);
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
    
    // Soft-delete cabinet (tombstone for cloud sync)
    const deleted = await softDeleteSyncRow(db, 'cabinets', cabinetId);
    
    if (!deleted) {
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
        const newCabinetId = uuidv4();
        await db.prepare(`
          INSERT INTO cabinets (
            id, pm_session_id, cabinet_name, status,
            power_supplies, distribution_blocks, diodes, network_equipment, 
            controllers, inspection_data, uuid, synced, created_at, updated_at
          ) VALUES (?, ?, ?, 'active', '[]', '[]', '[]', '[]', '[]', '{}', ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run([
          newCabinetId,
          session_id,
          cabinet.cabinet_name.trim(),
          newCabinetId,
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

