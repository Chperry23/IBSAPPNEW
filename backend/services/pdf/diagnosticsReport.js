function generateControllerPage(controllerName, errors, errorTypeLabels) {
  const errorCounts = {};
  errors.forEach(e => {
    errorCounts[e.error_type] = (errorCounts[e.error_type] || 0) + 1;
  });
  
  return `
    <div class="page-break">
      <h2 style="text-align: center; color: #2563eb; font-size: 24px; margin: 20px 0; padding: 15px; border-bottom: 3px solid #2563eb;">Diagnostics Detail: ${controllerName}</h2>
      
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
        <h2 style="text-align: center; color: #2563eb; font-size: 28px; margin: 20px 0; padding: 15px; border-bottom: 3px solid #2563eb;">System Diagnostics</h2>
        <div class="diagnostics-content">
          <div class="no-errors-section" style="text-align: center; padding: 40px; background: #f8f9fa; border-radius: 8px; border: 2px solid #28a745; margin-top: 20px;">
            <div class="success-icon" style="font-size: 48px; margin-bottom: 15px;">✅</div>
            <h2 style="color: #28a745; margin: 15px 0; font-size: 24px;">All Systems Operating Normally</h2>
            <p style="font-size: 16px; color: #666;">No controller errors were detected during this maintenance session.</p>
            <p style="font-size: 14px; color: #888; margin-top: 20px;"><strong>Report Generated:</strong> ${new Date().toLocaleString()}</p>
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
      <h2 style="text-align: center; color: #2563eb; font-size: 28px; margin: 20px 0; padding: 15px; border-bottom: 3px solid #2563eb;">System Diagnostics Summary</h2>
      
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
              <th>Issue Type</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(controllerGroups).flatMap(([name, errors]) => {
              // Group errors by card for this controller
              const cardGroups = {};
              errors.forEach(error => {
                const key = `${error.card_number}`;
                if (!cardGroups[key]) cardGroups[key] = [];
                cardGroups[key].push(error);
              });
              
              return Object.entries(cardGroups).map(([cardKey, cardErrors]) => {
                // Get unique error types for this card
                const errorTypes = [...new Set(cardErrors.map(e => errorTypeLabels[e.error_type] || e.error_type))];
                const channels = cardErrors.map(e => e.channel_number !== null ? `Ch${e.channel_number}` : 'N/A').filter((v, i, a) => a.indexOf(v) === i);
                
                return `
                <tr>
                  <td class="controller-cell">${name}</td>
                  <td class="error-type-cell">${errorTypes.join(', ')}</td>
                  <td class="channel-cell">Card ${cardKey} (${channels.join(', ')})</td>
                </tr>
                `;
              }).join('');
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Note: Detailed per-controller pages have been removed as requested
  // The overview above provides sufficient information
  
  return html;
}

/**
 * Generate comprehensive diagnostics summary with charts
 */
function generateDiagnosticsSummary(diagnosticsData) {
  if (!diagnosticsData || diagnosticsData.length === 0) {
    return `
      <div class="page-break" style="page-break-before: always;">
        <h2 style="text-align: center; color: #2563eb; font-size: 28px; margin: 20px 0; padding: 15px; border-bottom: 3px solid #2563eb;">I/O Errors Summary</h2>
        <div class="no-errors-section" style="text-align: center; padding: 40px; background: #f8f9fa; border-radius: 8px; border: 2px solid #28a745; margin-top: 20px;">
          <div class="success-icon" style="font-size: 48px; margin-bottom: 15px;">✅</div>
          <h2 style="color: #28a745; margin: 15px 0; font-size: 24px;">All Systems Operating Normally</h2>
          <p style="font-size: 16px; color: #666;">No controller errors were detected during this maintenance session.</p>
        </div>
      </div>
    `;
  }

  // Calculate error statistics
  const errorTypeLabels = {
    'bad': 'Component Fault',
    'not_communicating': 'Communication Failure',
    'abnormal': 'Abnormal Status',
    'fail': 'Device Failure',
    'warning': 'Warning Condition'
  };

  const errorCounts = {};
  const controllerGroups = {};
  
  diagnosticsData.forEach(diagnostic => {
    const errorType = diagnostic.error_type;
    errorCounts[errorType] = (errorCounts[errorType] || 0) + 1;
    
    if (!controllerGroups[diagnostic.controller_name]) {
      controllerGroups[diagnostic.controller_name] = [];
    }
    controllerGroups[diagnostic.controller_name].push(diagnostic);
  });

  const totalErrors = diagnosticsData.length;
  const errorTypes = Object.entries(errorCounts).sort((a, b) => b[1] - a[1]);
  
  // Generate bar chart
  const maxCount = Math.max(...Object.values(errorCounts));
  const barChartHtml = errorTypes.map(([type, count]) => {
    const percentage = Math.round((count / totalErrors) * 100);
    const height = Math.round((count / maxCount) * 160);
    return `
      <div class="bar-wrapper">
        <div class="bar-value">${count}</div>
        <div class="bar" style="height: ${height}px;">
          <span class="bar-label">${percentage}%</span>
        </div>
        <div class="bar-category">${errorTypeLabels[type] || type}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="page-break" style="page-break-before: always;">
      <h2 style="text-align: center; color: #2563eb; font-size: 28px; margin: 20px 0; padding: 15px; border-bottom: 3px solid #2563eb;">I/O Errors Summary</h2>
      
      <div class="diagnostics-summary" style="background: #fff5f5; padding: 20px; border-radius: 8px; border-left: 4px solid #dc3545; margin: 20px 0;">
        <h3 style="color: #dc3545; margin: 0 0 15px 0; font-size: 18px;">⚠️ Controller Errors Detected</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <div>
            <div style="font-size: 14px; color: #666; margin-bottom: 5px;">Total Issues Found:</div>
            <div style="font-size: 32px; font-weight: bold; color: #dc3545;">${totalErrors}</div>
          </div>
          <div>
            <div style="font-size: 14px; color: #666; margin-bottom: 5px;">Controllers Affected:</div>
            <div style="font-size: 32px; font-weight: bold; color: #dc3545;">${Object.keys(controllerGroups).length}</div>
          </div>
        </div>
      </div>

      <div class="chart-container" style="margin: 30px 0; page-break-inside: avoid;">
        <h3 class="section-title" style="margin-bottom: 20px;">Error Distribution by Type</h3>
        <div class="bar-chart">
          ${barChartHtml}
        </div>
      </div>

      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #0066cc; margin-top: 30px;">
        <h4 style="color: #0066cc; margin: 0 0 10px 0;">Recommendations</h4>
        <ul style="margin: 10px 0; padding-left: 25px; line-height: 1.8;">
          <li>Review detailed controller breakdown after the cabinet sections</li>
          <li>Priority should be given to controllers with critical status</li>
          <li>Verify all error locations (cards and channels) for accuracy</li>
          <li>Schedule corrective action for high-impact errors</li>
        </ul>
      </div>
    </div>
  `;
}

/**
 * Generate detailed controller breakdown (appears after cabinets)
 */
function generateControllerBreakdown(diagnosticsData) {
  if (!diagnosticsData || diagnosticsData.length === 0) {
    return '';
  }

  const errorTypeLabels = {
    'bad': 'Component Fault',
    'not_communicating': 'Communication Failure',
    'abnormal': 'Abnormal Status',
    'fail': 'Device Failure',
    'warning': 'Warning Condition'
  };

  const controllerGroups = {};
  diagnosticsData.forEach(diagnostic => {
    if (!controllerGroups[diagnostic.controller_name]) {
      controllerGroups[diagnostic.controller_name] = [];
    }
    controllerGroups[diagnostic.controller_name].push(diagnostic);
  });

  return `
    <div class="page-break" style="page-break-before: always;">
      <h2 style="text-align: center; color: #2563eb; font-size: 28px; margin: 20px 0; padding: 15px; border-bottom: 3px solid #2563eb;">I/O Errors - Detailed Error Log</h2>
      
      <div style="margin: 30px 0; page-break-inside: avoid;">
        <h3 class="section-title">Complete Error Log</h3>
        <table style="width: 100%; border-collapse: collapse; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <thead>
            <tr style="background: #2563eb; color: white;">
              <th style="padding: 12px; text-align: left; border: 1px solid #ddd; font-weight: 600;">Controller</th>
              <th style="padding: 12px; text-align: left; border: 1px solid #ddd; font-weight: 600;">Card</th>
              <th style="padding: 12px; text-align: left; border: 1px solid #ddd; font-weight: 600;">Channel</th>
              <th style="padding: 12px; text-align: left; border: 1px solid #ddd; font-weight: 600;">Error Type</th>
              <th style="padding: 12px; text-align: left; border: 1px solid #ddd; font-weight: 600;">Description</th>
            </tr>
          </thead>
          <tbody>
            ${diagnosticsData.map((error, index) => {
              const bgColor = index % 2 === 0 ? '#f8f9fa' : 'white';
              const errorLabel = errorTypeLabels[error.error_type] || error.error_type;
              const description = error.error_description || error.notes || 'No description provided';
              
              return `
              <tr style="background: ${bgColor};">
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: 600;">${error.controller_name}</td>
                <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${error.card_number}</td>
                <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${error.channel_number !== null ? error.channel_number : 'N/A'}</td>
                <td style="padding: 10px; border: 1px solid #ddd;">
                  <span style="background: #dc3545; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">
                    ${errorLabel.toUpperCase()}
                  </span>
                </td>
                <td style="padding: 10px; border: 1px solid #ddd; font-size: 13px; color: #333;">${description}</td>
              </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
      
      <div style="background: #fff3cd; padding: 20px; border-radius: 8px; border-left: 4px solid #ffc107; margin-top: 30px;">
        <h4 style="color: #856404; margin: 0 0 10px 0;">⚠️ Action Required</h4>
        <p style="margin: 5px 0; color: #856404; line-height: 1.6;">
          <strong>${diagnosticsData.length} error(s)</strong> detected across <strong>${Object.keys(controllerGroups).length} controller(s)</strong>. 
          Review each error above and take appropriate corrective action. Verify all custom messages and descriptions for accuracy.
        </p>
      </div>
    </div>
  `;
}

module.exports = { generateDiagnosticsPage, generateControllerPage, generateDiagnosticsSummary, generateControllerBreakdown };

