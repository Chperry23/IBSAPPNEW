const { getEnhancedControllerType } = require('../../utils/controllerType');
const { formatDate, formatStatus, formatValue } = require('../../utils/dateFormat');

function getSharedStyles() {
  return `
    .header { 
      display: flex; 
      justify-content: space-between; 
      align-items: center; 
      margin-bottom: 15px;
      padding-bottom: 8px;
      border-bottom: 3px solid #2563eb;
    }
    .logo { 
      font-size: 28px; 
      font-weight: bold; 
      color: #2563eb; 
    }
    .logo-subtitle {
      font-size: 14px;
      color: #666;
      font-weight: normal;
    }
    .title { 
      text-align: center; 
      font-size: 20px; 
      font-weight: bold;
      color: #333;
    }
    .cabinet-title {
      text-align: center;
      font-size: 28px;
      font-weight: bold;
      color: #2563eb;
      background: linear-gradient(135deg, #f8f9fa, #e9ecef);
      border: 3px solid #2563eb;
      border-radius: 12px;
      padding: 20px;
      margin: 30px 0;
      box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    }
    .info-section { 
      margin-bottom: 25px;
      background: #f8f9fa;
      padding: 15px;
      border-radius: 8px;
      border-left: 4px solid #0066cc;
    }
    .info-row { 
      display: flex; 
      margin-bottom: 8px; 
    }
    .info-label { 
      width: 150px; 
      font-weight: bold;
      color: #0066cc;
    }
    .info-value { 
      flex: 1; 
      border-bottom: 1px dotted #ccc; 
      padding-bottom: 2px; 
      min-height: 18px;
    }
    table { 
      width: 100%; 
      border-collapse: collapse; 
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    th, td { 
      border: 1px solid #0066cc; 
      padding: 8px; 
      text-align: left; 
      vertical-align: top;
    }
    th { 
      background: linear-gradient(135deg, #0066cc, #0052a3);
      color: white;
      font-weight: bold; 
      text-align: center;
    }
    .section-title { 
      font-size: 16px; 
      font-weight: bold; 
      margin: 25px 0 15px 0; 
      padding: 10px 15px;
      background: linear-gradient(135deg, #0066cc, #0052a3);
      color: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .status-pass { color: #28a745; font-weight: bold; }
    .status-fail { color: #dc3545; font-weight: bold; }
            .checked-cell { background-color: #d4edda; border-left: 3px solid #28a745; font-weight: bold; }
        .error-cell { background-color: #f8d7da; border-left: 3px solid #dc3545; font-weight: bold; color: #721c24; }
        .no-error-cell { background-color: #d4edda; border-left: 3px solid #28a745; font-weight: bold; color: #155724; }
    .status-na { color: #6c757d; font-style: italic; }
    .inspection-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      margin-bottom: 20px;
    }
    .inspection-item {
      display: flex;
      justify-content: space-between;
    }
    
    /* Risk Assessment Styles */
    .risk-summary {
      display: flex;
      align-items: center;
      margin-bottom: 30px;
      gap: 30px;
    }
    .risk-score-box {
      text-align: center;
      padding: 20px;
      border-radius: 12px;
      min-width: 150px;
      box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    }
    .risk-score {
      font-size: 48px;
      font-weight: bold;
      line-height: 1;
    }
    .risk-level {
      font-size: 16px;
      font-weight: bold;
      margin-top: 5px;
    }
    .risk-stats {
      flex: 1;
    }
    .stat-item {
      display: flex;
      justify-content: space-between;
      margin: 10px 0;
      padding: 8px 0;
      border-bottom: 1px solid #eee;
    }
    .stat-label {
      font-weight: bold;
      color: #0066cc;
    }
    .stat-value {
      font-weight: bold;
    }
    
    .issues-section {
      margin: 25px 0;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .issues-section.critical {
      border: 2px solid #dc3545;
    }
    .issues-section.warning {
      border: 2px solid #ffc107;
    }
    .issues-section.slight {
      border: 2px solid #17a2b8;
    }
    .issues-header {
      padding: 12px 15px;
      font-weight: bold;
      font-size: 14px;
    }
    .issues-section.critical .issues-header {
      background: #dc3545;
      color: white;
    }
    .issues-section.warning .issues-header {
      background: #ffc107;
      color: #333;
    }
    .issues-section.slight .issues-header {
      background: #17a2b8;
      color: white;
    }
    .issues-list {
      margin: 0;
      padding: 15px 20px;
      background: white;
    }
    .issues-list li {
      margin: 8px 0;
      line-height: 1.4;
    }
    
    .recommendations-section {
      margin: 25px 0;
      background: #f8f9fa;
      border: 2px solid #0066cc;
      border-radius: 8px;
      overflow: hidden;
    }
    .recommendations-header {
      background: linear-gradient(135deg, #0066cc, #0052a3);
      color: white;
      padding: 12px 15px;
      font-weight: bold;
      font-size: 14px;
    }
    .recommendations-list {
      margin: 0;
      padding: 15px 20px;
      background: white;
    }
    .recommendations-list li {
      margin: 8px 0;
      line-height: 1.4;
    }
    
    .voltage-specs {
      margin: 25px 0;
    }
    .specs-header {
      font-size: 16px;
      font-weight: bold;
      margin: 25px 0 15px 0;
      padding: 10px 15px;
      background: linear-gradient(135deg, #0066cc, #0052a3);
      color: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .risk-breakdown-section {
      margin: 25px 0;
      background: #f8f9fa;
      border: 2px solid #6c757d;
      border-radius: 8px;
      overflow: hidden;
    }
    .breakdown-header {
      background: #6c757d;
      color: white;
      padding: 12px 15px;
      font-weight: bold;
      font-size: 14px;
    }
    .breakdown-list {
      margin: 0;
      padding: 15px 20px;
      background: white;
    }
    .breakdown-list li {
      margin: 6px 0;
      line-height: 1.3;
      font-size: 13px;
      color: #495057;
    }
    .total-score {
      background: #e9ecef;
      padding: 12px 20px;
      font-weight: bold;
      font-size: 16px;
      color: #0066cc;
      border-top: 1px solid #dee2e6;
    }
      align-items: center;
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 6px;
      background: #f8f9fa;
    }
    .inspection-item:nth-child(odd) {
      background: #e3f2fd;
    }
    .comments-section {
      margin-top: 25px;
      border: 2px solid #0066cc;
      border-radius: 8px;
      overflow: hidden;
    }
    .comments-header {
      background: linear-gradient(135deg, #0066cc, #0052a3);
      color: white;
      padding: 12px;
      font-weight: bold;
      font-size: 14px;
    }
    .comments-body {
      padding: 15px;
      min-height: 80px;
      background: white;
    }
    tr:nth-child(even) { background-color: #f8f9fa; }
    
    /* Page Break Rules */
    .cabinet-title { page-break-before: auto; page-break-after: avoid; page-break-inside: avoid; }
    .section-title { page-break-after: avoid; page-break-inside: avoid; }
    .maintenance-table { page-break-inside: auto; }
    table { page-break-inside: avoid; }
    .info-section { page-break-inside: avoid; }
    .inspection-grid { page-break-inside: avoid; }
    .comments-section { page-break-inside: avoid; }
    .risk-summary { page-break-inside: avoid; }
    .issues-section { page-break-inside: avoid; }
    .recommendations-section { page-break-inside: avoid; }
    .voltage-specs { page-break-inside: avoid; }
    .risk-breakdown-section { page-break-inside: avoid; }
    
    /* Diagnostics Page Break Rules */
    .header { page-break-after: avoid; page-break-inside: avoid; }
    .summary-section { page-break-inside: avoid; }
    .error-distribution-section { page-break-inside: avoid; }
    .controller-overview-section { page-break-inside: avoid; }
    .error-summary-section { page-break-inside: avoid; }
    .detailed-errors-section { page-break-inside: auto; }
    .card-error-section { page-break-inside: avoid; }
    .error-details-table { page-break-inside: auto; }
    .summary-table { page-break-inside: avoid; }
    .overview-table { page-break-inside: avoid; }
    
    @media print {
      .cabinet-title { page-break-before: auto; page-break-after: avoid; page-break-inside: avoid; }
      .section-title { page-break-after: avoid; page-break-inside: avoid; }
      .maintenance-table { page-break-inside: auto; }
      table { page-break-inside: avoid; }
      .info-section { page-break-inside: avoid; }
      .inspection-grid { page-break-inside: avoid; }
      .comments-section { page-break-inside: avoid; }
      .risk-summary { page-break-inside: avoid; }
      .issues-section { page-break-inside: avoid; }
      .recommendations-section { page-break-inside: avoid; }
      .voltage-specs { page-break-inside: avoid; }
      .risk-breakdown-section { page-break-inside: avoid; }
      
      /* Diagnostics Print Rules */
      .header { page-break-after: avoid; page-break-inside: avoid; }
      .summary-section { page-break-inside: avoid; }
      .error-distribution-section { page-break-inside: avoid; }
      .controller-overview-section { page-break-inside: avoid; }
      .error-summary-section { page-break-inside: avoid; }
      .detailed-errors-section { page-break-inside: auto; }
      .card-error-section { page-break-inside: avoid; }
      .error-details-table { page-break-inside: auto; }
      .summary-table { page-break-inside: avoid; }
      .overview-table { page-break-inside: avoid; }
    }
    
    @page { margin: 0.5in; }
    
    /* Maintenance Report Styles */
    .maintenance-summary {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 8px;
      border-left: 4px solid #0066cc;
      margin-bottom: 30px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      margin-top: 15px;
    }
    .summary-item {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px dotted #ccc;
    }
    .summary-item.performance-warning {
      color: #dc3545;
      font-weight: bold;
    }
    .summary-label {
      font-weight: bold;
      color: #0066cc;
    }
    .summary-value {
      font-weight: bold;
    }
    .maintenance-section {
      margin-bottom: 10px;
      page-break-inside: auto;
    }
    .maintenance-table {
      font-size: 10px;
    }
    .maintenance-table th {
      font-size: 9px;
      padding: 4px;
    }
    .maintenance-table td {
      padding: 4px;
      font-size: 9px;
    }
    .controller-type {
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: bold;
    }
    .controller-type.controller {
      background: #007bff;
      color: white;
    }
    .controller-type.cioc {
      background: #fd7e14;
      color: white;
    }
    .controller-type.sis {
      background: #dc3545;
      color: white;
    }
    .maintenance-reports {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 8px;
      border-left: 4px solid #0066cc;
    }
    .maintenance-reports.warning {
      border-left-color: #dc3545;
      background: #fff5f5;
    }
    .maintenance-reports li {
      margin-bottom: 8px;
    }
    
    /* Diagnostics Table Styles */
    .diagnostics-content {
      margin-top: 20px;
    }
    
    .diagnostics-summary {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 8px;
      border-left: 4px solid #dc3545;
      margin-bottom: 20px;
    }
    
    .diagnostics-summary p {
      margin: 5px 0;
      font-weight: 600;
    }
    
    .diagnostics-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
      font-size: 12px;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    
    .diagnostics-table th {
      background: linear-gradient(145deg, #f1f5f9, #e2e8f0);
      padding: 12px 8px;
      text-align: left;
      font-weight: 700;
      color: #334155;
      border-bottom: 2px solid #cbd5e1;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .diagnostics-table td {
      padding: 10px 8px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
    }
    
    .diagnostics-table tbody tr:nth-child(even) {
      background-color: #f9fafb;
    }
    
    .controller-cell {
      font-weight: 700;
      color: #1e40af;
    }
    
    .card-cell {
      font-weight: 600;
      color: #7c3aed;
    }
    
    .channel-cell {
      font-weight: 600;
      color: #0891b2;
    }
    
    .error-type-cell {
      font-weight: 600;
      color: #dc2626;
    }
    
    .description-cell {
      color: #374151;
      max-width: 200px;
      word-wrap: break-word;
    }
  `;
}

