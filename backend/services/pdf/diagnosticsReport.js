function generateControllerPage(controllerName, errors, errorTypeLabels) {
  const errorCounts = {};
  errors.forEach(e => {
    errorCounts[e.error_type] = (errorCounts[e.error_type] || 0) + 1;
  });
  
  return `
    <div class="page-break">
      <div class="header">
        <div class="logo">
          ECI
          <div class="logo-subtitle">Emerson Impact Partner</div>
        </div>
        <div class="title">Diagnostics Detail: ${controllerName}</div>
      </div>
      
      <div class="controller-overview-section">
        <h3 class="section-title">Controller Summary</h3>
        <table class="overview-table">
          <thead>
            <tr>
              <th>Controller</th>
              <th>Total Errors</th>
              <th>Primary Issue</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="controller-cell">${controllerName}</td>
              <td><strong>${errors.length}</strong></td>
              <td>${Object.entries(errorCounts).sort((a,b) => b[1] - a[1])[0][0]}</td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <div class="error-summary-section">
        <h3 class="section-title">Error Distribution</h3>
        <table class="summary-table">
          <thead>
            <tr>
              <th>Error Type</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(errorCounts).map(([type, count]) => `
              <tr>
                <td class="error-type-cell">${errorTypeLabels[type] || type}</td>
                <td>${count}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      
      <div class="detailed-errors-section">
        <h3 class="section-title">Detailed Error Log</h3>
        <table class="error-details-table">
          <thead>
            <tr>
              <th>Card</th>
              <th>Channel</th>
              <th>Error Type</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            ${errors.map(error => `
              <tr>
                <td class="card-cell">${error.card_number}</td>
                <td class="channel-cell">${error.channel_number !== null ? error.channel_number : 'N/A'}</td>
                <td class="error-type-cell">${errorTypeLabels[error.error_type] || error.error_type}</td>
                <td class="description-cell">${error.error_description || error.notes || 'No description'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function generateDiagnosticsPage(diagnosticsData) {
  if (!diagnosticsData || diagnosticsData.length === 0) {
    return `
      <div class="page-break">
        <div class="header">
          <div class="logo">
            ECI
            <div class="logo-subtitle">Emerson Impact Partner</div>
          </div>
          <div class="title">DeltaV Preventive Maintenance Report</div>
        </div>
        <div class="diagnostics-content">
          <div class="no-errors-section">
            <div class="success-icon">✅</div>
            <h2>All Systems Operating Normally</h2>
            <p>No controller errors were detected during this maintenance session.</p>
            <p><strong>Report Generated:</strong> ${new Date().toLocaleString()}</p>
          </div>
        </div>
      </div>
    `;
  }

  // Group diagnostics by controller
  const controllerGroups = {};
  diagnosticsData.forEach(diagnostic => {
    if (!controllerGroups[diagnostic.controller_name]) {
      controllerGroups[diagnostic.controller_name] = [];
    }
    controllerGroups[diagnostic.controller_name].push(diagnostic);
  });

  // Calculate error type counts globally and per controller
  const globalErrorCounts = {};
  const controllerErrorCounts = {};
  
  diagnosticsData.forEach(diagnostic => {
    const errorType = diagnostic.error_type;
    globalErrorCounts[errorType] = (globalErrorCounts[errorType] || 0) + 1;
    
    if (!controllerErrorCounts[diagnostic.controller_name]) {
      controllerErrorCounts[diagnostic.controller_name] = {};
    }
    controllerErrorCounts[diagnostic.controller_name][errorType] = 
      (controllerErrorCounts[diagnostic.controller_name][errorType] || 0) + 1;
  });

  // Generate global summary section
  const errorTypeLabels = {
    'bad': 'Component Fault',
    'not_communicating': 'Communication Failure',
    'abnormal': 'Abnormal Status',
    'fail': 'Device Failure',
    'warning': 'Warning Condition'
  };

  let html = `
    <div class="page-break">
      <div class="header">
        <div class="logo">
          ECI
          <div class="logo-subtitle">Emerson Impact Partner</div>
        </div>
        <div class="title">System Diagnostics Summary</div>
      </div>
      
      <div class="diagnostics-summary">
        <p>System Health Overview</p>
        <div class="summary-grid">
          <div class="summary-item">
            <span class="summary-label">Total Issues Found:</span>
            <span class="summary-value" style="color: #dc3545;">${diagnosticsData.length}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Controllers Affected:</span>
            <span class="summary-value">${Object.keys(controllerGroups).length}</span>
          </div>
        </div>
      </div>

      <div class="error-distribution-section">
        <h3 class="section-title">Global Error Distribution</h3>
        <table class="summary-table">
          <thead>
            <tr>
              <th>Error Type</th>
              <th>Count</th>
              <th>% of Total</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(globalErrorCounts).sort((a,b) => b[1] - a[1]).map(([type, count]) => `
              <tr>
                <td class="error-type-cell">${errorTypeLabels[type] || type}</td>
                <td>${count}</td>
                <td>${Math.round((count / diagnosticsData.length) * 100)}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="controller-overview-section">
        <h3 class="section-title">Controller Breakdown</h3>
        <table class="overview-table">
          <thead>
            <tr>
              <th>Controller</th>
              <th>Total Errors</th>
              <th>Primary Issue</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(controllerGroups).map(([name, errors]) => {
              // Find most common error for this controller
              const counts = {};
              errors.forEach(e => counts[e.error_type] = (counts[e.error_type] || 0) + 1);
              const primary = Object.entries(counts).sort((a,b) => b[1] - a[1])[0][0];
              
              return `
              <tr>
                <td class="controller-cell">${name}</td>
                <td><strong>${errors.length}</strong></td>
                <td class="error-type-cell">${errorTypeLabels[primary] || primary}</td>
              </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Generate individual pages for each controller
  Object.entries(controllerGroups).sort().forEach(([name, errors]) => {
    html += generateControllerPage(name, errors, errorTypeLabels);
  });

  return html;
}

module.exports = { generateDiagnosticsPage, generateControllerPage };

