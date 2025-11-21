const fs = require('fs');
const path = require('path');
const db = require('../../config/database'); // Used in generateCombinedIIPDF for querying items

// Helper function to get base64 logo
function getBase64Logo() {
  let logoData = '';
  
  // Determine base path
  // From backend/services/pdf/ to TABLET-DEPLOYMENT/
  const basePath = path.resolve(__dirname, '../../../');
  
  // Try multiple logo paths - prioritize Lifecycle logo
  const logoPaths = [
    path.join(basePath, 'assets', 'Lifecycle logo.png'),
    path.join(basePath, 'frontend/public/assets', 'Lifecycle logo.png'),
    path.join(basePath, 'assets', 'deltav-logo.png'),
    path.join(basePath, 'assets', 'eci-logo.png')
  ];
  
  for (const logoPath of logoPaths) {
    try {
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        logoData = logoBuffer.toString('base64');
        break;
      }
    } catch (error) {
      console.log(`⚠️  DEBUG: Could not load logo from ${logoPath}:`, error.message);
    }
  }
  
  return logoData;
}

// Generate combined I&I PDF for all documents in a session
async function generateCombinedIIPDF(session, documents) {
  const logoData = getBase64Logo();
  const currentDate = new Date().toLocaleDateString('en-US');
  
  // Generate cover page
  const coverPage = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>DeltaV I&I Report - ${session.session_name}</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          margin: 0; 
          padding: 40px; 
          font-size: 12px; 
          line-height: 1.4;
          text-align: center;
        }
        .logo { 
          max-width: 150px; 
          height: auto; 
          margin-bottom: 30px;
        }
        .main-title {
          font-size: 24px;
          font-weight: bold;
          margin-bottom: 10px;
          color: #2563eb;
        }
        .subtitle {
          font-size: 16px;
          margin-bottom: 20px;
          color: #374151;
        }
        .for-section {
          font-size: 14px;
          margin: 30px 0;
        }
        .customer-info {
          margin: 20px 0;
          font-size: 14px;
        }
        .revision-table {
          width: 100%;
          border-collapse: collapse; 
          margin: 30px 0;
          font-size: 10px;
        }
        .revision-table th, .revision-table td {
          border: 1px solid #000;
          padding: 8px; 
          text-align: left;
        }
        .revision-table th {
          background-color: #f0f0f0;
        }
        .note-section {
          font-size: 10px;
          text-align: left;
          margin: 20px 0;
        }
        .signature-section {
          margin: 40px 0;
          text-align: left;
        }
        .footer-text {
          position: fixed;
          bottom: 30px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 12px;
          color: #374151;
        }
      </style>
    </head>
    <body>
      ${logoData ? `<img src="data:image/png;base64,${logoData}" alt="Lifecycle Logo" class="logo">` : ''}
      
      <div class="main-title">DeltaV</div>
      <div class="main-title">Installation & Integration Procedure</div>
      
      <div class="for-section">
        <strong>for</strong><br>
        <strong>${session.ii_customer_name || session.customer_name}</strong>
      </div>
      
      <div class="customer-info">
        <strong>DeltaV System ID: ${session.deltav_system_id || session.customer_name}</strong>
      </div>
      
      <table class="revision-table">
        <thead>
          <tr>
            <th>Rev.</th>
            <th>Date</th>
            <th>Description</th>
            <th>By</th>
            <th>Reviewed By / Date</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td>
            <td></td>
            <td>Prepared for</td>
            <td></td>
            <td></td>
          </tr>
          <tr><td></td><td></td><td></td><td></td><td></td></tr>
          <tr><td></td><td></td><td></td><td></td><td></td></tr>
          <tr><td></td><td></td><td></td><td></td><td></td></tr>
          <tr><td></td><td></td><td></td><td></td><td></td></tr>
        </tbody>
      </table>
      
      <div class="note-section">
        <strong>Note:</strong> Number in Rev. identifies version sent to customer. Lower case letter in Rev. identifies internal version
      </div>
      
      <div class="signature-section">
        <strong>Performed By:</strong> ${session.ii_performed_by || '_____________'} &nbsp;&nbsp;&nbsp;&nbsp; <strong>Date:</strong> ${currentDate}
      </div>
      
      <div class="footer-text">
        An Emerson Process Management Local Business Partner
      </div>
    </body>
    </html>
  `;
  
  // Generate introduction pages (beginning 3 pages)
  const introPages = generateIIIntroPages(session, logoData);
  
  // Generate document sections
  const documentSections = [];
  
  for (let i = 0; i < documents.length; i++) {
    const document = documents[i];
    
    // Get checklist items for this document
    const checklistItems = await db.prepare('SELECT * FROM session_ii_checklist WHERE document_id = ? AND deleted = 0 ORDER BY section_name, item_name').all([document.id]);
    
    // Get equipment used for this document
    const equipmentUsed = await db.prepare('SELECT * FROM session_ii_equipment_used WHERE document_id = ? AND deleted = 0 ORDER BY manufacturer, type').all([document.id]);
    
    // Generate document content
    const documentContent = generateSingleIIDocumentContent(document, session, checklistItems, equipmentUsed, i + 1);
    documentSections.push(documentContent);
  }
  
  // Generate final pages (equipment reference tables)
  const finalPages = generateIIFinalPages(session, logoData);
  
  // Combine all sections
  const combinedContent = `
    ${coverPage}
    ${introPages}
    ${documentSections.join('')}
    ${finalPages}
  `;
  
  return combinedContent;
}

// Generate introduction pages for I&I report
function generateIIIntroPages(session, logoData) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { 
          font-family: Arial, sans-serif; 
          margin: 0; 
          padding: 20px; 
          font-size: 11px; 
          line-height: 1.5;
        }
        .page {
          min-height: 100vh;
          padding: 20px;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
          border-bottom: 2px solid #2563eb;
          padding-bottom: 20px;
        }
        .page-header {
          position: fixed;
          top: 10px;
          left: 0;
          right: 0;
          text-align: center;
          font-size: 10px;
          color: #666;
          border-bottom: 1px solid #ccc;
          padding-bottom: 5px;
          background: white;
          z-index: 1000;
        }
        .logo { max-width: 120px; height: auto; }
        h1 { color: #2563eb; font-size: 24px; margin: 0; }
        h2 { color: #2563eb; font-size: 18px; margin-top: 30px; margin-bottom: 15px; }
        h3 { color: #2563eb; font-size: 14px; margin-top: 20px; margin-bottom: 10px; }
        .toc { margin: 20px 0; }
        .toc-item { 
          display: flex; 
          justify-content: space-between; 
          padding: 8px 0; 
          border-bottom: 1px dotted #ccc; 
        }
        .intro-text { 
          text-align: justify; 
          margin: 15px 0; 
        }
        .equipment-list {
          margin: 20px 0;
        }
        .equipment-item {
          margin: 8px 0;
          padding-left: 20px;
        }
      </style>
    </head>
    <body>
      <div class="page-header">DeltaV Installation & Integration Procedure - ${session.ii_customer_name || session.customer_name}</div>
      
      <!-- Page 1: Table of Contents -->
      <div class="page" style="page-break-before: always; margin-top: 60px; padding-top: 15px;">
        <div class="header">
          ${logoData ? `<img src="data:image/png;base64,${logoData}" alt="Lifecycle Logo" class="logo">` : '<div style="font-size: 20px; font-weight: bold;">ECI</div>'}
          <div>
            <h1>DeltaV Installation & Integration Procedure</h1>
            <div><strong>Customer:</strong> ${session.ii_customer_name || session.customer_name}</div>
            <div><strong>DeltaV System ID:</strong> ${session.deltav_system_id || session.customer_name}</div>
          </div>
        </div>
        
        <h2>Table of Contents</h2>
        <div class="toc">
          <div class="toc-item"><span>1. Introduction</span><span>2</span></div>
          <div class="toc-item"><span>2. Equipment Necessary</span><span>2</span></div>
          <div class="toc-item"><span>3. Good Engineering Practices for General Systems</span><span>3</span></div>
          <div class="toc-item"><span>4. Power and Grounding Connections</span><span>3</span></div>
          <div class="toc-item"><span>5. Enclosures</span><span>3</span></div>
          <div class="toc-item"><span>6. AC Power System and Distribution</span><span>3</span></div>
          <div class="toc-item"><span>7. DC Power System and Distribution</span><span>3</span></div>
          <div class="toc-item"><span>8. DeltaV Controllers</span><span>3</span></div>
          <div class="toc-item"><span>9. List of Equipment Used</span><span>3</span></div>
          <div class="toc-item"><span>10. Ground Cable Sizing - Reference</span><span>3</span></div>
        </div>
      </div>
      
      <!-- Page 2: Introduction and Equipment Necessary -->
      <div class="page" style="page-break-before: always; margin-top: 60px; padding-top: 15px;">
        <h2>1. Introduction</h2>
        <div class="intro-text">
          The Installation and Integration (I&I) checklists in this document help to properly verify and document power and grounding for Emerson's CHARMs, S-series, and M-series products. For more thorough information on other aspects of site preparation please refer to the Site Preparation and Design for DeltaV Digital Automation Systems.
        </div>
        <div class="intro-text">
          All of the inspection criteria in this document are based on good engineering practice and apply to any control system, and were derived from the Emerson Process management guidelines contained in the DeltaV Quick Start Guide for DeltaV Power, Grounding, and Surge Suppression, and the Site Preparation and Design for DeltaV Digital Automation Systems.
        </div>
        <div class="intro-text">
          The DeltaV system itself has already been verified in the Factory Acceptance Test (FAT). This I&I does not repeat that verification. This I&I is limited to the verification that all components of the DeltaV system have been properly installed, including power, grounding, and intra-system communications, in the field before initial application of power.
        </div>
        <div class="intro-text">
          Checks of the installation and operation of the entire instrumentation and control system, including additional checks of the DeltaV operation, are performed in the Site Acceptance Test (SAT) and loop checks for the project and are not part of this I&I.
        </div>
        
        <h2 style="margin-top: 40px;">2. Equipment Necessary</h2>
        <div class="intro-text">
          The following equipment is needed to perform the checks in this I&I:
        </div>
        <div class="equipment-list">
          <div class="equipment-item">• Clamp-on RMS ammeter (for AC and DC current measurements)</div>
          <div class="equipment-item">• 4-1/2 digit DVM with accuracy of ± 0.05%, or better.</div>
          <div class="equipment-item">• Fluke 1630 Earth Ground Clamp Meter</div>
          <div class="equipment-item">• Fluke MT-8200-49A Micromapper</div>
        </div>
        <div class="intro-text">
          <strong>Note:</strong> Equivalent equipment may be substituted for the equipment listed above. Review the most current revision of product manuals and installation manuals prior to checkout.
        </div>
      </div>
    </body>
    </html>
  `;
}