function generateSingleCabinetHtml(cabinet, sessionInfo, cabinetNumber) {
  const powerSupplies = cabinet.power_supplies || [];
  const distributionBlocks = cabinet.distribution_blocks || [];
  const diodes = cabinet.diodes || [];
  const inspection = cabinet.inspection || {};
  const networkEquipment = cabinet.network_equipment || [];
  const controllers = cabinet.controllers || [];
  
  return `
    <div class="header">
      <div class="logo">
        ECI
        <div class="logo-subtitle">Emerson Impact Partner</div>
      </div>
      <div class="title">DeltaV Preventive Maintenance Report</div>
    </div>
    
    <div class="cabinet-title">
      Cabinet ${cabinetNumber}: ${cabinet.cabinet_location}
    </div>
    
    <div class="info-section">
      <div class="info-row">
        <span class="info-label">Cabinet Location:</span>
        <span class="info-value">${cabinet.cabinet_location}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Date:</span>
        <span class="info-value">${formatDate(cabinet.cabinet_date)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Session:</span>
        <span class="info-value">${sessionInfo.session_name || ''}</span>
      </div>
    </div>
    
    ${powerSupplies.length > 0 ? `
    <div class="section-title">Power Supply Measurements</div>
    <table>
      <thead>
        <tr>
          <th>Voltage Type</th>
          <th>Line to Neutral (V)</th>
          <th>Line to Ground (V)</th>
          <th>Neutral to Ground (mV)</th>
          <th>DC Reading (V)</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${powerSupplies.map(ps => `
          <tr>
            <td><strong>${ps.voltage_type}</strong></td>
            <td>${formatValue(ps.line_neutral)}</td>
            <td>${formatValue(ps.line_ground)}</td>
            <td>${formatValue(ps.neutral_ground)}</td>
            <td>${formatValue(ps.dc_reading)}</td>
            <td class="status-${ps.status}">${formatStatus(ps.status)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}
    
    ${distributionBlocks.length > 0 ? `
    <div class="section-title">Distribution Blocks</div>
    <table>
      <thead>
        <tr>
          <th>Block #</th>
          <th>DC Reading (V)</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${distributionBlocks.map((block, index) => `
          <tr>
            <td><strong>${index + 1}</strong></td>
            <td>${formatValue(block.dc_reading)}</td>
            <td class="status-${block.status}">${formatStatus(block.status)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}
    
    ${diodes.length > 0 ? `
    <div class="section-title">Diodes</div>
    <table>
      <thead>
        <tr>
          <th>Diode #</th>
          <th>DC Reading (V)</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${diodes.map((diode, index) => `
          <tr>
            <td><strong>${index + 1}</strong></td>
            <td>${formatValue(diode.dc_reading)}</td>
            <td class="status-${diode.status}">${formatStatus(diode.status)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}
    
    <div class="section-title">Inspection Items</div>
    <div class="inspection-grid">
      <div class="inspection-item">
        <span><strong>Cabinet fans running (if installed)</strong></span>
        <span class="status-${inspection.cabinet_fans || 'pass'}">${formatStatus(inspection.cabinet_fans)}</span>
      </div>
      <div class="inspection-item">
        <span><strong>Controller Status LEDs</strong></span>
        <span class="status-${inspection.controller_leds || 'pass'}">${formatStatus(inspection.controller_leds)}</span>
      </div>
      <div class="inspection-item">
        <span><strong>I/O Status LEDs</strong></span>
        <span class="status-${inspection.io_status || 'pass'}">${formatStatus(inspection.io_status)}</span>
      </div>
      <div class="inspection-item">
        <span><strong>Network Equipment Status</strong></span>
        <span class="status-${inspection.network_status || 'pass'}">${formatStatus(inspection.network_status)}</span>
      </div>
      <div class="inspection-item">
        <span><strong>Environmental Temperatures</strong></span>
        <span class="status-${inspection.temperatures || 'pass'}">${formatStatus(inspection.temperatures)}</span>
      </div>
      <div class="inspection-item">
        <span><strong>Cleaned Enclosure</strong></span>
        <span class="status-${inspection.is_clean || 'pass'}">${formatStatus(inspection.is_clean)}</span>
      </div>
      <div class="inspection-item">
        <span><strong>Clean filter installed</strong></span>
        <span class="status-${inspection.clean_filter_installed || 'pass'}">${formatStatus(inspection.clean_filter_installed)}</span>
      </div>
      <div class="inspection-item">
        <span><strong>Ground Inspection</strong></span>
        <span class="status-${inspection.ground_inspection || 'pass'}">${formatStatus(inspection.ground_inspection)}</span>
      </div>
    </div>
    
    ${networkEquipment.length > 0 ? `
    <div class="section-title">Network Equipment</div>
    <table>
      <thead>
        <tr>
          <th>Equipment Type</th>
          <th>Model Number</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${networkEquipment.map(equipment => `
          <tr>
            <td><strong>${equipment.equipment_type}</strong></td>
            <td>${equipment.model_number || 'Not specified'}</td>
            <td class="status-${equipment.status}">${formatStatus(equipment.status)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}
    
    ${controllers.length > 0 ? `
    <div class="section-title">Controllers</div>
    <table>
      <thead>
        <tr>
          <th>Controller Name</th>
          <th>Type</th>
          <th>Model</th>
          <th>Serial</th>
        </tr>
      </thead>
      <tbody>
        ${controllers.map(controller => `
          <tr>
            <td><strong>${controller.node_name || 'Unnamed Controller'}</strong></td>
            <td><strong>${getEnhancedControllerType(controller)}</strong></td>
            <td>${controller.model || 'Unknown'}</td>
            <td>${controller.serial || 'No Serial'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}
    
    ${inspection.comments && inspection.comments.trim() ? `
    <div class="comments-section">
      <div class="comments-header">Comments</div>
      <div class="comments-body">
        ${inspection.comments.replace(/\n/g, '<br>')}
      </div>
    </div>
    ` : ''}
  `;
}

function generatePDFHtml(data) {
  const { cabinet, sessionInfo } = data;
  const powerSupplies = cabinet.power_supplies || [];
  const distributionBlocks = cabinet.distribution_blocks || [];
  const diodes = cabinet.diodes || [];
  const inspection = cabinet.inspection || {};
  const networkEquipment = cabinet.network_equipment || [];
  const controllers = cabinet.controllers || [];
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>DeltaV Preventive Maintenance Report</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          font-size: 12px; 
          line-height: 1.4;
          margin: 0;
          padding: 20px;
          color: #333;
        }
        ${getSharedStyles()}
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo">
          ECI
          <div class="logo-subtitle">Emerson Impact Partner</div>
        </div>
        <div class="title">DeltaV Preventive Maintenance Report</div>
      </div>
      
      <div class="info-section">
        <div class="info-row">
          <span class="info-label">Cabinet Location:</span>
          <span class="info-value">${cabinet.cabinet_location}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Date:</span>
          <span class="info-value">${formatDate(cabinet.cabinet_date)}</span>
        </div>
      </div>
      
      ${powerSupplies.length > 0 ? `
      <div class="section-title">Power Supply Measurements</div>
      <table>
        <thead>
          <tr>
            <th>Voltage Type</th>
            <th>Line to Neutral (V)</th>
            <th>Line to Ground (V)</th>
            <th>Neutral to Ground (mV)</th>
            <th>DC Reading (V)</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${powerSupplies.map(ps => `
            <tr>
              <td><strong>${ps.voltage_type}</strong></td>
              <td>${formatValue(ps.line_neutral)}</td>
              <td>${formatValue(ps.line_ground)}</td>
              <td>${formatValue(ps.neutral_ground)}</td>
              <td>${formatValue(ps.dc_reading)}</td>
              <td class="status-${ps.status}">${formatStatus(ps.status)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ` : ''}
      
      ${distributionBlocks.length > 0 ? `
      <div class="section-title">Distribution Blocks</div>
      <table>
        <thead>
          <tr>
            <th>Block #</th>
            <th>DC Reading (V)</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${distributionBlocks.map((block, index) => `
            <tr>
              <td><strong>${index + 1}</strong></td>
              <td>${formatValue(block.dc_reading)}</td>
              <td class="status-${block.status}">${formatStatus(block.status)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ` : ''}
      
      ${diodes.length > 0 ? `
      <div class="section-title">Diodes</div>
      <table>
        <thead>
          <tr>
            <th>Diode #</th>
            <th>DC Reading (V)</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${diodes.map((diode, index) => `
            <tr>
              <td><strong>${index + 1}</strong></td>
              <td>${formatValue(diode.dc_reading)}</td>
              <td class="status-${diode.status}">${formatStatus(diode.status)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ` : ''}
      
      <div class="section-title">Inspection Items</div>
      <div class="inspection-grid">
        <div class="inspection-item">
          <span><strong>Cabinet fans running (if installed)</strong></span>
          <span class="status-${inspection.cabinet_fans || 'pass'}">${formatStatus(inspection.cabinet_fans)}</span>
        </div>
        <div class="inspection-item">
          <span><strong>Controller Status LEDs</strong></span>
          <span class="status-${inspection.controller_leds || 'pass'}">${formatStatus(inspection.controller_leds)}</span>
        </div>
        <div class="inspection-item">
          <span><strong>I/O Status LEDs</strong></span>
          <span class="status-${inspection.io_status || 'pass'}">${formatStatus(inspection.io_status)}</span>
        </div>
        <div class="inspection-item">
          <span><strong>Network Equipment Status</strong></span>
          <span class="status-${inspection.network_status || 'pass'}">${formatStatus(inspection.network_status)}</span>
        </div>
        <div class="inspection-item">
          <span><strong>Environmental Temperatures</strong></span>
          <span class="status-${inspection.temperatures || 'pass'}">${formatStatus(inspection.temperatures)}</span>
        </div>
        <div class="inspection-item">
          <span><strong>Cleaned Enclosure</strong></span>
          <span class="status-${inspection.is_clean || 'pass'}">${formatStatus(inspection.is_clean)}</span>
        </div>
        <div class="inspection-item">
          <span><strong>Clean filter installed</strong></span>
          <span class="status-${inspection.clean_filter_installed || 'pass'}">${formatStatus(inspection.clean_filter_installed)}</span>
        </div>
        <div class="inspection-item">
          <span><strong>Ground Inspection</strong></span>
          <span class="status-${inspection.ground_inspection || 'pass'}">${formatStatus(inspection.ground_inspection)}</span>
        </div>
      </div>
      
      ${networkEquipment.length > 0 ? `
      <div class="section-title">Network Equipment</div>
      <table>
        <thead>
          <tr>
            <th>Equipment Type</th>
            <th>Model Number</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${networkEquipment.map(equipment => `
            <tr>
              <td><strong>${equipment.equipment_type}</strong></td>
              <td>${equipment.model_number || 'Not specified'}</td>
              <td class="status-${equipment.status}">${formatStatus(equipment.status)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ` : ''}
      
      ${controllers.length > 0 ? `
      <div class="section-title">Controllers</div>
      <table>
        <thead>
          <tr>
            <th>Controller Name</th>
            <th>Type</th>
            <th>Model</th>
            <th>Serial</th>
          </tr>
        </thead>
        <tbody>
          ${controllers.map(controller => `
            <tr>
              <td><strong>${controller.node_name || 'Unnamed Controller'}</strong></td>
              <td><strong>${getEnhancedControllerType(controller)}</strong></td>
              <td>${controller.model || 'Unknown'}</td>
              <td>${controller.serial || 'No Serial'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ` : ''}
      
      ${inspection.comments && inspection.comments.trim() ? `
      <div class="comments-section">
        <div class="comments-header">Comments</div>
        <div class="comments-body">
          ${inspection.comments.replace(/\n/g, '<br>')}
        </div>
      </div>
      ` : ''}
      
      <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #0066cc; text-align: center; color: #666;">
        <p><strong>Report generated on ${formatDate(new Date().toISOString())}</strong></p>
        <p style="font-size: 10px;">This report was automatically generated by the Cabinet PM System</p>
      </div>
    </body>
    </html>
  `;
}

module.exports = { getSharedStyles, generateSingleCabinetHtml, generatePDFHtml };

