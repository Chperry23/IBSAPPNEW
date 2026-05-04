/**
 * Demo PM Report — generates a fully self-contained sample PDF with:
 *   - All customer/site information redacted
 *   - Examples of every error type the system can detect
 *   - Three cabinets: one GOOD, one BAD (all failures), one MIXED
 *   - Node maintenance with performance warnings, redundancy issues, HDD replacement
 *   - I/O diagnostics covering every built-in error type
 *   - PM Notes with troubleshooting and recommendations
 *
 * GET /api/reports/demo-pm   → streams a PDF directly to the browser
 */

const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/auth');
const { findChrome, getPuppeteer } = require('../utils/chrome');
const {
  getSharedStyles,
  generateSingleCabinetHtml,
  generateRiskAssessmentPage,
  generateCoverPage,
  generateCabinetsSectionDividerPage
} = require('../services/pdf/cabinetReport');
const { generateMaintenanceReportPage } = require('../services/pdf/maintenanceReport');
const { generateDiagnosticsSummary } = require('../services/pdf/diagnosticsReport');
const { generateRiskAssessment } = require('../utils/risk-assessment');

// ─── Demo data ───────────────────────────────────────────────────────────────

function buildDemoSession() {
  return {
    id: 'demo-session-001',
    session_name: '2026 Annual Preventive Maintenance — Demo Report',
    status: 'completed',
    customer_name: 'REDACTED — Demo Report Only',
    completed_at: new Date().toISOString(),
    created_at: new Date().toISOString()
  };
}

function buildDemoCabinets() {
  // ── Cabinet 1: GOOD ─────────────────────────────────────────────────────
  const goodCabinet = {
    id: 'demo-cab-001',
    cabinet_name: 'MCC-A — Control Room Cabinet (Example: Good Cabinet)',
    cabinet_date: new Date().toISOString(),
    cabinet_type: 'cabinet',
    rack_has_ups: false,
    rack_has_hmi: true,
    rack_has_kvm: false,
    rack_has_monitor: false,
    power_supplies: [
      { voltage_type: '24VDC', line_neutral: 120.2, line_ground: 119.8, neutral_ground: 0.8, dc_reading: 24.1, status: 'pass' },
      { voltage_type: '12VDC', dc_reading: 12.1, status: 'pass' }
    ],
    distribution_blocks: [
      { type: 'Main 24VDC Distribution', dc_reading: 24.0, voltage_type: '24VDC', status: 'pass' },
      { type: 'Secondary Distribution',  dc_reading: 24.1, voltage_type: '24VDC', status: 'pass' }
    ],
    diodes: [
      { dc_reading: 23.9, voltage_type: '24VDC', status: 'pass' },
      { dc_reading: 24.0, voltage_type: '24VDC', status: 'pass' }
    ],
    media_converters: [
      { mc_name: 'MC-01', voltage_type: '24VDC', dc_reading: 24.0, status: 'pass' }
    ],
    power_injected_baseplates: [
      { pib_name: 'Carrier A1', voltage_type: '24VDC', dc_reading: 24.1, status: 'pass' }
    ],
    network_equipment: [
      { equipment_type: 'Managed Switch', model_number: 'Hirschmann RSP-5', node_name: 'NET-SW-01', status: 'pass', condition: 'pass' },
      { equipment_type: 'Fiber Patch Panel', model_number: 'Panduit FPP12', node_name: 'FIBER-01', status: 'pass', condition: 'pass' }
    ],
    controllers: [
      { node_name: 'CTRL-01A', node_type: 'Controller', model: 'DeltaV MD Plus', serial: 'SN-10024-A' },
      { node_name: 'CTRL-01B', node_type: 'Controller', model: 'DeltaV MD Plus', serial: 'SN-10024-B' }
    ],
    inspection: {
      cabinet_fans: 'pass',
      controller_leds: 'pass',
      io_status: 'pass',
      network_status: 'pass',
      temperatures: 'pass',
      is_clean: 'pass',
      clean_filter_installed: 'pass',
      ground_inspection: 'pass',
      comments: 'Cabinet in excellent condition. All components operating within specification. Enclosure cleaned, filter replaced.'
    }
  };

  // ── Cabinet 2: BAD (every possible failure triggered) ───────────────────
  const badCabinet = {
    id: 'demo-cab-002',
    cabinet_name: 'MCC-B — Panel Room Cabinet (Example: Bad Cabinet — Multiple Critical Failures)',
    cabinet_date: new Date().toISOString(),
    cabinet_type: 'cabinet',
    rack_has_ups: true,
    rack_has_hmi: false,
    rack_has_kvm: false,
    rack_has_monitor: false,
    power_supplies: [
      // Fail status + out-of-range DC + out-of-range AC → triggers power_supply_fail, voltage_out_of_range, ac_voltage_out_of_range
      { voltage_type: '24VDC', line_neutral: 88.5, line_ground: 87.2, neutral_ground: 1850, dc_reading: 21.4, status: 'fail' },
      { voltage_type: '12VDC', dc_reading: 10.9, status: 'fail' }
    ],
    distribution_blocks: [
      // Out-of-range DC → triggers distribution_block_fail
      { type: 'Main 24VDC Distribution', dc_reading: 21.2, voltage_type: '24VDC', status: 'fail' },
      { type: 'Secondary Distribution',  dc_reading: 26.4, voltage_type: '24VDC', status: 'fail' }
    ],
    diodes: [
      // Out-of-range → triggers diode_fail
      { dc_reading: 20.8, voltage_type: '24VDC', status: 'fail' },
      { dc_reading: 27.1, voltage_type: '24VDC', status: 'fail' }
    ],
    media_converters: [
      // Fail → triggers media_converter_fail
      { mc_name: 'MC-02', voltage_type: '24VDC', dc_reading: 20.5, status: 'fail' }
    ],
    power_injected_baseplates: [
      // Fail → triggers pib_fail
      { pib_name: 'Carrier B1', voltage_type: '24VDC', dc_reading: 21.0, status: 'fail' },
      { pib_name: 'Carrier B2', voltage_type: '24VDC', dc_reading: 26.8, status: 'fail' }
    ],
    network_equipment: [
      // Entron switch fail → triggers network_equipment_entron (CRITICAL)
      { equipment_type: 'Managed Ethernet Switch', model_number: 'Entron EKI-7706E', node_name: 'ENTRON-SW-01', status: 'fail', condition: 'fail' },
      // Regular switch fail → triggers network_equipment_other
      { equipment_type: 'Unmanaged Switch', model_number: 'Phoenix Contact FL-2008', node_name: 'NET-SW-02', status: 'fail', condition: 'fail' }
    ],
    controllers: [
      { node_name: 'CTRL-02A', node_type: 'Controller', model: 'DeltaV SIS Logic Solver', serial: 'SN-20031-A' },
      { node_name: 'CTRL-02B', node_type: 'Controller', model: 'DeltaV SIS Logic Solver', serial: 'SN-20031-B' }
    ],
    inspection: {
      // All fail → triggers all per-cabinet checks
      cabinet_fans: 'fail',
      fan_failures: [
        { fan: 'Fan 1 (top)', part_number: 'P0926DU' },
        { fan: 'Fan 2 (bottom)', part_number: 'P0926DU' }
      ],
      controller_leds: 'fail',   // CRITICAL
      io_status: 'fail',          // CRITICAL
      network_status: 'fail',     // CRITICAL
      temperatures: 'fail',
      is_clean: 'fail',
      clean_filter_installed: 'fail',
      ground_inspection: 'fail',
      ground_fail_reason: 'Ground strap loose on main bus bar — corrosion visible on terminal lug',
      comments: 'CRITICAL: Multiple simultaneous failures detected. Entron switch offline. Controller LED fault active. Both cooling fans failed — internal temperature elevated. Power supply PS-01 replaced during PM visit. Ground strap repaired on-site but terminal lug requires replacement. Do not operate above 80% load until fans are replaced.'
    }
  };

  // ── Cabinet 3: MIXED ────────────────────────────────────────────────────
  const mixedCabinet = {
    id: 'demo-cab-003',
    cabinet_name: 'MCC-C — Field Panel (Example: Mixed — Some Pass, Some Fail)',
    cabinet_date: new Date().toISOString(),
    cabinet_type: 'cabinet',
    rack_has_ups: false,
    rack_has_hmi: false,
    rack_has_kvm: false,
    rack_has_monitor: false,
    power_supplies: [
      { voltage_type: '24VDC', line_neutral: 120.5, line_ground: 120.1, neutral_ground: 1.2, dc_reading: 23.8, status: 'pass' },
      // Second supply marginal but failed status
      { voltage_type: '24VDC', line_neutral: 119.6, line_ground: 119.4, neutral_ground: 0.9, dc_reading: 22.6, status: 'fail' }
    ],
    distribution_blocks: [
      { type: 'Primary Distribution', dc_reading: 23.9, voltage_type: '24VDC', status: 'pass' },
      { type: 'Zone 2 Distribution',  dc_reading: 22.5, voltage_type: '24VDC', status: 'fail' }
    ],
    diodes: [
      { dc_reading: 24.0, voltage_type: '24VDC', status: 'pass' }
    ],
    media_converters: [
      { mc_name: 'MC-03A', voltage_type: '24VDC', dc_reading: 24.0, status: 'pass' },
      { mc_name: 'MC-03B', voltage_type: '24VDC', dc_reading: 21.3, status: 'fail' }
    ],
    power_injected_baseplates: [
      { pib_name: 'Carrier C1', voltage_type: '24VDC', dc_reading: 23.9, status: 'pass' }
    ],
    network_equipment: [
      { equipment_type: 'Managed Switch', model_number: 'Hirschmann RSP-5', node_name: 'NET-SW-03', status: 'pass', condition: 'pass' }
    ],
    controllers: [
      { node_name: 'CTRL-03', node_type: 'CIOC', model: 'DeltaV CIOC/EIOC', serial: 'SN-30045' }
    ],
    inspection: {
      cabinet_fans: 'pass',
      controller_leds: 'pass',
      io_status: 'fail',          // I/O issues but controllers OK
      network_status: 'pass',
      temperatures: 'fail',       // elevated ambient temperature
      is_clean: 'pass',
      clean_filter_installed: 'fail', // filter missing
      ground_inspection: 'pass',
      comments: 'I/O status fault active on CIOC module — one HART card reporting card errors. Ambient temperature elevated — HVAC unit for this room requires service. Filter missing and needs to be ordered.'
    }
  };

  return [goodCabinet, badCabinet, mixedCabinet];
}

