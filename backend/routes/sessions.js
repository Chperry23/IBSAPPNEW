const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const requireAuth = require('../middleware/auth');
const puppeteer = require('puppeteer');
const { findChrome } = require('../utils/chrome');
const { getSharedStyles, generateSingleCabinetHtml, generateRiskAssessmentPage, generateCoverPage, generateCabinetsSectionDividerPage } = require('../services/pdf/cabinetReport');
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
      // Total = what the customer had at the time (use current count as approximation)
      if (customerId) {
        try {
          const ctrlTotal = await db.prepare(`SELECT COUNT(*) as count FROM sys_controllers WHERE customer_id = ?`).get([customerId]);
          const ciocTotal = await db.prepare(`SELECT COUNT(*) as count FROM sys_charms_io_cards WHERE customer_id = ?`).get([customerId]);
          controllerAssignmentStats.total = (ctrlTotal?.count ?? 0) + (ciocTotal?.count ?? 0);
        } catch (e) { /* ignore */ }
      }
      controllerAssignmentStats.assigned = assignedFromJson;
    } else {
      // For ACTIVE sessions: use live sys_* table data
      const cabinetIds = sessionCabinets.map(c => c.id);
      if (customerId) {
        try {
          const ctrlTotal = await db.prepare(`SELECT COUNT(*) as count FROM sys_controllers WHERE customer_id = ?`).get([customerId]);
          const ciocTotal = await db.prepare(`SELECT COUNT(*) as count FROM sys_charms_io_cards WHERE customer_id = ?`).get([customerId]);
          controllerAssignmentStats.total = (ctrlTotal?.count ?? 0) + (ciocTotal?.count ?? 0);
        } catch (e) { console.error('Error counting controllers:', e); }
        
        if (cabinetIds.length > 0) {
          const placeholders = cabinetIds.map(() => '?').join(',');
          try {
            const ctrlAssigned = await db.prepare(`SELECT COUNT(*) as count FROM sys_controllers WHERE customer_id = ? AND assigned_cabinet_id IN (${placeholders})`).get([customerId, ...cabinetIds]);
            const ciocAssigned = await db.prepare(`SELECT COUNT(*) as count FROM sys_charms_io_cards WHERE customer_id = ? AND assigned_cabinet_id IN (${placeholders})`).get([customerId, ...cabinetIds]);
            controllerAssignmentStats.assigned = (ctrlAssigned?.count ?? 0) + (ciocAssigned?.count ?? 0);
          } catch (e) { console.error('Error counting assigned controllers:', e); }
        }
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

    // Node maintenance data: use same node source as UI (sys_*) and merge with session_node_maintenance by node_id
    let nodeMaintenanceData = [];
    if (session.customer_id) {
      const maintenanceRows = await db.prepare(`
        SELECT node_id, dv_checked, os_checked, macafee_checked, free_time, redundancy_checked, cold_restart_checked, no_errors_checked, hdd_replaced, performance_type, performance_value, hf_updated, firmware_updated_checked, notes, completed
        FROM session_node_maintenance WHERE session_id = ?
      `).all([sessionId]);
      const nodes = [];
      const ws = await db.prepare(`SELECT id, name as node_name, type as node_type, model, dell_service_tag_number as serial FROM sys_workstations WHERE customer_id = ?`).all([session.customer_id]);
      const ctrl = await db.prepare(`SELECT id, name as node_name, 'Controller' as node_type, model, serial_number as serial FROM sys_controllers WHERE customer_id = ?`).all([session.customer_id]);
      const sw = await db.prepare(`SELECT id, name as node_name, 'Smart Network Devices' as node_type, model, serial_number as serial FROM sys_smart_switches WHERE customer_id = ?`).all([session.customer_id]);
      const cioc = await db.prepare(`SELECT id, name as node_name, 'CIOC' as node_type, model, serial_number as serial FROM sys_charms_io_cards WHERE customer_id = ?`).all([session.customer_id]);
      nodes.push(...ws, ...ctrl, ...sw, ...cioc);
      const maintByNode = {};
      maintenanceRows.forEach(m => { maintByNode[m.node_id] = m; });
      nodeMaintenanceData = nodes.map(n => ({
        ...n,
        serial: n.serial ?? null,
        dv_checked: Boolean(maintByNode[n.id]?.dv_checked),
        os_checked: Boolean(maintByNode[n.id]?.os_checked),
        macafee_checked: Boolean(maintByNode[n.id]?.macafee_checked),
        free_time: maintByNode[n.id]?.free_time || '',
        redundancy_checked: Boolean(maintByNode[n.id]?.redundancy_checked),
        cold_restart_checked: Boolean(maintByNode[n.id]?.cold_restart_checked),
        no_errors_checked: maintByNode[n.id] !== undefined ? Boolean(maintByNode[n.id].no_errors_checked) : true,
        hdd_replaced: Boolean(maintByNode[n.id]?.hdd_replaced),
        performance_type: maintByNode[n.id]?.performance_type || 'free_time',
        performance_value: maintByNode[n.id]?.performance_value ?? null,
        hf_updated: Boolean(maintByNode[n.id]?.hf_updated),
        firmware_updated_checked: Boolean(maintByNode[n.id]?.firmware_updated_checked),
        notes: maintByNode[n.id]?.notes || '',
        completed: Boolean(maintByNode[n.id]?.completed),
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
    await page.evaluate(() => new Promise(r => setTimeout(r, 400)));
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
    
    const sysCiocs = await db.prepare(`
      SELECT cioc.id, cioc.name as node_name, 'CIOC' as node_type, cioc.model,
             cioc.serial_number as serial, cioc.software_revision as firmware, cioc.hardware_revision as version,
             'active' as status, cioc.redundant, cioc.assigned_cabinet_id,
             c.cabinet_name as assigned_cabinet_name
      FROM sys_charms_io_cards cioc
      LEFT JOIN cabinets c ON cioc.assigned_cabinet_id = c.id
      WHERE cioc.customer_id = ?
    `).all([session.customer_id]);
    
    const sysWorkstations = await db.prepare(`
      SELECT ws.id, ws.name as node_name, ws.type as node_type, ws.model,
             ws.dell_service_tag_number as serial, ws.software_revision as firmware, ws.dv_hotfixes as version,
             'active' as status, ws.redundant, ws.assigned_cabinet_id, ws.os_name, ws.bios_version,
             c.cabinet_name as assigned_cabinet_name
      FROM sys_workstations ws
      LEFT JOIN cabinets c ON ws.assigned_cabinet_id = c.id
      WHERE ws.customer_id = ?
    `).all([session.customer_id]);
    
    const sysSwitches = await db.prepare(`
      SELECT sw.id, sw.name as node_name, 'Smart Switch' as node_type, sw.model,
             sw.serial_number as serial, sw.software_revision as firmware, sw.hardware_revision as version,
             'active' as status, sw.assigned_cabinet_id,
             c.cabinet_name as assigned_cabinet_name
      FROM sys_smart_switches sw
      LEFT JOIN cabinets c ON sw.assigned_cabinet_id = c.id
      WHERE sw.customer_id = ?
    `).all([session.customer_id]);
    
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
            network_equipment: JSON.parse(row.network_equipment || '[]'),
            controllers,
            workstations: JSON.parse(row.workstations || '[]'),
            inspection,
          };
        });
        const maintenanceRows = await db.prepare(`
          SELECT node_id, dv_checked, os_checked, macafee_checked, free_time, redundancy_checked, cold_restart_checked, no_errors_checked, hdd_replaced, performance_type, performance_value, hf_updated, firmware_updated_checked, notes, completed
          FROM session_node_maintenance WHERE session_id = ?
        `).all([sessionId]);
        const nodes = [];
        const ws = await db.prepare('SELECT id, name as node_name, type as node_type FROM sys_workstations WHERE customer_id = ?').all([session.customer_id]);
        const ctrl = await db.prepare("SELECT id, name as node_name, 'Controller' as node_type FROM sys_controllers WHERE customer_id = ?").all([session.customer_id]);
        const sw = await db.prepare("SELECT id, name as node_name, 'Smart Network Devices' as node_type FROM sys_smart_switches WHERE customer_id = ?").all([session.customer_id]);
        const cioc = await db.prepare("SELECT id, name as node_name, 'CIOC' as node_type FROM sys_charms_io_cards WHERE customer_id = ?").all([session.customer_id]);
        nodes.push(...ws, ...ctrl, ...sw, ...cioc);
        const maintByNode = {};
        maintenanceRows.forEach((m) => { maintByNode[m.node_id] = m; });
        const nodeMaintenanceData = nodes.map((n) => ({
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
          performance_value: maintByNode[n.id]?.performance_value ?? null,
          hf_updated: Boolean(maintByNode[n.id]?.hf_updated),
          firmware_updated_checked: Boolean(maintByNode[n.id]?.firmware_updated_checked),
          notes: maintByNode[n.id]?.notes || '',
          completed: Boolean(maintByNode[n.id]?.completed),
        }));
        const riskResult = generateRiskAssessment(cabinets, nodeMaintenanceData);
        const diagCount = await db.prepare(
          'SELECT COUNT(*) as c FROM session_diagnostics WHERE session_id = ? AND (deleted IS NULL OR deleted = 0)'
        ).get([sessionId]);
        await db.prepare(`
          INSERT INTO customer_metric_history (customer_id, session_id, session_name, recorded_at, error_count, risk_score, risk_level, total_components, failed_components, cabinet_count, synced)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, 0)
        `).run([
          session.customer_id,
          sessionId,
          session.session_name || '',
          diagCount?.c ?? 0,
          riskResult.riskScore ?? 0,
          riskResult.riskLevel || '',
          riskResult.totalComponents ?? 0,
          riskResult.failedComponents ?? 0,
          cabinets.length,
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

      // Create new cabinet - include cabinet_type and workstations
      await db.prepare(`
        INSERT INTO cabinets (
          id, pm_session_id, cabinet_name, cabinet_date, cabinet_type, status,
          power_supplies, distribution_blocks, diodes, network_equipment, 
          inspection_data, controllers, workstations, location_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run([
        newCabinetId,
        newSessionId,
        sourceCabinet.cabinet_name,
        sourceCabinet.cabinet_date,
        sourceCabinet.cabinet_type || 'cabinet', // Keep cabinet type
        'active', // Reset status to active
        JSON.stringify(powerSupplies),
        sourceCabinet.distribution_blocks, // Keep distribution blocks
        JSON.stringify(diodes),
        sourceCabinet.network_equipment, // Keep network equipment
        inspectionData, // Reset inspection data
        sourceCabinet.controllers, // Keep controller assignments
        sourceCabinet.workstations || '[]', // Keep workstation assignments
        sourceCabinet.location_id ? (locationIdMap[sourceCabinet.location_id] || sourceCabinet.location_id) : null // Remap to new location ID
      ]);
      
      console.log('✅ Cabinet created in database');
      
      // Re-assign nodes to the NEW cabinet in sys_* tables
      // Helper to reassign a node from old cabinet to new cabinet across all sys_* tables
      async function reassignNodeToNewCabinet(nodeId, newCabId, nodeCategory) {
        const tablePriority = {
          'controller': 'sys_controllers',
          'cioc': 'sys_charms_io_cards',
          'switch': 'sys_smart_switches',
          'workstation': 'sys_workstations'
        };
        
        // Try the priority table first
        if (nodeCategory && tablePriority[nodeCategory]) {
          try {
            const r = await db.prepare(`UPDATE ${tablePriority[nodeCategory]} SET assigned_cabinet_id = ?, assigned_at = CURRENT_TIMESTAMP WHERE id = ?`).run([newCabId, nodeId]);
            if (r.changes > 0) return;
          } catch (e) { /* try others */ }
        }
        
        // Try all sys_* tables
        const allTables = ['sys_controllers', 'sys_charms_io_cards', 'sys_smart_switches', 'sys_workstations'];
        for (const table of allTables) {
          try {
            const r = await db.prepare(`UPDATE ${table} SET assigned_cabinet_id = ?, assigned_at = CURRENT_TIMESTAMP WHERE id = ?`).run([newCabId, nodeId]);
            if (r.changes > 0) return;
          } catch (e) { /* skip */ }
        }
        
        // Fallback to legacy nodes table
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
