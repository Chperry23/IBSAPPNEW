const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const requireAuth = require('../middleware/auth');
const puppeteer = require('puppeteer');
const { findChrome } = require('../utils/chrome');
const { getSharedStyles, generateSingleCabinetHtml, generateRiskAssessmentPage, generateCoverPage } = require('../services/pdf/cabinetReport');
const { generateMaintenanceReportPage } = require('../services/pdf/maintenanceReport');
const { generateDiagnosticsSummary, generateControllerBreakdown } = require('../services/pdf/diagnosticsReport');
const { generateRiskAssessment } = require('../utils/risk-assessment');

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
      network_equipment: JSON.parse(cabinet.network_equipment || '[]'),
      controllers: JSON.parse(cabinet.controllers || '[]'),
      workstations: JSON.parse(cabinet.workstations || '[]'),
      inspection: JSON.parse(cabinet.inspection_data || '{}')
    }));

    // Controller/CIOC assignment stats from sys_* tables
    const cabinetIds = sessionCabinets.map(c => c.id);
    const customerId = session.customer_id;
    let controllerAssignmentStats = { assigned: 0, total: 0 };
    if (customerId) {
      // Count total controllers + CIOCs for this customer (exclude partner nodes)
      try {
        const ctrlTotal = await db.prepare(`SELECT COUNT(*) as count FROM sys_controllers WHERE customer_id = ?`).get([customerId]);
        const ciocTotal = await db.prepare(`SELECT COUNT(*) as count FROM sys_charms_io_cards WHERE customer_id = ?`).get([customerId]);
        controllerAssignmentStats.total = (ctrlTotal?.count ?? 0) + (ciocTotal?.count ?? 0);
      } catch (e) { console.error('Error counting controllers:', e); }
      
      // Count how many are assigned to cabinets in THIS session
      if (cabinetIds.length > 0) {
        const placeholders = cabinetIds.map(() => '?').join(',');
        try {
          const ctrlAssigned = await db.prepare(`SELECT COUNT(*) as count FROM sys_controllers WHERE customer_id = ? AND assigned_cabinet_id IN (${placeholders})`).get([customerId, ...cabinetIds]);
          const ciocAssigned = await db.prepare(`SELECT COUNT(*) as count FROM sys_charms_io_cards WHERE customer_id = ? AND assigned_cabinet_id IN (${placeholders})`).get([customerId, ...cabinetIds]);
          controllerAssignmentStats.assigned = (ctrlAssigned?.count ?? 0) + (ciocAssigned?.count ?? 0);
        } catch (e) { console.error('Error counting assigned controllers:', e); }
      }
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
  try {
    const session = await db.prepare(`
      SELECT s.*, c.name as customer_name
      FROM sessions s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.id = ?
    `).get([sessionId]);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (session.session_type === 'ii') {
      return res.status(400).json({ error: 'Use I&I export for I&I sessions' });
    }

    const sessionCabinets = await db.prepare(`
      SELECT c.* FROM cabinets c WHERE c.pm_session_id = ? ORDER BY c.created_at
    `).all([sessionId]);

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
          return typeof row.inspection_data === 'string' ? JSON.parse(row.inspection_data || '{}') : (row.inspection_data || {});
        } catch (_) { return {}; }
      })();
      cabinets.push({
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
      });
    }

    // Node maintenance data: merge session_node_maintenance with nodes
    let nodeMaintenanceData = [];
    if (session.customer_id) {
      const maintenanceRows = await db.prepare(`
        SELECT node_id, dv_checked, os_checked, macafee_checked, free_time, redundancy_checked, cold_restart_checked, no_errors_checked, hdd_replaced, performance_type, performance_value, hf_updated, firmware_updated_checked
        FROM session_node_maintenance WHERE session_id = ?
      `).all([sessionId]);
      const nodes = await db.prepare(`
        SELECT id, node_name, node_type, model, serial, description FROM nodes WHERE customer_id = ?
      `).all([session.customer_id]);
      const maintByNode = {};
      maintenanceRows.forEach(m => { maintByNode[m.node_id] = m; });
      nodeMaintenanceData = nodes.map(n => ({
        ...n,
        dv_checked: Boolean(maintByNode[n.id]?.dv_checked),
        os_checked: Boolean(maintByNode[n.id]?.os_checked),
        macafee_checked: Boolean(maintByNode[n.id]?.macafee_checked),
        free_time: maintByNode[n.id]?.free_time || '',
        redundancy_checked: Boolean(maintByNode[n.id]?.redundancy_checked),
        cold_restart_checked: Boolean(maintByNode[n.id]?.cold_restart_checked),
        no_errors_checked: maintByNode[n.id] !== undefined ? Boolean(maintByNode[n.id].no_errors_checked) : true,
        hdd_replaced: Boolean(maintByNode[n.id]?.hdd_replaced),
        performance_type: maintByNode[n.id]?.performance_type || 'free_time',
        performance_value: maintByNode[n.id]?.performance_value,
        hf_updated: Boolean(maintByNode[n.id]?.hf_updated),
        firmware_updated_checked: Boolean(maintByNode[n.id]?.firmware_updated_checked),
      }));
    }

    const diagnostics = await db.prepare(`
      SELECT * FROM session_diagnostics WHERE session_id = ? AND (deleted IS NULL OR deleted = 0) ORDER BY controller_name, card_number, channel_number
    `).all([sessionId]);

    const pmNotesRow = await db.prepare(`
      SELECT * FROM session_pm_notes WHERE session_id = ? AND (deleted IS NULL OR deleted = 0) LIMIT 1
    `).get([sessionId]);

    const riskResult = generateRiskAssessment(cabinets, nodeMaintenanceData);
    const riskAssessmentHtml = generateRiskAssessmentPage(riskResult, session.session_name);
    const maintenanceHtml = generateMaintenanceReportPage(nodeMaintenanceData);
    
    // Generate I/O Errors Summary (appears before cabinets)
    const dvSummaryHtml = generateDiagnosticsSummary(diagnostics);
    
    // Generate Detailed Error Log (appears after cabinets at the end)
    const controllerBreakdownHtml = generateControllerBreakdown(diagnostics);
    
    const cabinetsHtml = cabinets.map((cab, i) => generateSingleCabinetHtml(cab, sessionInfo, i + 1)).join('');
    
    // Generate professional cover page
    const coverPageHtml = generateCoverPage(sessionInfo, session.customer_name, session.completed_at || session.created_at);

    // Task label mapping
    const taskLabels = {
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
      'inspect_terminals': 'Inspect Terminals'
    };

    let pmNotesHtml = '';
    if (pmNotesRow && (pmNotesRow.common_tasks || pmNotesRow.additional_work_notes || pmNotesRow.troubleshooting_notes || pmNotesRow.recommendations_notes)) {
      const tasks = typeof pmNotesRow.common_tasks === 'string' ? JSON.parse(pmNotesRow.common_tasks || '[]') : (pmNotesRow.common_tasks || []);
      const formattedTasks = tasks.map(task => taskLabels[task] || task).filter(t => t);
      
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
        ${cabinetsHtml}
        ${controllerBreakdownHtml}
      </body>
      </html>
    `;

    const browser = await puppeteer.launch({
      executablePath: await findChrome(),
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-web-security'],
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(120000);
    await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 120000 });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
    });
    await browser.close();

    const safeName = (session.session_name || 'Session').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="PM-Session-Report-${safeName}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Session export-pdfs error:', error);
    res.status(500).json({ error: 'PDF generation failed' });
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
      SELECT n.*, c.cabinet_name as assigned_cabinet_name
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
            bios_version, oem_type_description, assigned_cabinet_name
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
          node.assigned_cabinet_name
        ]);
      } catch (snapshotError) {
        console.error('Error creating node snapshot:', snapshotError);
        // Continue with other nodes even if one fails
      }
    }
    
    // Mark the session as completed and mark as unsynced so it syncs to other devices
    const result = await db.prepare('UPDATE sessions SET status = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, synced = 0 WHERE id = ?').run(['completed', sessionId]);
    
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
    
    // If no session name provided, use the source session name with current date
    if (!session_name) {
      const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
      session_name = sourceSession.session_name.replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, today);
      // If no date was found to replace, append the date
      if (session_name === sourceSession.session_name) {
        session_name = `${sourceSession.session_name}-${today.replace(/\//g, '-')}`;
      }
    }
    
    console.log('📋 New Session Name:', session_name);
    console.log('📋 New Session ID:', newSessionId);
    
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
      
      console.log('📦 Duplicating cabinet:', sourceCabinet.cabinet_name);
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
          id, pm_session_id, cabinet_name, cabinet_date, status,
          power_supplies, distribution_blocks, diodes, network_equipment, 
          inspection_data, controllers, location_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run([
        newCabinetId,
        newSessionId,
        sourceCabinet.cabinet_name,
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
      // Create the node in the nodes table
      const result = await db.prepare(`
        INSERT INTO nodes (customer_id, node_name, node_type, model, serial, description)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run([customer_id, node_name, node_type, model || '', serial || '', 'Custom node added during PM']);
      
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
        INSERT INTO session_node_maintenance (session_id, node_id, is_custom_node)
        VALUES (?, ?, 1)
      `).run([sessionId, nodeId]);
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

// Delete custom node from session
router.delete('/:sessionId/custom-node/:nodeId', requireAuth, async (req, res) => {
  const { sessionId, nodeId } = req.params;
  
  try {
    // Check if this is a custom node
    const maintenance = await db.prepare(`
      SELECT is_custom_node FROM session_node_maintenance 
      WHERE session_id = ? AND node_id = ?
    `).get([sessionId, nodeId]);
    
    if (!maintenance) {
      return res.status(404).json({ error: 'Node not found in this session' });
    }
    
    if (!maintenance.is_custom_node) {
      return res.status(400).json({ error: 'Can only delete custom nodes' });
    }
    
    // Delete the maintenance entry
    await db.prepare(`
      DELETE FROM session_node_maintenance WHERE session_id = ? AND node_id = ?
    `).run([sessionId, nodeId]);
    
    // Check if this node is used in any other sessions
    const otherSessions = await db.prepare(`
      SELECT COUNT(*) as count FROM session_node_maintenance WHERE node_id = ?
    `).get([nodeId]);
    
    // If not used elsewhere, delete the node itself
    if (otherSessions.count === 0) {
      await db.prepare(`
        DELETE FROM nodes WHERE id = ?
      `).run([nodeId]);
    }
    
    res.json({ success: true, message: 'Custom node removed' });
  } catch (error) {
    console.error('Error deleting custom node:', error);
    res.status(500).json({ error: 'Failed to delete custom node' });
  }
});

module.exports = router;