function buildDemoNodeMaintenance() {
  return [
    // Controller with poor performance index + redundancy not checked
    {
      id: 2000001, node_name: 'CTRL-01A', node_type: 'Controller',
      model: 'DeltaV MD Plus', serial: 'SN-10024-A',
      redundant: 'yes', partner_serial_number: 'SN-10024-B',
      dv_checked: true, os_checked: true, macafee_checked: true,
      free_time: '', redundancy_checked: false,
      cold_restart_checked: true, has_io_errors: true,
      hdd_replaced: false,
      performance_type: 'perf_index', performance_value: 1,
      hf_updated: true, firmware_updated_checked: false,
      notes: 'Performance index critically low. Controller running near capacity. Recommend process load review.',
      completed: true
    },
    // Controller with low free time + redundancy not checked
    {
      id: 2000002, node_name: 'CTRL-01B', node_type: 'Controller',
      model: 'DeltaV MD Plus', serial: 'SN-10024-B',
      redundant: 'yes', partner_serial_number: 'SN-10024-A',
      dv_checked: true, os_checked: true, macafee_checked: true,
      free_time: '', redundancy_checked: false,
      cold_restart_checked: false, has_io_errors: false,
      hdd_replaced: false,
      performance_type: 'free_time', performance_value: 18,
      hf_updated: true, firmware_updated_checked: true,
      notes: 'Free time at 18% — approaching critical threshold. Partner controller redundancy switch not verified.',
      completed: true
    },
    // SIS controller — good health
    {
      id: 2000003, node_name: 'CTRL-02A', node_type: 'SIS Logic Solver',
      model: 'DeltaV SIS Logic Solver', serial: 'SN-20031-A',
      redundant: 'yes', partner_serial_number: 'SN-20031-B',
      dv_checked: true, os_checked: false, macafee_checked: false,
      free_time: '', redundancy_checked: true,
      cold_restart_checked: false, has_io_errors: false,
      hdd_replaced: false,
      performance_type: 'perf_index', performance_value: 4,
      hf_updated: false, firmware_updated_checked: true,
      notes: '',
      completed: true
    },
    // Workstation — HDD replaced
    {
      id: 1000001, node_name: 'WKSTN-01 Operator Station', node_type: 'Local Operator Station',
      model: 'Dell OptiPlex 7080', serial: 'DELLSVC-ABC123',
      redundant: null, partner_serial_number: null,
      dv_checked: true, os_checked: true, macafee_checked: true,
      free_time: '', redundancy_checked: false,
      cold_restart_checked: false, has_io_errors: false,
      hdd_replaced: true,
      performance_type: 'free_time', performance_value: 62,
      hf_updated: true, firmware_updated_checked: false,
      notes: 'HDD showing early SMART failure. Replaced with new SSD during this PM.',
      completed: true
    },
    // Workstation — good
    {
      id: 1000002, node_name: 'WKSTN-02 Engineering Station', node_type: 'Local ProfessionalPlus Station',
      model: 'Dell OptiPlex 7080', serial: 'DELLSVC-DEF456',
      redundant: null, partner_serial_number: null,
      dv_checked: true, os_checked: true, macafee_checked: true,
      free_time: '', redundancy_checked: false,
      cold_restart_checked: false, has_io_errors: false,
      hdd_replaced: false,
      performance_type: 'free_time', performance_value: 74,
      hf_updated: true, firmware_updated_checked: true,
      notes: '',
      completed: true
    },
    // Smart switch — all good
    {
      id: 3000001, node_name: 'NET-SW-01 Control Room Switch', node_type: 'Smart Network Devices',
      model: 'Hirschmann RSP-5', serial: 'HM-SW-789012',
      redundant: null, partner_serial_number: null,
      dv_checked: false, os_checked: false, macafee_checked: false,
      free_time: '', redundancy_checked: false,
      cold_restart_checked: false, has_io_errors: false,
      hdd_replaced: false,
      performance_type: null, performance_value: null,
      hf_updated: false, firmware_updated_checked: true,
      notes: 'Firmware verified current. Port statistics clean.',
      completed: true
    }
  ];
}

