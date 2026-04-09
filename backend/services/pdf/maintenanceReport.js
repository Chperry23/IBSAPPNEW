const { getControllerType, getDefaultPerformanceType } = require('../../utils/controllerType');

function generateMaintenanceReportPage(nodeMaintenanceData) {
  if (!nodeMaintenanceData || nodeMaintenanceData.length === 0) {
    return '';
  }

  // Categorize nodes
  const controllers = nodeMaintenanceData.filter(node => {
    const nodeType = (node.node_type || '').toLowerCase();
    const nodeName = (node.node_name || '').toLowerCase();
    const model = (node.model || '').toLowerCase();
    return nodeType.includes('controller') || 
           nodeType.includes('cioc') || 
           nodeType.includes('sis') ||
           nodeType.includes('eioc') ||
           nodeName.includes('csls') ||
           nodeName.includes('-sz') ||
           nodeName.includes('eioc') ||
           model.includes('se4101') ||
           model.includes('ve4021') ||
           /sz0[1-9]/.test(nodeName);
  });

  const computers = nodeMaintenanceData.filter(node => {
    const nodeType = (node.node_type || '').toLowerCase();
    const nodeName = (node.node_name || '').toLowerCase();
    
    return nodeType.includes('workstation') || 
           nodeType.includes('computer') || 
           nodeType.includes('pc') ||
           nodeType.includes('local application') ||
           nodeType.includes('local operator') ||
           nodeType.includes('local professionalplus') ||
           nodeType.includes('hmi') ||
           nodeType.includes('operator') ||
           nodeName.includes('cpu') ||
           nodeName.includes('hmi') ||
           nodeName.includes('workstation') ||
           nodeName.includes('operator');
  });

  const switches = nodeMaintenanceData.filter(node => {
    const nodeType = (node.node_type || '').toLowerCase();
    return nodeType.includes('switch') || 
           nodeType.includes('network');
  });

  const formatPerformance = (node) => {
    if (!node.performance_value || !node.performance_type) return 'N/A';
    
    if (node.performance_type === 'perf_index') {
      const value = node.performance_value;
      const status = value <= 2 ? '⚠️ RISKY' : 'Good';
      return `${value}/5 (${status})`;
    } else if (node.performance_type === 'free_time') {
      const value = node.performance_value;
      const status = value <= 28 ? '⚠️ RISKY' : 'Good';
      return `${value}% (${status})`;
    }
    return 'N/A';
  };

  // Match in-app tables: same column order and labels
  const generateMaintenanceTable = (nodes, title, tableType) => {
    if (nodes.length === 0) return '';

    let headers;
    if (tableType === 'controllers') {
      headers = ['Controller', 'Type', 'Serial', 'Performance', 'DV HF', 'Redundancy', 'Cold Restart', 'Errors', 'Notes/Reason', 'Done'];
    } else if (tableType === 'workstations') {
      headers = ['Computer', 'Type', 'Model', 'DV HF', 'OS Update', 'McAfee', 'HDD Replaced', 'Notes/Reason', 'Done'];
    } else {
      headers = ['Node Name', 'Model', 'Type', 'Serial', 'DV HF', 'Firmware Updated', 'Notes/Reason', 'Done'];
    }

    // has_io_errors false = no I/O issues; true = has I/O issues (Errors column checked)
    const isNoErrors = (node) =>
      node.has_io_errors === false || node.has_io_errors === 0 ? true : false;

    return `
      <div class="maintenance-section">
        <h3 class="section-title">${title}</h3>
        <table class="maintenance-table">
          <thead>
            <tr>
              ${headers.map(header => `<th>${header}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${nodes.map(node => {
              const controllerType = getControllerType(node);
              const isRIU = controllerType === 'RIU';
              const noError = tableType === 'controllers' ? isNoErrors(node) : true;
              const errorsText = noError ? 'No Error' : 'Has Errors';
              const errorsCellClass = noError ? 'no-error-cell' : 'error-cell';

              if (tableType === 'controllers') {
                return `
              <tr>
                <td>${node.node_name || 'Unknown'}</td>
                <td><span class="controller-type ${(controllerType || '').toLowerCase()}">${controllerType || 'Controller'}</span></td>
                <td>${isRIU ? 'N/A' : (node.serial || 'N/A')}</td>
                <td>${formatPerformance(node)}</td>
                <td class="${node.hf_updated ? 'checked-cell' : ''}">${node.hf_updated ? '✅' : ''}</td>
                <td class="${node.redundancy_checked ? 'checked-cell' : ''}">${node.redundancy_checked ? '✅' : ''}</td>
                <td class="${node.cold_restart_checked ? 'checked-cell' : ''}">${node.cold_restart_checked ? '✅' : ''}</td>
                <td class="${errorsCellClass}">${errorsText}</td>
                <td style="font-size: 10px; color: #666;">${node.notes || '—'}</td>
                <td class="${node.completed ? 'checked-cell' : ''}">${node.completed ? '✅' : ''}</td>
              </tr>
              `;
              }
              if (tableType === 'workstations') {
                return `
              <tr>
                <td>${node.node_name || 'Unknown'}</td>
                <td>${(node.node_type || '—')}</td>
                <td>${node.model || '—'}</td>
                <td class="${node.dv_checked ? 'checked-cell' : ''}">${node.dv_checked ? '✅' : ''}</td>
                <td class="${node.os_checked ? 'checked-cell' : ''}">${node.os_checked ? '✅' : ''}</td>
                <td class="${node.macafee_checked ? 'checked-cell' : ''}">${node.macafee_checked ? '✅' : ''}</td>
                <td class="${node.hdd_replaced ? 'checked-cell' : ''}">${node.hdd_replaced ? '✅' : ''}</td>
                <td style="font-size: 10px; color: #666;">${node.notes || '—'}</td>
                <td class="${node.completed ? 'checked-cell' : ''}">${node.completed ? '✅' : ''}</td>
              </tr>
              `;
              }
              return `
              <tr>
                <td>${node.node_name || 'Unknown'}</td>
                <td>${node.model || '—'}</td>
                <td>${(node.node_type || '—')}</td>
                <td>${node.serial || 'N/A'}</td>
                <td class="${node.hf_updated ? 'checked-cell' : ''}">${node.hf_updated ? '✅' : ''}</td>
                <td class="${node.firmware_updated_checked ? 'checked-cell' : ''}">${node.firmware_updated_checked ? '✅' : ''}</td>
                <td style="font-size: 10px; color: #666;">${node.notes || '—'}</td>
                <td class="${node.completed ? 'checked-cell' : ''}">${node.completed ? '✅' : ''}</td>
              </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  };

  // Generate maintenance summary
  const totalNodes = nodeMaintenanceData.length;
  const hfUpdated = nodeMaintenanceData.filter(n => n.hf_updated).length;
  const hddReplaced = computers.filter(n => n.hdd_replaced).length;
  const firmwareUpdated = switches.filter(n => n.firmware_updated_checked).length;
  const performanceIssues = controllers.filter(n => {
    if (!n.performance_value || !n.performance_type) return false;
    return (n.performance_type === 'perf_index' && n.performance_value <= 2) ||
           (n.performance_type === 'free_time' && n.performance_value <= 28);
  }).length;

  return `
    <div class="page-break" style="page-break-before: always;">
      <h2 style="text-align: center; color: #2563eb; font-size: 28px; margin: 20px 0; padding: 15px; border-bottom: 3px solid #2563eb;">Node Maintenance Report</h2>

      ${controllers.length ? `
      <div style="background:#fffbe6; border-left:4px solid #f0a500; padding:12px 16px; margin-bottom:16px; font-size:11px; border-radius:2px;">
        <strong>Controller Performance Reference (KBA AP-0900-0129)</strong>
        <p style="margin:6px 0 4px;">Controllers use one of two diagnostic parameters depending on hardware/software generation:</p>
        <ul style="margin:0 0 4px; padding-left:18px;">
          <li><strong>FRETIM (Free Time %)</strong> &mdash; Recommended minimum: <strong>20%</strong> (M5/M5 Plus, MD/MD Plus, MX, SD Plus, SX).
              For controllers using CIOC: no less than <strong>28%</strong> (SD Plus and SX).</li>
          <li><strong>PERF_INDEX (Performance Index)</strong> &mdash; Recommended minimum: <strong>2 or higher</strong> on all sub-indices
              (Control, Comms, System, Free Memory). The overall Performance Index is determined by the lowest sub-score.</li>
        </ul>
        <p style="margin:0;">Values shown as <strong>&#9888; RISKY</strong> in the table below are below these thresholds and should be trended historically for optimal controller performance.</p>
      </div>
      ` : ''}

      ${controllers.length ? generateMaintenanceTable(controllers, 'Controllers', 'controllers') : ''}
    </div>
    ${computers.length ? `<div style="page-break-before: always;">${generateMaintenanceTable(computers, 'Computers & Workstations', 'workstations')}</div>` : ''}
    ${switches.length ? `<div style="page-break-before: always;">${generateMaintenanceTable(switches, 'Network Switches', 'switches')}</div>` : ''}

      ${hddReplaced > 0 ? `
        <div class="maintenance-section">
          <h3 class="section-title">HDD Replacement Reports</h3>
          <ul class="maintenance-reports">
            ${computers.filter(n => n.hdd_replaced).map(node => 
              `<li>Bad hard drive found on station '${node.node_name}' and was replaced</li>`
            ).join('')}
          </ul>
        </div>
      ` : ''}

      ${performanceIssues > 0 ? `
        <div class="maintenance-section">
          <h3 class="section-title">Performance Concerns</h3>
          <ul class="maintenance-reports warning">
            ${controllers.filter(n => {
              if (!n.performance_value || !n.performance_type) return false;
              return (n.performance_type === 'perf_index' && n.performance_value <= 2) ||
                     (n.performance_type === 'free_time' && n.performance_value <= 28);
            }).map(node => {
              const perfText = node.performance_type === 'perf_index' 
                ? `Performance Index ${node.performance_value}/5`
                : `Free Time ${node.performance_value}%`;
              return `<li>Controller '${node.node_name}' showing ${perfText} - Monitor for degraded performance</li>`;
            }).join('')}
          </ul>
        </div>
      ` : ''}
  `;
}

module.exports = { generateMaintenanceReportPage };