// Generate single document content for combined PDF
function generateSingleIIDocumentContent(document, session, checklistItems, equipmentUsed, documentNumber) {
  // Group checklist items by section
  const sectionGroups = {};
  checklistItems.forEach(item => {
    if (!sectionGroups[item.section_name]) {
      sectionGroups[item.section_name] = [];
    }
    sectionGroups[item.section_name].push(item);
  });
  
  // Define the correct section order
  const sectionOrder = [
    'Good Engineering Practices',
    'Power and Grounding Connections',
    'Enclosures',
    'AC Power System and Distribution',
    'DC Power System and Distribution',
    'DeltaV Controllers',
    'List of Equipment Used'
  ];
  
  // Sort sections according to the defined order
  const sortedSectionNames = Object.keys(sectionGroups).sort((a, b) => {
    const indexA = sectionOrder.indexOf(a);
    const indexB = sectionOrder.indexOf(b);
    // If section not in order array, put it at the end
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });
  
  // Generate checklist sections HTML
  const checklistSectionsHTML = sortedSectionNames.map(sectionName => {
    const items = sectionGroups[sectionName];
    const itemsHTML = items.map(item => {
      let measurementCells = '';
      
      // Add measurement columns if this item has measurements
      if (item.measurement_ohms || item.measurement_ac_ma || item.measurement_voltage || item.measurement_frequency) {
        const measurements = [];
        if (item.measurement_ohms) measurements.push(`<strong>${item.measurement_ohms} Ω</strong>`);
        if (item.measurement_ac_ma) measurements.push(`<strong>${item.measurement_ac_ma} AC mA</strong>`);
        // Removed DC mA as requested
        if (item.measurement_voltage) measurements.push(`<strong>${item.measurement_voltage} V</strong>`);
        if (item.measurement_frequency) measurements.push(`<strong>${item.measurement_frequency} Hz</strong>`);
        
        measurementCells = `
          <td style="border: 1px solid #ccc; padding: 8px; font-size: 10px;">
            ${measurements.join('<br>')}
          </td>
        `;
      }
      
      return `
        <tr>
          <td style="border: 1px solid #ccc; padding: 8px; vertical-align: top; width: 50%;">
            ${item.item_name}
          </td>
          <td style="border: 1px solid #ccc; padding: 8px; text-align: center; width: 12%;">
            ${item.answer || ''}
          </td>
          ${measurementCells || '<td style="border: 1px solid #ccc; padding: 8px; width: 15%;">&nbsp;</td>'}
          <td style="border: 1px solid #ccc; padding: 8px; width: 23%;">
            ${item.comments || '&nbsp;'}
          </td>
        </tr>
      `;
    }).join('');
    
    return `
      <div style="page-break-before: always; page-break-inside: avoid; margin-bottom: 30px; margin-top: 60px; padding-top: 15px;">
        <h3 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 5px; margin-bottom: 15px; font-size: 16px; font-weight: bold; text-align: center;">
          ${sectionName}
        </h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="background-color: #f8fafc;">
              <th style="border: 1px solid #ccc; padding: 8px; text-align: left;">Verification</th>
              <th style="border: 1px solid #ccc; padding: 8px;">Answer</th>
              <th style="border: 1px solid #ccc; padding: 8px;">Measurements</th>
              <th style="border: 1px solid #ccc; padding: 8px;">Comments</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>
      </div>
    `;
  }).join('');
  
  // Generate equipment used table
  const equipmentHTML = equipmentUsed.length > 0 ? `
    <div style="page-break-inside: avoid; margin-bottom: 30px;">
      <h3 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 5px; margin-bottom: 15px; font-size: 16px; font-weight: bold; text-align: center;">
        Equipment Used
      </h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
        <thead>
          <tr style="background-color: #f8fafc;">
            <th style="border: 1px solid #ccc; padding: 8px;">Manufacturer</th>
            <th style="border: 1px solid #ccc; padding: 8px;">Type</th>
            <th style="border: 1px solid #ccc; padding: 8px;">Serial Number</th>
            <th style="border: 1px solid #ccc; padding: 8px;">Re-calibration Date</th>
            <th style="border: 1px solid #ccc; padding: 8px;">Used in Section</th>
          </tr>
        </thead>
        <tbody>
          ${equipmentUsed.map(item => `
            <tr>
              <td style="border: 1px solid #ccc; padding: 8px;">${item.manufacturer || ''}</td>
              <td style="border: 1px solid #ccc; padding: 8px;">${item.type || ''}</td>
              <td style="border: 1px solid #ccc; padding: 8px;">${item.serial_number || ''}</td>
              <td style="border: 1px solid #ccc; padding: 8px;">${item.recalibration_date || ''}</td>
              <td style="border: 1px solid #ccc; padding: 8px;">${item.used_in_section || ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : '';
  
    return `
    <div style="page-break-before: always;">
      <div style="position: fixed; top: 10px; left: 0; right: 0; text-align: center; font-size: 10px; color: #666; border-bottom: 1px solid #ccc; padding-bottom: 5px; background: white; z-index: 1000;">DeltaV Installation & Integration Procedure - ${session.ii_customer_name || session.customer_name}</div>
      <div style="margin-top: 60px; margin-bottom: 20px; padding-top: 15px;">
        <h2 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-top: 0; margin-bottom: 20px; font-size: 20px; text-align: center;">Document ${documentNumber}: ${document.document_name}</h2>
      </div>
      
      ${checklistSectionsHTML}
      ${equipmentHTML}
    </div>
  `;
}

// Generate final pages for I&I report
function generateIIFinalPages(session, logoData) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { 
          font-family: Arial, sans-serif; 
          margin: 0; 
          padding: 20px; 
          font-size: 10px; 
          line-height: 1.4;
        }
        h2 { 
          color: #2563eb; 
          border-bottom: 2px solid #2563eb; 
          padding-bottom: 10px; 
          margin-top: 0; 
          margin-bottom: 20px; 
          font-size: 18px;
        }
        table { 
          width: 100%; 
          border-collapse: collapse; 
          margin-bottom: 20px; 
          font-size: 9px;
        }
        th, td { 
          border: 1px solid #ccc; 
          padding: 4px; 
          text-align: center; 
        }
        th { 
          background-color: #f8fafc; 
          font-weight: bold; 
        }
        .intro-text { 
          text-align: justify; 
          margin: 15px 0; 
          font-size: 10px;
        }
        .page-header {
          position: fixed;
          top: 10px;
          left: 0;
          right: 0;
          text-align: center;
          font-size: 10px;
          color: #666;
          border-bottom: 1px solid #ccc;
          padding-bottom: 5px;
          background: white;
          z-index: 1000;
        }
      </style>
    </head>
    <body>
      <div class="page-header">DeltaV Installation & Integration Procedure - ${session.ii_customer_name || session.customer_name}</div>
      <div style="page-break-before: always; margin-top: 60px; padding-top: 15px;">
      <h2>Ground Cable Sizing - Reference</h2>
      <div class="intro-text">
        DeltaV is a ground referenced system. To maintain high integrity it is important that careful consideration be paid to ground conductor sizing. The original site preparation manual, Site Preparation and Design for DeltaV Digital Automation Systems, lists some typical methods of connecting grounding networks.
      </div>
      <div class="intro-text">
        Typically for large high-integrity systems, shields are connected to the chassis ground bar. One of the most cost efficient grounding method uses a star topology with larger conductor sizes at the sections located a greater distance from the cabinets.
      </div>
      <div class="intro-text">
        The following tables are applicable for all DeltaV products. Table 5-1 lists the appropriate wire size with respect to the distance between a cabinet and the closest ground bar or between individual ground bars.
      </div>
      
      <h3>Table 5-1: Ground wire sizing</h3>
      <table>
        <thead>
          <tr>
            <th>I/O points</th>
            <th>10 ft</th>
            <th>25 ft</th>
            <th>50 ft</th>
            <th>100 ft</th>
            <th>300 ft</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>64</td><td>8 AWG</td><td>8 AWG</td><td>8 AWG</td><td>6 AWG</td><td>2 AWG</td></tr>
          <tr><td>128</td><td>8 AWG</td><td>8 AWG</td><td>6 AWG</td><td>2 AWG</td><td>1/0</td></tr>
          <tr><td>256</td><td>8 AWG</td><td>6 AWG</td><td>2 AWG</td><td>1/0</td><td>2/0</td></tr>
          <tr><td>512</td><td>6 AWG</td><td>2 AWG</td><td>1/0</td><td>2/0</td><td>3/0</td></tr>
          <tr><td>1024</td><td>2 AWG</td><td>1/0</td><td>2/0</td><td>3/0</td><td>4/0</td></tr>
          <tr><td>2048</td><td>1/0</td><td>2/0</td><td>3/0</td><td>4/0</td><td>---</td></tr>
          <tr><td>4096</td><td>2/0</td><td>3/0</td><td>4/0</td><td>---</td><td>---</td></tr>
          <tr><td>8192</td><td>3/0</td><td>4/0</td><td>---</td><td>---</td><td>---</td></tr>
        </tbody>
      </table>
      
      <h3 style="margin-top: 30px;">Table 5-3: Braided cable system</h3>
      <table>
        <thead>
          <tr>
            <th>I/O points</th>
            <th>10 ft</th>
            <th>25 ft</th>
            <th>50 ft</th>
            <th>100 ft</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>128</td><td>N30-36T-762-2ULG</td><td>N30-36T-762-2ULG</td><td>N30-36T-762-2ULG</td><td>N30-30T-652-2UL</td></tr>
          <tr><td>256</td><td>N30-36T-762-2ULG</td><td>N30-36T-762-2ULG</td><td>N30-30T-652-2UL</td><td>---</td></tr>
          <tr><td>512</td><td>N30-36T-762-2ULG</td><td>N30-30T-652-2UL</td><td>---</td><td>---</td></tr>
          <tr><td>1024</td><td>N30-30T-652-2UL</td><td>---</td><td>---</td><td>---</td></tr>
        </tbody>
      </table>
      
      <h3 style="margin-top: 30px;">Table 5-4: Single cable length with chassis ground and DC ground connected in enclosure</h3>
      <table>
        <thead>
          <tr>
            <th>I/O points</th>
            <th>10 ft</th>
            <th>25 ft</th>
            <th>50 ft</th>
            <th>100 ft</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>64</td><td>8 AWG</td><td>8 AWG</td><td>6 AWG</td><td>2 AWG</td></tr>
          <tr><td>128</td><td>8 AWG</td><td>6 AWG</td><td>2 AWG</td><td>1/0</td></tr>
          <tr><td>256</td><td>6 AWG</td><td>2 AWG</td><td>1/0</td><td>2/0</td></tr>
          <tr><td>512</td><td>2 AWG</td><td>1/0</td><td>2/0</td><td>3/0</td></tr>
          <tr><td>1024</td><td>1/0</td><td>2/0</td><td>3/0</td><td>4/0</td></tr>
        </tbody>
      </table>
      
      <div style="margin-top: 40px; text-align: center; font-size: 10px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 20px;">
        <p><strong>Equipment & Controls, Inc. Confidential</strong></p>
        <p>Generated on ${new Date().toLocaleString()}</p>
        <p>Performed by: ${session.ii_performed_by || 'Not specified'}</p>
      </div>
      </div>
    </body>
    </html>
  `;
}

function generateIIPDF(document, session, checklistItems, equipmentUsed) {
  const logoData = getBase64Logo();
  const currentDate = new Date().toLocaleDateString('en-US');
  
  // Group checklist items by section
  const sectionGroups = {};
  checklistItems.forEach(item => {
    if (!sectionGroups[item.section_name]) {
      sectionGroups[item.section_name] = [];
    }
    sectionGroups[item.section_name].push(item);
  });
  
  // Define the correct section order
  const sectionOrder = [
    'Good Engineering Practices',
    'Power and Grounding Connections',
    'Enclosures',
    'AC Power System and Distribution',
    'DC Power System and Distribution',
    'DeltaV Controllers',
    'List of Equipment Used'
  ];
  
  // Sort sections according to the defined order
  const sortedSectionNames = Object.keys(sectionGroups).sort((a, b) => {
    const indexA = sectionOrder.indexOf(a);
    const indexB = sectionOrder.indexOf(b);
    // If section not in order array, put it at the end
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });
  
  // Generate checklist sections HTML
  const checklistSectionsHTML = sortedSectionNames.map(sectionName => {
    const items = sectionGroups[sectionName];
    const itemsHTML = items.map(item => {
      // Check if this item has measurements
      const hasMeasurements = item.measurement_ohms || item.measurement_ac_ma || item.measurement_voltage || item.measurement_frequency;
      
      let measurementCell = '';
      if (hasMeasurements) {
        const measurements = [];
        if (item.measurement_ohms) measurements.push(`<strong>${item.measurement_ohms} Ω</strong>`);
        if (item.measurement_ac_ma) measurements.push(`<strong>${item.measurement_ac_ma} AC mA</strong>`);
        // Removed DC mA as requested
        if (item.measurement_voltage) measurements.push(`<strong>${item.measurement_voltage} V</strong>`);
        if (item.measurement_frequency) measurements.push(`<strong>${item.measurement_frequency} Hz</strong>`);
        
        measurementCell = `
          <td style="border: 1px solid #ccc; padding: 8px; font-size: 10px; width: 15%;">
            ${measurements.join('<br>')}
          </td>
        `;
      }
      
      return `
        <tr>
          <td style="border: 1px solid #ccc; padding: 8px; vertical-align: top; width: 45%;">
            ${item.item_name}
          </td>
          <td style="border: 1px solid #ccc; padding: 8px; text-align: center; width: 15%;">
            ${item.answer || ''}
          </td>
          ${measurementCell || '<td style="border: 1px solid #ccc; padding: 8px; width: 15%;">&nbsp;</td>'}
          <td style="border: 1px solid #ccc; padding: 8px; width: 25%;">
            ${item.comments || '&nbsp;'}
          </td>
        </tr>
      `;
    }).join('');
    
    return `
      <div style="page-break-before: always; page-break-inside: avoid; margin-bottom: 30px; margin-top: 60px; padding-top: 15px;">
        <h3 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 5px; margin-bottom: 15px; font-size: 16px; font-weight: bold; text-align: center;">
          ${sectionName}
        </h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr style="background-color: #f8fafc;">
              <th style="border: 1px solid #ccc; padding: 8px; text-align: left;">Verification</th>
              <th style="border: 1px solid #ccc; padding: 8px;">Answer</th>
              <th style="border: 1px solid #ccc; padding: 8px;">Measurements</th>
              <th style="border: 1px solid #ccc; padding: 8px;">Comments</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>
      </div>
    `;
  }).join('');
  
  // Generate equipment used table
  const equipmentHTML = equipmentUsed.length > 0 ? `
    <div style="page-break-inside: avoid; margin-bottom: 30px;">
      <h3 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 5px; margin-bottom: 15px; font-size: 16px; font-weight: bold; text-align: center;">
        List of Equipment Used
      </h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
        <thead>
          <tr style="background-color: #f8fafc;">
            <th style="border: 1px solid #ccc; padding: 8px;">Manufacturer</th>
            <th style="border: 1px solid #ccc; padding: 8px;">Type</th>
            <th style="border: 1px solid #ccc; padding: 8px;">Serial Number</th>
            <th style="border: 1px solid #ccc; padding: 8px;">Re-calibration Date</th>
            <th style="border: 1px solid #ccc; padding: 8px;">Used in Section</th>
          </tr>
        </thead>
        <tbody>
          ${equipmentUsed.map(item => `
            <tr>
              <td style="border: 1px solid #ccc; padding: 8px;">${item.manufacturer || ''}</td>
              <td style="border: 1px solid #ccc; padding: 8px;">${item.type || ''}</td>
              <td style="border: 1px solid #ccc; padding: 8px;">${item.serial_number || ''}</td>
              <td style="border: 1px solid #ccc; padding: 8px;">${item.recalibration_date || ''}</td>
              <td style="border: 1px solid #ccc; padding: 8px;">${item.used_in_section || ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>I&I Document - ${document.document_name}</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          margin: 0; 
          padding: 20px; 
          font-size: 11px; 
          line-height: 1.4;
        }
        .header { 
          display: flex; 
          justify-content: space-between; 
          align-items: flex-start; 
          margin-bottom: 30px; 
          border-bottom: 2px solid #2563eb; 
          padding-bottom: 20px;
        }
        .logo { max-width: 120px; height: auto; }
        .header-info { text-align: right; }
        .header-info h1 { 
          margin: 0 0 10px 0; 
          color: #2563eb; 
          font-size: 18px; 
        }
        .document-info {
          background: #f8fafc;
          padding: 15px;
          border-radius: 5px;
          margin-bottom: 20px;
        }
        .info-row {
          display: flex;
          margin-bottom: 8px;
        }
        .info-label {
          font-weight: bold;
          width: 150px;
          color: #374151;
        }
        .info-value {
          color: #6b7280;
        }
        h2 { 
          color: #2563eb; 
          border-bottom: 1px solid #2563eb; 
          padding-bottom: 5px; 
          margin-top: 25px; 
          margin-bottom: 15px; 
        }
        h3 { 
          color: #2563eb; 
          margin-top: 20px; 
          margin-bottom: 10px; 
        }
        table { 
          width: 100%; 
          border-collapse: collapse; 
          margin-bottom: 20px; 
        }
        th, td { 
          border: 1px solid #ccc; 
          padding: 8px; 
          text-align: left; 
        }
        th { 
          background-color: #f8fafc; 
          font-weight: bold; 
        }
        .footer {
          margin-top: 40px;
          text-align: center;
          font-size: 10px;
          color: #6b7280;
          border-top: 1px solid #e5e7eb;
          padding-top: 10px;
        }
        @media print {
          body { margin: 0; padding: 15px; }
          .header { page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          ${logoData ? `<img src="data:image/png;base64,${logoData}" alt="Lifecycle Logo" class="logo">` : ''}
        </div>
        <div class="header-info">
          <h1>DeltaV Installation & Integration Procedure</h1>
          <div><strong>Document:</strong> ${document.document_name}</div>
          <div><strong>Customer:</strong> ${session.customer_name}</div>
          <div><strong>Date:</strong> ${currentDate}</div>
        </div>
      </div>

      <div class="document-info">
        <div class="info-row">
          <div class="info-label">Customer Name:</div>
          <div class="info-value">${session.customer_name}</div>
        </div>
        <div class="info-row">
          <div class="info-label">Location:</div>
          <div class="info-value">${document.location || session.customer_location || 'Not specified'}</div>
        </div>
        <div class="info-row">
          <div class="info-label">DeltaV System ID:</div>
          <div class="info-value">${document.deltav_system_id || 'Not specified'}</div>
        </div>
        <div class="info-row">
          <div class="info-label">Performed By:</div>
          <div class="info-value">${session.ii_performed_by || 'Not specified'}</div>
        </div>
        <div class="info-row">
          <div class="info-label">Date Performed:</div>
          <div class="info-value">${document.date_performed || 'Not specified'}</div>
        </div>
      </div>

      ${checklistSectionsHTML}
      ${equipmentHTML}

      <div class="footer">
        <p>Equipment & Controls, Inc. Confidential</p>
        <p>Generated on ${new Date().toLocaleString()}</p>
      </div>
    </body>
    </html>
  `;
}

module.exports = { generateIIPDF, generateCombinedIIPDF };