function buildDemoDiagnostics() {
  // One row per built-in error type so every label path is exercised
  return [
    {
      session_id: 'demo-session-001',
      controller_name: 'CTRL-01A',
      device_name: 'FIC-101',
      bus_type: 'PROFIBUS_DP',
      card_number: 1, card_display: 'CARD-01', port_number: 1, channel_number: 1,
      error_type: 'bad',
      error_description: 'Device responding with bad status bits.',
      ldt: '2026-04-28 08:14:22'
    },
    {
      session_id: 'demo-session-001',
      controller_name: 'CTRL-01A',
      device_name: 'FIC-102',
      bus_type: 'PROFIBUS_DP',
      card_number: 1, card_display: 'CARD-01', port_number: 1, channel_number: 2,
      error_type: 'not_communicating',
      error_description: 'Device not responding on bus — check field wiring and device power.',
      ldt: '2026-04-28 08:15:04'
    },
    {
      session_id: 'demo-session-001',
      controller_name: 'CTRL-02A',
      device_name: 'TIC-201',
      bus_type: 'HART',
      card_number: 2, card_display: 'CARD-02', port_number: 1, channel_number: 1,
      error_type: 'abnormal',
      error_description: 'Process value out of expected operating range.',
      ldt: '2026-04-28 09:01:11'
    },
    {
      session_id: 'demo-session-001',
      controller_name: 'CTRL-02A',
      device_name: 'PIC-201',
      bus_type: 'HART',
      card_number: 2, card_display: 'CARD-02', port_number: 1, channel_number: 2,
      error_type: 'fail',
      error_description: 'Device returning hardware failure code.',
      ldt: '2026-04-28 09:03:44'
    },
    {
      session_id: 'demo-session-001',
      controller_name: 'CTRL-02A',
      device_name: 'LIC-301',
      bus_type: 'HART',
      card_number: 2, card_display: 'CARD-02', port_number: 2, channel_number: 1,
      error_type: 'warning',
      error_description: 'Device issuing advisory warning — no process impact yet.',
      ldt: '2026-04-28 09:12:00'
    },
    {
      session_id: 'demo-session-001',
      controller_name: 'CTRL-01A',
      device_name: '—',
      bus_type: 'CIOC',
      card_number: 3, card_display: 'CARD-03', port_number: 1, channel_number: null,
      error_type: 'no_card',
      error_description: 'Expected I/O card not detected in slot — card missing or unseated.',
      ldt: '2026-04-28 08:18:55'
    },
    {
      session_id: 'demo-session-001',
      controller_name: 'CTRL-03',
      device_name: 'FV-401',
      bus_type: 'PROFIBUS_DP',
      card_number: 1, card_display: 'CARD-01', port_number: 2, channel_number: 4,
      error_type: 'short_circuit',
      error_description: 'Short circuit detected on channel — isolate wiring before returning to service.',
      ldt: '2026-04-28 10:22:18'
    },
    {
      session_id: 'demo-session-001',
      controller_name: 'CTRL-03',
      device_name: 'FT-402',
      bus_type: 'HART',
      card_number: 1, card_display: 'CARD-01', port_number: 2, channel_number: 5,
      error_type: 'loop_current_saturated',
      error_description: '4-20 mA loop current at saturation (>20.5 mA) — field device or wiring fault.',
      ldt: '2026-04-28 10:24:30'
    },
    {
      session_id: 'demo-session-001',
      controller_name: 'CTRL-03',
      device_name: 'PT-501',
      bus_type: 'HART',
      card_number: 2, card_display: 'CARD-02', port_number: 1, channel_number: 1,
      error_type: 'open_loop',
      error_description: 'Open loop detected — broken wire or terminal fault in field loop.',
      ldt: '2026-04-28 10:26:02'
    },
    {
      session_id: 'demo-session-001',
      controller_name: 'CTRL-01A',
      device_name: 'XV-601',
      bus_type: 'PROFIBUS_DP',
      card_number: 4, card_display: 'CARD-04', port_number: 1, channel_number: 2,
      error_type: 'device_error',
      error_description: 'Device reporting internal hardware error codes — replacement recommended.',
      ldt: '2026-04-28 11:05:14'
    },
    {
      session_id: 'demo-session-001',
      controller_name: 'CTRL-01A',
      device_name: 'Multiple devices on segment',
      bus_type: 'PROFIBUS_DP',
      card_number: 4, card_display: 'CARD-04', port_number: 1, channel_number: 3,
      error_type: 'device_errors_on_link',
      error_description: 'Multiple devices reporting errors on PROFIBUS segment — check bus termination and segment health.',
      ldt: '2026-04-28 11:07:45'
    },
    {
      session_id: 'demo-session-001',
      controller_name: 'CTRL-02A',
      device_name: 'AIC-701',
      bus_type: 'HART',
      card_number: 3, card_display: 'CARD-03', port_number: 1, channel_number: 4,
      error_type: 'function_block_problems',
      error_description: 'Function block execution issues detected — check control module configuration.',
      ldt: '2026-04-28 11:34:22'
    },
    {
      session_id: 'demo-session-001',
      controller_name: 'CTRL-03',
      device_name: 'TT-801',
      bus_type: 'HART',
      card_number: 2, card_display: 'CARD-02', port_number: 2, channel_number: 5,
      error_type: 'device_not_in_range',
      error_description: 'Device output outside calibrated range — field calibration or process anomaly.',
      ldt: '2026-04-28 11:38:09'
    }
  ];
}

function buildDemoPmNotes() {
  return {
    session_id: 'demo-session-001',
    common_tasks: JSON.stringify([
      'backup_database', 'backup_sound', 'backup_powerup', 'backup_charts',
      'backup_graphics', 'backup_maintenance_tool',
      'all_machines_blown_out', 'keyboards_cleaned', 'monitors_cleaned'
    ]),
    additional_work_notes: [
      'Replaced failed power supply PS-02 in MCC-B with new unit (spare from stock).',
      'Cleaned all filters across 3 cabinets. MCC-C filter was missing — new filter installed.',
      'Tightened loose terminal blocks in MCC-B Zone 2 distribution section.',
      'Repaired loose ground strap on MCC-B main bus bar.',
      'Updated DeltaV hotfix package on CTRL-01A and CTRL-01B to current revision.',
      'Replaced hard drive on WKSTN-01 (Operator Station) — old drive showing SMART pre-failure. New SSD installed.'
    ].join('\n'),
    troubleshooting_notes: [
      'ENTRON SWITCH FAILURE (CRITICAL): Entron switch EKI-7706E in MCC-B is offline and reporting link failure.',
      'Network segment B is currently running in degraded mode through redundant path.',
      'Both cooling fans in MCC-B failed simultaneously — likely single point failure from same power circuit.',
      'Internal cabinet temperature in MCC-B reached 55°C before fans were found failed.',
      'CTRL-01A performance index is at 1/5 — review process load balancing.',
      'CTRL-01B free time at 18% — at risk of exceeding capacity on next scheduled batch cycle.',
      'CIOC module in MCC-C reporting I/O card errors on slot 3 — card may need reseating or replacement.'
    ].join('\n'),
    recommendations_notes: [
      '1. IMMEDIATE (within 1 week): Replace Entron switch EKI-7706E in MCC-B.',
      '2. URGENT (within 2 weeks): Replace both failed cooling fans in MCC-B (part # P0926DU × 2).',
      '3. SCHEDULE (within 30 days): Review process load on CTRL-01A and CTRL-01B — consider redistributing modules to additional controller.',
      '4. SCHEDULE: Replace CIOC I/O card in MCC-C slot 3.',
      '5. MONITOR: CTRL-01A performance index — if it drops below 1 at next PM, controller capacity upgrade required.',
      '6. SCHEDULE: HVAC service for MCC-C room to address elevated ambient temperature.',
      '7. Order replacement terminal lug for MCC-B ground bus — current repair is temporary.'
    ].join('\n')
  };
}

// ─── Critical (all errors) route ─────────────────────────────────────────────

router.get('/', requireAuth, async (req, res) => {
  const pptr = getPuppeteer();
  if (!pptr) return res.status(503).json({ error: 'PDF export is not available', details: 'Puppeteer is not installed.' });

  try {
    const session   = buildDemoSession();
    const diags     = buildDemoDiagnostics();
    await renderPdf(
      res, session,
      buildDemoCabinets(),
      buildDemoNodeMaintenance(),
      diags,
      buildDemoPmNotes(),
      { totalChannels: 256, cardChannels: 224, charmCount: 32, totalErrors: diags.length },
      'PM-Demo-Report-Critical-REDACTED.pdf',
      pptr
    );
  } catch (error) {
    console.error('[DEMO-PDF] critical FAILED', error.message);
    res.status(500).json({ error: 'Demo PDF generation failed', details: error.message });
  }
});

// ─── Shared PDF render helper ─────────────────────────────────────────────────

async function renderPdf(res, session, cabinets, nodeMaintenanceData, diagnostics, pmNotesRow, ioSubsystem, filename, pptr) {
  const log    = (msg) => console.log(`[DEMO-PDF][${filename}]`, msg);
  const logErr = (msg, err) => console.error(`[DEMO-PDF][${filename}]`, msg, err || '');

  const sessionInfo = {
    id: session.id,
    session_name: session.session_name,
    status: session.status,
    customer_name: session.customer_name
  };

  log('Computing risk assessment...');
  const riskResult = generateRiskAssessment(cabinets, nodeMaintenanceData);

  log('Building HTML sections...');
  const coverPageHtml      = generateCoverPage(sessionInfo, session.customer_name, session.completed_at);
  const riskAssessmentHtml = generateRiskAssessmentPage(riskResult, session.session_name, ioSubsystem);
  const maintenanceHtml    = generateMaintenanceReportPage(nodeMaintenanceData);
  const dvSummaryHtml      = generateDiagnosticsSummary(diagnostics, {});
  const cabinetsHtml       = cabinets.map((cab, i) => generateSingleCabinetHtml(cab, sessionInfo, i + 1)).join('');

  const taskLabels = {
    backup_database: 'Database', backup_sound: 'Sound', backup_powerup: 'Power-up',
    backup_charts: 'Charts', backup_event_chronicle: 'Event Chronicle', backup_srs: 'SRS',
    backup_graphics: 'Graphics', backup_maintenance_tool: 'Maintenance Tool',
    backup_ddc: 'DDC', backup_uploaded_sys_reg: 'Uploaded Sys Reg',
    all_machines_blown_out: 'All machines blown out',
    keyboards_cleaned: 'Keyboards cleaned', monitors_cleaned: 'Monitors cleaned'
  };
  const formatTaskLabel = (t) =>
    taskLabels[t] || String(t).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const tasks = JSON.parse(pmNotesRow.common_tasks || '[]').map(formatTaskLabel).filter(Boolean);

  const pmNotesHtml = (pmNotesRow.common_tasks || pmNotesRow.additional_work_notes || pmNotesRow.troubleshooting_notes || pmNotesRow.recommendations_notes) ? `
    <div class="page-break" style="page-break-before: always;">
      <h2 style="text-align: center; color: #2563eb; font-size: 28px; margin: 20px 0; padding: 15px; border-bottom: 3px solid #2563eb;">PM Notes</h2>
      <div style="margin: 30px 0;">
        ${tasks.length > 0 ? `
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #0066cc; margin-bottom: 25px;">
          <h3 style="color: #0066cc; margin: 0 0 15px 0; font-size: 18px; font-weight: bold;">✓ Tasks Completed</h3>
          <ul style="margin: 0; padding-left: 25px; line-height: 1.8;">
            ${tasks.map(t => `<li style="margin: 8px 0; color: #333;">${t}</li>`).join('')}
          </ul>
        </div>` : ''}
        ${pmNotesRow.additional_work_notes ? `
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #0066cc; margin-bottom: 25px;">
          <h3 style="color: #0066cc; margin: 0 0 15px 0; font-size: 18px; font-weight: bold;">Additional Work</h3>
          <p style="margin: 0; line-height: 1.6; color: #333; white-space: pre-wrap;">${pmNotesRow.additional_work_notes.replace(/\n/g, '<br>')}</p>
        </div>` : ''}
        ${pmNotesRow.troubleshooting_notes ? `
        <div style="background: #fff5f5; padding: 20px; border-radius: 8px; border-left: 4px solid #dc3545; margin-bottom: 25px;">
          <h3 style="color: #dc3545; margin: 0 0 15px 0; font-size: 18px; font-weight: bold;">⚠️ Troubleshooting</h3>
          <p style="margin: 0; line-height: 1.6; color: #333; white-space: pre-wrap;">${pmNotesRow.troubleshooting_notes.replace(/\n/g, '<br>')}</p>
        </div>` : ''}
        ${pmNotesRow.recommendations_notes ? `
        <div style="background: #f0f8ff; padding: 20px; border-radius: 8px; border-left: 4px solid #17a2b8; margin-bottom: 25px;">
          <h3 style="color: #17a2b8; margin: 0 0 15px 0; font-size: 18px; font-weight: bold;">💡 Recommendations</h3>
          <p style="margin: 0; line-height: 1.6; color: #333; white-space: pre-wrap;">${pmNotesRow.recommendations_notes.replace(/\n/g, '<br>')}</p>
        </div>` : ''}
      </div>
    </div>` : '';

  const fullHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${session.session_name}</title>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; line-height: 1.4; margin: 0; padding: 20px; color: #333; }
        .page-break { page-break-before: always; }
        .page-break:first-of-type { page-break-before: avoid; }
        .no-errors-section { text-align: center; padding: 24px; background: #f8f9fa; border-radius: 8px; border: 2px solid #28a745; }
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
    </body>
    </html>
  `;

  log('Launching browser for PDF render...');
  const chromePath = await findChrome();
  const browser = await pptr.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-web-security']
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 120000 });
  await new Promise(r => setTimeout(r, 800));

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' }
  });

  await browser.close();
  log(`PDF generated (${Math.round(pdfBuffer.length / 1024)} KB)`);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(pdfBuffer);
}

// ─── Moderate demo data ───────────────────────────────────────────────────────

function buildModerateCabinets() {
  const cab1 = {
    id: 'demo-mod-001',
    cabinet_name: 'MCC-A — Control Room (Moderate Issues)',
    cabinet_date: new Date().toISOString(),
    cabinet_type: 'cabinet',
    rack_has_ups: false, rack_has_hmi: true, rack_has_kvm: false, rack_has_monitor: false,
    power_supplies: [
      // One slightly low — marginal but marked fail
      { voltage_type: '24VDC', line_neutral: 120.3, line_ground: 120.0, neutral_ground: 0.9, dc_reading: 22.5, status: 'fail' },
      { voltage_type: '12VDC', dc_reading: 12.0, status: 'pass' }
    ],
    distribution_blocks: [
      { type: 'Main 24VDC Distribution', dc_reading: 23.7, voltage_type: '24VDC', status: 'pass' },
      // Slightly low reading — marked fail
      { type: 'Zone 2 Distribution', dc_reading: 22.4, voltage_type: '24VDC', status: 'fail' }
    ],
    diodes: [
      { dc_reading: 23.9, voltage_type: '24VDC', status: 'pass' }
    ],
    media_converters: [
      { mc_name: 'MC-01', voltage_type: '24VDC', dc_reading: 24.0, status: 'pass' }
    ],
    power_injected_baseplates: [
      { pib_name: 'Carrier A1', voltage_type: '24VDC', dc_reading: 23.8, status: 'pass' }
    ],
    network_equipment: [
      { equipment_type: 'Managed Switch', model_number: 'Hirschmann RSP-5', node_name: 'NET-SW-01', status: 'pass', condition: 'pass' }
    ],
    controllers: [
      { node_name: 'CTRL-01A', node_type: 'Controller', model: 'DeltaV MD Plus', serial: 'SN-10024-A' },
      { node_name: 'CTRL-01B', node_type: 'Controller', model: 'DeltaV MD Plus', serial: 'SN-10024-B' }
    ],
    inspection: {
      cabinet_fans: 'fail',   // one fan slow — moderate issue
      fan_failures: [{ fan: 'Fan 1 (top)', part_number: 'P0926DU' }],
      controller_leds: 'pass',
      io_status: 'pass',
      network_status: 'pass',
      temperatures: 'fail',   // slightly elevated
      is_clean: 'fail',       // dust accumulation
      clean_filter_installed: 'pass',
      ground_inspection: 'pass',
      comments: 'Fan 1 running slow — replacement recommended at next available window. Dust buildup noted on lower cable trays. Temperature slightly elevated, likely related to fan degradation. Power supply PS-01 DC output marginally low — monitor.'
    }
  };

  const cab2 = {
    id: 'demo-mod-002',
    cabinet_name: 'MCC-B — Field Panel (Moderate Issues)',
    cabinet_date: new Date().toISOString(),
    cabinet_type: 'cabinet',
    rack_has_ups: false, rack_has_hmi: false, rack_has_kvm: false, rack_has_monitor: false,
    power_supplies: [
      { voltage_type: '24VDC', line_neutral: 119.8, line_ground: 119.5, neutral_ground: 0.7, dc_reading: 24.0, status: 'pass' }
    ],
    distribution_blocks: [
      { type: 'Main Distribution', dc_reading: 23.9, voltage_type: '24VDC', status: 'pass' }
    ],
    diodes: [
      { dc_reading: 24.0, voltage_type: '24VDC', status: 'pass' },
      { dc_reading: 22.3, voltage_type: '24VDC', status: 'fail' }  // one marginal diode
    ],
    media_converters: [
      { mc_name: 'MC-02', voltage_type: '24VDC', dc_reading: 24.1, status: 'pass' }
    ],
    power_injected_baseplates: [
      { pib_name: 'Carrier B1', voltage_type: '24VDC', dc_reading: 23.9, status: 'pass' },
      { pib_name: 'Carrier B2', voltage_type: '24VDC', dc_reading: 22.5, status: 'fail' } // marginal
    ],
    network_equipment: [
      { equipment_type: 'Unmanaged Switch', model_number: 'Phoenix Contact FL-2008', node_name: 'NET-SW-02', status: 'fail', condition: 'fail' }
    ],
    controllers: [
      { node_name: 'CTRL-02', node_type: 'CIOC', model: 'DeltaV CIOC/EIOC', serial: 'SN-30045' }
    ],
    inspection: {
      cabinet_fans: 'pass',
      controller_leds: 'pass',
      io_status: 'pass',
      network_status: 'pass',
      temperatures: 'pass',
      is_clean: 'pass',
      clean_filter_installed: 'fail',  // filter dirty, needs replacement
      ground_inspection: 'fail',       // loose lug
      ground_fail_reason: 'Terminal lug on ground bus is slightly loose — re-torqued on site, monitor at next PM',
      comments: 'Filter dirty and replaced during this PM. Ground lug re-torqued. Unmanaged switch reporting link errors on port 3 — check field cable. Diode 2 and Carrier B2 reading slightly below spec — monitor trend.'
    }
  };

  return [cab1, cab2];
}

function buildModerateNodeMaintenance() {
  return [
    // Controller — free time a bit tight but not critical
    {
      id: 2000001, node_name: 'CTRL-01A', node_type: 'Controller',
      model: 'DeltaV MD Plus', serial: 'SN-10024-A',
      redundant: 'yes', partner_serial_number: 'SN-10024-B',
      dv_checked: true, os_checked: true, macafee_checked: true,
      free_time: '', redundancy_checked: true,
      cold_restart_checked: true, has_io_errors: false,
      hdd_replaced: false,
      performance_type: 'free_time', performance_value: 34,
      hf_updated: true, firmware_updated_checked: true,
      notes: 'Free time at 34% — within acceptable range but trending down. Redundancy switch verified OK.',
      completed: true
    },
    // Controller — moderate performance index
    {
      id: 2000002, node_name: 'CTRL-01B', node_type: 'Controller',
      model: 'DeltaV MD Plus', serial: 'SN-10024-B',
      redundant: 'yes', partner_serial_number: 'SN-10024-A',
      dv_checked: true, os_checked: true, macafee_checked: true,
      free_time: '', redundancy_checked: true,
      cold_restart_checked: false, has_io_errors: false,
      hdd_replaced: false,
      performance_type: 'perf_index', performance_value: 3,
      hf_updated: true, firmware_updated_checked: false,
      notes: 'Performance index 3/5 — acceptable. Hotfix update pending.',
      completed: true
    },
    // Workstation — good, but no HDD check done this visit
    {
      id: 1000001, node_name: 'WKSTN-01 Operator Station', node_type: 'Local Operator Station',
      model: 'Dell OptiPlex 7080', serial: 'DELLSVC-ABC123',
      redundant: null, partner_serial_number: null,
      dv_checked: true, os_checked: true, macafee_checked: true,
      free_time: '', redundancy_checked: false,
      cold_restart_checked: false, has_io_errors: false,
      hdd_replaced: false,
      performance_type: 'free_time', performance_value: 55,
      hf_updated: true, firmware_updated_checked: true,
      notes: '',
      completed: true
    }
  ];
}

function buildModerateDiagnostics() {
  return [
    {
      session_id: 'demo-mod-session',
      controller_name: 'CTRL-01A',
      device_name: 'FIC-101',
      bus_type: 'HART',
      card_number: 1, card_display: 'CARD-01', port_number: 1, channel_number: 2,
      error_type: 'warning',
      error_description: 'Device advisory — process variable approaching high limit.',
      ldt: '2026-04-28 09:15:00'
    },
    {
      session_id: 'demo-mod-session',
      controller_name: 'CTRL-01A',
      device_name: 'TIC-201',
      bus_type: 'HART',
      card_number: 1, card_display: 'CARD-01', port_number: 2, channel_number: 1,
      error_type: 'abnormal',
      error_description: 'Process value slightly outside expected range — verify field conditions.',
      ldt: '2026-04-28 09:22:14'
    },
    {
      session_id: 'demo-mod-session',
      controller_name: 'CTRL-02',
      device_name: 'PT-301',
      bus_type: 'PROFIBUS_DP',
      card_number: 2, card_display: 'CARD-02', port_number: 1, channel_number: 1,
      error_type: 'device_error',
      error_description: 'Device reporting non-critical hardware advisory — schedule inspection.',
      ldt: '2026-04-28 10:05:33'
    }
  ];
}

// ─── Clean demo data ──────────────────────────────────────────────────────────

function buildCleanCabinets() {
  const cab1 = {
    id: 'demo-clean-001',
    cabinet_name: 'MCC-A — Control Room (No Issues)',
    cabinet_date: new Date().toISOString(),
    cabinet_type: 'cabinet',
    rack_has_ups: true, rack_has_hmi: true, rack_has_kvm: false, rack_has_monitor: true,
    power_supplies: [
      { voltage_type: '24VDC', line_neutral: 120.1, line_ground: 119.9, neutral_ground: 0.6, dc_reading: 24.1, status: 'pass' },
      { voltage_type: '12VDC', dc_reading: 12.1, status: 'pass' }
    ],
    distribution_blocks: [
      { type: 'Main 24VDC Distribution', dc_reading: 24.0, voltage_type: '24VDC', status: 'pass' },
      { type: 'Zone 1 Distribution',     dc_reading: 24.1, voltage_type: '24VDC', status: 'pass' },
      { type: 'Zone 2 Distribution',     dc_reading: 23.9, voltage_type: '24VDC', status: 'pass' }
    ],
    diodes: [
      { dc_reading: 24.0, voltage_type: '24VDC', status: 'pass' },
      { dc_reading: 23.9, voltage_type: '24VDC', status: 'pass' }
    ],
    media_converters: [
      { mc_name: 'MC-01A', voltage_type: '24VDC', dc_reading: 24.0, status: 'pass' },
      { mc_name: 'MC-01B', voltage_type: '24VDC', dc_reading: 24.1, status: 'pass' }
    ],
    power_injected_baseplates: [
      { pib_name: 'Carrier A1', voltage_type: '24VDC', dc_reading: 24.0, status: 'pass' },
      { pib_name: 'Carrier A2', voltage_type: '24VDC', dc_reading: 24.1, status: 'pass' }
    ],
    network_equipment: [
      { equipment_type: 'Managed Switch',   model_number: 'Hirschmann RSP-5',      node_name: 'NET-SW-01', status: 'pass', condition: 'pass' },
      { equipment_type: 'Fiber Patch Panel', model_number: 'Panduit FPP12',         node_name: 'FIBER-01',  status: 'pass', condition: 'pass' }
    ],
    controllers: [
      { node_name: 'CTRL-01A', node_type: 'Controller', model: 'DeltaV MD Plus', serial: 'SN-10024-A' },
      { node_name: 'CTRL-01B', node_type: 'Controller', model: 'DeltaV MD Plus', serial: 'SN-10024-B' }
    ],
    inspection: {
      cabinet_fans: 'pass',
      controller_leds: 'pass',
      io_status: 'pass',
      network_status: 'pass',
      temperatures: 'pass',
      is_clean: 'pass',
      clean_filter_installed: 'pass',
      ground_inspection: 'pass',
      comments: 'Cabinet in excellent condition. All filters replaced. Enclosure blown out and cleaned. All components within specification.'
    }
  };

  const cab2 = {
    id: 'demo-clean-002',
    cabinet_name: 'MCC-B — Field Panel (No Issues)',
    cabinet_date: new Date().toISOString(),
    cabinet_type: 'cabinet',
    rack_has_ups: false, rack_has_hmi: false, rack_has_kvm: false, rack_has_monitor: false,
    power_supplies: [
      { voltage_type: '24VDC', line_neutral: 120.4, line_ground: 120.2, neutral_ground: 0.8, dc_reading: 24.0, status: 'pass' }
    ],
    distribution_blocks: [
      { type: 'Main Distribution', dc_reading: 24.0, voltage_type: '24VDC', status: 'pass' }
    ],
    diodes: [
      { dc_reading: 23.9, voltage_type: '24VDC', status: 'pass' }
    ],
    media_converters: [
      { mc_name: 'MC-02', voltage_type: '24VDC', dc_reading: 24.0, status: 'pass' }
    ],
    power_injected_baseplates: [
      { pib_name: 'Carrier B1', voltage_type: '24VDC', dc_reading: 24.1, status: 'pass' },
      { pib_name: 'Carrier B2', voltage_type: '24VDC', dc_reading: 24.0, status: 'pass' }
    ],
    network_equipment: [
      { equipment_type: 'Managed Switch', model_number: 'Hirschmann RSP-5', node_name: 'NET-SW-02', status: 'pass', condition: 'pass' }
    ],
    controllers: [
      { node_name: 'CTRL-02', node_type: 'CIOC', model: 'DeltaV CIOC/EIOC', serial: 'SN-30045' }
    ],
    inspection: {
      cabinet_fans: 'pass',
      controller_leds: 'pass',
      io_status: 'pass',
      network_status: 'pass',
      temperatures: 'pass',
      is_clean: 'pass',
      clean_filter_installed: 'pass',
      ground_inspection: 'pass',
      comments: 'No issues found. Cabinet cleaned and inspected. All readings within specification.'
    }
  };

  return [cab1, cab2];
}

function buildCleanNodeMaintenance() {
  return [
    {
      id: 2000001, node_name: 'CTRL-01A', node_type: 'Controller',
      model: 'DeltaV MD Plus', serial: 'SN-10024-A',
      redundant: 'yes', partner_serial_number: 'SN-10024-B',
      dv_checked: true, os_checked: true, macafee_checked: true,
      free_time: '', redundancy_checked: true,
      cold_restart_checked: true, has_io_errors: false,
      hdd_replaced: false,
      performance_type: 'free_time', performance_value: 58,
      hf_updated: true, firmware_updated_checked: true,
      notes: 'All checks passed. Redundancy switch verified OK.',
      completed: true
    },
    {
      id: 2000002, node_name: 'CTRL-01B', node_type: 'Controller',
      model: 'DeltaV MD Plus', serial: 'SN-10024-B',
      redundant: 'yes', partner_serial_number: 'SN-10024-A',
      dv_checked: true, os_checked: true, macafee_checked: true,
      free_time: '', redundancy_checked: true,
      cold_restart_checked: true, has_io_errors: false,
      hdd_replaced: false,
      performance_type: 'perf_index', performance_value: 5,
      hf_updated: true, firmware_updated_checked: true,
      notes: '',
      completed: true
    },
    {
      id: 1000001, node_name: 'WKSTN-01 Operator Station', node_type: 'Local Operator Station',
      model: 'Dell OptiPlex 7080', serial: 'DELLSVC-ABC123',
      redundant: null, partner_serial_number: null,
      dv_checked: true, os_checked: true, macafee_checked: true,
      free_time: '', redundancy_checked: false,
      cold_restart_checked: false, has_io_errors: false,
      hdd_replaced: false,
      performance_type: 'free_time', performance_value: 71,
      hf_updated: true, firmware_updated_checked: true,
      notes: '',
      completed: true
    },
    {
      id: 1000002, node_name: 'WKSTN-02 Engineering Station', node_type: 'Local ProfessionalPlus Station',
      model: 'Dell OptiPlex 7080', serial: 'DELLSVC-DEF456',
      redundant: null, partner_serial_number: null,
      dv_checked: true, os_checked: true, macafee_checked: true,
      free_time: '', redundancy_checked: false,
      cold_restart_checked: false, has_io_errors: false,
      hdd_replaced: false,
      performance_type: 'free_time', performance_value: 68,
      hf_updated: true, firmware_updated_checked: true,
      notes: '',
      completed: true
    },
    {
      id: 3000001, node_name: 'NET-SW-01 Control Room Switch', node_type: 'Smart Network Devices',
      model: 'Hirschmann RSP-5', serial: 'HM-SW-789012',
      redundant: null, partner_serial_number: null,
      dv_checked: false, os_checked: false, macafee_checked: false,
      free_time: '', redundancy_checked: false,
      cold_restart_checked: false, has_io_errors: false,
      hdd_replaced: false,
      performance_type: null, performance_value: null,
      hf_updated: false, firmware_updated_checked: true,
      notes: 'Firmware current. All ports clean.',
      completed: true
    }
  ];
}

// ─── Moderate route ───────────────────────────────────────────────────────────

router.get('/moderate', requireAuth, async (req, res) => {
  const pptr = getPuppeteer();
  if (!pptr) return res.status(503).json({ error: 'PDF export is not available' });

  try {
    const session = {
      id: 'demo-mod-session',
      session_name: '2026 Annual PM — Moderate Issues Demo',
      status: 'completed',
      customer_name: 'REDACTED — Moderate Issues Demo',
      completed_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    };

    await renderPdf(
      res, session,
      buildModerateCabinets(),
      buildModerateNodeMaintenance(),
      buildModerateDiagnostics(),
      {
        common_tasks: JSON.stringify(['backup_database', 'backup_sound', 'backup_graphics', 'all_machines_blown_out', 'keyboards_cleaned']),
        additional_work_notes: 'Replaced dirty filter in MCC-B.\nRe-torqued loose ground lug on MCC-B bus bar.\nCleaned dust accumulation from MCC-A lower cable trays.\nHotfix update pending for CTRL-01B — scheduled for next maintenance window.',
        troubleshooting_notes: 'Fan 1 in MCC-A running slow — bearings may be wearing. Recommend replacement within 30 days.\nUnmanaged switch NET-SW-02 showing link errors on port 3 — field cable inspected, no visible damage. Monitor.\nPower supply PS-01 DC output at 22.5V — below nominal but not yet critical. Trending down over last 2 PMs.',
        recommendations_notes: '1. Replace Fan 1 in MCC-A (part # P0926DU) within 30 days.\n2. Schedule power supply PS-01 replacement at next PM if reading continues to drop.\n3. Apply pending hotfix to CTRL-01B within next maintenance window.\n4. Investigate port 3 cable on NET-SW-02 — consider cable replacement.'
      },
      { totalChannels: 192, cardChannels: 160, charmCount: 32, totalErrors: 3 },
      'PM-Demo-Report-Moderate-REDACTED.pdf',
      pptr
    );
  } catch (error) {
    console.error('[DEMO-PDF] moderate FAILED', error.message);
    res.status(500).json({ error: 'Demo PDF generation failed', details: error.message });
  }
});

// ─── Clean (no errors) route ──────────────────────────────────────────────────

router.get('/clean', requireAuth, async (req, res) => {
  const pptr = getPuppeteer();
  if (!pptr) return res.status(503).json({ error: 'PDF export is not available' });

  try {
    const session = {
      id: 'demo-clean-session',
      session_name: '2026 Annual PM — No Issues Demo',
      status: 'completed',
      customer_name: 'REDACTED — No Issues Demo',
      completed_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    };

    await renderPdf(
      res, session,
      buildCleanCabinets(),
      buildCleanNodeMaintenance(),
      [],   // no diagnostics errors
      {
        common_tasks: JSON.stringify([
          'backup_database', 'backup_sound', 'backup_powerup', 'backup_charts',
          'backup_graphics', 'backup_maintenance_tool', 'backup_event_chronicle',
          'all_machines_blown_out', 'keyboards_cleaned', 'monitors_cleaned'
        ]),
        additional_work_notes: 'Replaced all cabinet filters.\nUpdated DeltaV hotfix package on all controllers and workstations to current revision.\nVerified all UPS battery tests on MCC-A.\nCleaned and inspected all terminal blocks — no loose connections found.',
        troubleshooting_notes: '',
        recommendations_notes: '1. System is operating within all specifications — continue standard maintenance schedule.\n2. Schedule next PM in 12 months.\n3. Consider firmware upgrade on NET-SW-01 when next revision is released.'
      },
      { totalChannels: 192, cardChannels: 160, charmCount: 32, totalErrors: 0 },
      'PM-Demo-Report-Clean-REDACTED.pdf',
      pptr
    );
  } catch (error) {
    console.error('[DEMO-PDF] clean FAILED', error.message);
    res.status(500).json({ error: 'Demo PDF generation failed', details: error.message });
  }
});

module.exports = router;
