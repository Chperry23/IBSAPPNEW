const fs = require('fs');
const path = require('path');
const db = require('../../config/database');

// Helper function to get base64 logo
function getBase64Logo() {
  let logoData = '';
  const basePath = path.resolve(__dirname, '../../../');
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
      console.log(`⚠️  Could not load logo from ${logoPath}:`, error.message);
    }
  }
  return logoData;
}

// Section display order — must match frontend CHECKLIST_SECTIONS names exactly
const SECTION_ORDER = [
  'Good Engineering Practices',
  'Power and Grounding Connections',
  'Enclosures',
  'AC Power System',
  'DC Power System',
  'DeltaV Controllers',
  'List of Equipment Used'
];

// Build the measurement/recorded-value cell for a checklist item
function buildMeasurementCell(item) {
  const parts = [];
  if (item.recorded_value) parts.push(`<strong>${escHtml(item.recorded_value)}</strong>`);
  if (item.measurement_ohms)     parts.push(`${escHtml(String(item.measurement_ohms))} Ω`);
  if (item.measurement_ac_ma)    parts.push(`${escHtml(String(item.measurement_ac_ma))} AC mA`);
  if (item.measurement_voltage)  parts.push(`${escHtml(String(item.measurement_voltage))} V`);
  if (item.measurement_frequency) parts.push(`${escHtml(String(item.measurement_frequency))} Hz`);
  return parts.length ? parts.join('<br>') : '&nbsp;';
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Sort checklist items into sections in the correct order
function groupAndSortChecklist(checklistItems) {
  const groups = {};
  checklistItems.forEach(item => {
    if (!groups[item.section_name]) groups[item.section_name] = [];
    groups[item.section_name].push(item);
  });

  return Object.keys(groups).sort((a, b) => {
    const ia = SECTION_ORDER.indexOf(a);
    const ib = SECTION_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  }).map(name => ({ name, items: groups[name] }));
}

// Specific item texts where "No" is the correct/good answer (no concerns = good)
// Only these exact items are exempt from red highlighting when answered "No"
function noIsGoodAnswer(itemName) {
  const text = (itemName || '').toLowerCase();
  return text.includes('environmental concerns') || text.startsWith('are there any concerns');
}

// Determine the answer cell style based on answer value and item text
function answerCellStyle(answer, itemName) {
  const base = 'border:1px solid #ccc;padding:6px;text-align:center;width:10%;font-weight:bold;';
  if (answer === 'Pass' || answer === 'Yes') return base + 'background-color:#dcfce7;color:#15803d;';
  if (answer === 'Fail') return base + 'background-color:#fee2e2;color:#b91c1c;';
  if (answer === 'No' && !noIsGoodAnswer(itemName)) return base + 'background-color:#fee2e2;color:#b91c1c;';
  return base;
}

// CSS Grid column template — widths for: Verification | Answer | Value | Initials | Date | Comments
const GRID_COLS = '52% 8% 10% 7% 8% 15%';

// Render a checklist section as CSS Grid rows (most reliable break-inside in Chromium)
// isFirst=true → no page-break-before so first section flows after the document header
// sessionInitials → fallback initials for items answered before a default was set
function renderChecklistSection(section, isFirst = false, sessionInitials = '') {
  const rowStyle = `display:grid;grid-template-columns:${GRID_COLS};border-left:1px solid #ccc;border-bottom:1px solid #ccc;page-break-inside:avoid;break-inside:avoid;`;
  const cell = 'padding:5px;border-right:1px solid #ccc;font-size:10px;word-break:break-word;overflow-wrap:break-word;vertical-align:top;';

  const rowsHTML = section.items.map(item => {
    const answerText = escHtml(item.answer) || '';
    // Fall back to session-level initials for items that were answered before initials were set
    const initialsText = escHtml(item.performed_by || sessionInitials) || '';
    const dateText = item.date_completed
      ? escHtml(new Date(item.date_completed + 'T00:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }))
      : '';

    const isPassGreen = item.answer === 'Pass' || item.answer === 'Yes';
    const isFailRed   = item.answer === 'Fail' || (item.answer === 'No' && !noIsGoodAnswer(item.item_name));
    const answerBg    = isPassGreen ? 'background-color:#dcfce7;color:#15803d;' : isFailRed ? 'background-color:#fee2e2;color:#b91c1c;' : '';

    return `
    <div style="${rowStyle}">
      <div style="${cell}">${escHtml(item.item_name)}</div>
      <div style="${cell}text-align:center;font-weight:bold;${answerBg}">${answerText}</div>
      <div style="${cell}">${buildMeasurementCell(item)}</div>
      <div style="${cell}text-align:center;">${initialsText}</div>
      <div style="${cell}text-align:center;font-size:9px;">${dateText}</div>
      <div style="${cell}border-right:none;">${escHtml(item.comments) || ''}</div>
    </div>`;
  }).join('');

  const pageBreak = isFirst ? '' : 'page-break-before:always;margin-top:60px;padding-top:15px;';
  const th = `padding:5px;border-right:1px solid #ccc;font-size:10px;font-weight:bold;background:#f8fafc;`;

  return `
    <div style="${pageBreak}margin-bottom:30px;">
      <h3 style="color:#2563eb;border-bottom:2px solid #2563eb;padding-bottom:5px;margin-bottom:0;font-size:15px;font-weight:bold;text-align:center;">${escHtml(section.name)}</h3>
      <div style="display:grid;grid-template-columns:${GRID_COLS};border:1px solid #ccc;background:#f8fafc;">
        <div style="${th}">Verification</div>
        <div style="${th}text-align:center;">Answer</div>
        <div style="${th}">Value / Measurement</div>
        <div style="${th}text-align:center;">Initials</div>
        <div style="${th}text-align:center;">Date</div>
        <div style="${th}border-right:none;">Comments</div>
      </div>
      ${rowsHTML}
    </div>
  `;
}

// Render equipment-used table
function renderEquipmentUsed(equipmentUsed) {
  if (!equipmentUsed || equipmentUsed.length === 0) return '';
  const rowsHTML = equipmentUsed.map(item => `
    <tbody style="break-inside:avoid;page-break-inside:avoid;">
      <tr>
        <td style="border:1px solid #ccc;padding:6px;width:18%;">${escHtml(item.manufacturer) || ''}</td>
        <td style="border:1px solid #ccc;padding:6px;width:18%;">${escHtml(item.type) || ''}</td>
        <td style="border:1px solid #ccc;padding:6px;width:18%;">${escHtml(item.serial_number) || ''}</td>
        <td style="border:1px solid #ccc;padding:6px;width:16%;text-align:center;">${escHtml(item.recalibration_date) || ''}</td>
        <td style="border:1px solid #ccc;padding:6px;width:30%;">${escHtml(item.used_in_section) || ''}</td>
      </tr>
    </tbody>
  `).join('');
  return `
    <div style="break-before:avoid;page-break-before:avoid;break-inside:avoid;page-break-inside:avoid;margin-top:20px;margin-bottom:20px;">
      <h3 style="color:#2563eb;border-bottom:2px solid #2563eb;padding-bottom:5px;margin-bottom:10px;font-size:14px;font-weight:bold;text-align:center;">List of Equipment Used</h3>
      <table style="width:100%;border-collapse:collapse;font-size:10px;">
        <thead>
          <tr style="background-color:#f8fafc;">
            <th style="border:1px solid #ccc;padding:6px;text-align:left;width:18%;">Manufacturer</th>
            <th style="border:1px solid #ccc;padding:6px;text-align:left;width:18%;">Type / Model</th>
            <th style="border:1px solid #ccc;padding:6px;text-align:left;width:18%;">Serial Number</th>
            <th style="border:1px solid #ccc;padding:6px;text-align:center;width:16%;">Re-cal Date</th>
            <th style="border:1px solid #ccc;padding:6px;text-align:left;width:30%;">Used in Section</th>
          </tr>
        </thead>
        ${rowsHTML}
      </table>
    </div>
  `;
}

// Shared CSS used in all PDF outputs
const SHARED_STYLES = `
  body { font-family: Arial, sans-serif; margin: 0; padding: 20px; font-size: 11px; line-height: 1.4; }
  .page-header { position: fixed; top: 10px; left: 0; right: 0; text-align: center; font-size: 10px; color: #666; border-bottom: 1px solid #ccc; padding-bottom: 5px; background: white; z-index: 1000; }
  .logo { max-width: 120px; height: auto; }
  h1 { color: #2563eb; font-size: 20px; margin: 0 0 10px 0; }
  h2 { color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin: 0 0 20px 0; font-size: 18px; text-align: center; }
  .toc-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dotted #ccc; }
  .intro-text { text-align: justify; margin: 15px 0; }
`;

// ===========================================================================
// generateIIPDF — single document PDF
// ===========================================================================
function generateIIPDF(document, session, checklistItems, equipmentUsed) {
  const logoData = getBase64Logo();
  const currentDate = new Date().toLocaleDateString('en-US');
  const sections = groupAndSortChecklist(checklistItems);

  const sessionInitials = session.ii_initials || '';
  const checklistHTML = sections.map((s, idx) => renderChecklistSection(s, idx === 0, sessionInitials)).join('');
  const equipHTML = renderEquipmentUsed(equipmentUsed);
  const customerName = escHtml(session.ii_customer_name || session.customer_name || '');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>I&amp;I Document - ${escHtml(document.document_name)}</title>
  <style>
    ${SHARED_STYLES}
    .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:30px; border-bottom:2px solid #2563eb; padding-bottom:20px; }
    .header-info { text-align:right; }
    .document-info { background:#f8fafc; padding:15px; border-radius:5px; margin-bottom:20px; }
    .info-row { display:flex; margin-bottom:8px; }
    .info-label { font-weight:bold; width:150px; color:#374151; }
    .info-value { color:#6b7280; }
    .footer { margin-top:40px; text-align:center; font-size:10px; color:#6b7280; border-top:1px solid #e5e7eb; padding-top:10px; }
  </style>
</head>
<body>
  <div class="header">
    <div>${logoData ? `<img src="data:image/png;base64,${logoData}" alt="Logo" class="logo">` : ''}</div>
    <div class="header-info">
      <h1>DeltaV Installation &amp; Integration Procedure</h1>
      <div><strong>Document:</strong> ${escHtml(document.document_name)}</div>
      <div><strong>Customer:</strong> ${customerName}</div>
      <div><strong>Date:</strong> ${currentDate}</div>
    </div>
  </div>

  <div class="document-info">
    <div class="info-row"><div class="info-label">Customer Name:</div><div class="info-value">${customerName}</div></div>
    <div class="info-row"><div class="info-label">Location:</div><div class="info-value">${escHtml(document.location || session.ii_location || session.customer_location || 'Not specified')}</div></div>
    <div class="info-row"><div class="info-label">DeltaV System ID:</div><div class="info-value">${escHtml(document.deltav_system_id || session.deltav_system_id || 'Not specified')}</div></div>
    <div class="info-row"><div class="info-label">Performed By:</div><div class="info-value">${escHtml(session.ii_performed_by || session.ii_initials || 'Not specified')}</div></div>
    <div class="info-row"><div class="info-label">Date Performed:</div><div class="info-value">${escHtml(document.date_performed || session.ii_date_performed || 'Not specified')}</div></div>
  </div>

  <div style="margin-top:20px;">
  ${checklistHTML}
  ${equipHTML}
  </div>

  <div class="footer">
    <p>Equipment &amp; Controls, Inc. Confidential</p>
    <p>Generated on ${new Date().toLocaleString()}</p>
  </div>
</body>
</html>`;
}

// ===========================================================================
// generateCombinedIIPDF — full session combined PDF (single HTML document)
// ===========================================================================
async function generateCombinedIIPDF(session, documents) {
  const logoData = getBase64Logo();
  const currentDate = new Date().toLocaleDateString('en-US');
  const customerName = escHtml(session.ii_customer_name || session.customer_name || '');
  const systemId = escHtml(session.deltav_system_id || customerName);
  const performedBy = escHtml(session.ii_performed_by || session.ii_initials || '_____________');
  const preparedFor = escHtml(session.ii_prepared_for || customerName);
  const logoImg = logoData ? `<img src="data:image/png;base64,${logoData}" alt="Logo" class="logo">` : '<div style="font-size:20px;font-weight:bold;">ECI</div>';

  // Collect all document sections
  const documentSectionsHTML = [];
  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const checklistItems = await db.prepare(
      'SELECT * FROM session_ii_checklist WHERE document_id = ? AND deleted = 0 ORDER BY section_name, item_name'
    ).all([doc.id]);
    const equipmentUsed = await db.prepare(
      'SELECT * FROM session_ii_equipment_used WHERE document_id = ? AND deleted = 0 ORDER BY manufacturer, type'
    ).all([doc.id]);

    const sections = groupAndSortChecklist(checklistItems);
    const sessionInitials = session.ii_initials || '';
    const checklistHTML = sections.map((s, idx) => renderChecklistSection(s, idx === 0, sessionInitials)).join('');
    const equipHTML = renderEquipmentUsed(equipmentUsed);

    documentSectionsHTML.push(`
      <div style="page-break-before:always;">
        <div style="margin-top:60px;margin-bottom:20px;padding-top:15px;">
          <h2>Document ${i + 1}: ${escHtml(doc.document_name)}</h2>
          <div style="font-size:10px;color:#6b7280;text-align:center;margin-bottom:10px;">
            ${doc.location ? `Location: ${escHtml(doc.location)} &nbsp;|&nbsp; ` : ''}
            DeltaV System ID: ${escHtml(doc.deltav_system_id || session.deltav_system_id || '')}
          </div>
        </div>
        ${checklistHTML}
        ${equipHTML}
      </div>
    `);
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>DeltaV I&amp;I Report - ${customerName}</title>
  <style>
    ${SHARED_STYLES}
    body { text-align: left; }
    .cover { text-align: center; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: 40px 20px; box-sizing: border-box; }
    .cover .logo { max-width: 150px; margin-bottom: 30px; }
    .main-title { font-size: 24px; font-weight: bold; color: #2563eb; margin-bottom: 8px; }
    .for-section { font-size: 14px; margin: 30px 0; }
    .revision-table { width: 100%; border-collapse: collapse; margin: 30px 0; font-size: 10px; }
    .revision-table th, .revision-table td { border: 1px solid #000; padding: 8px; text-align: left; }
    .revision-table th { background-color: #f0f0f0; }
    .note-section { font-size: 10px; text-align: left; width: 100%; margin: 10px 0; }
    .signature-section { text-align: left; width: 100%; margin: 20px 0; }
    .toc-section { text-align: left; width: 100%; }
    .header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 20px; }
    .ground-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 9px; }
    .ground-table th, .ground-table td { border: 1px solid #ccc; padding: 4px; text-align: center; }
    .ground-table th { background-color: #f8fafc; font-weight: bold; }
  </style>
</head>
<body>

  <!-- ===== COVER PAGE ===== -->
  <div class="cover">
    ${logoData ? `<img src="data:image/png;base64,${logoData}" alt="Logo" class="logo">` : ''}
    <div class="main-title">DeltaV</div>
    <div class="main-title">Installation &amp; Integration Procedure</div>
    <div class="for-section">
      <strong>for</strong><br>
      <strong>${customerName}</strong>
    </div>
    <div style="font-size:14px;margin-bottom:20px;">
      <strong>DeltaV System ID: ${systemId}</strong>
    </div>
    <table class="revision-table">
      <thead>
        <tr>
          <th>Rev.</th><th>Date</th><th>Description</th><th>By</th><th>Reviewed By / Date</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>1</td><td></td><td>Prepared for ${preparedFor}</td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td></tr>
      </tbody>
    </table>
    <div class="note-section">
      <strong>Note:</strong> Number in Rev. identifies version sent to customer. Lower case letter in Rev. identifies internal version.
    </div>
    <div class="signature-section">
      <strong>Performed By:</strong> ${performedBy} &nbsp;&nbsp;&nbsp;&nbsp; <strong>Date:</strong> ${currentDate}
    </div>
    <div style="font-size:12px;color:#374151;margin-top:40px;">An Emerson Process Management Local Business Partner</div>
  </div>

  <!-- ===== INTRO PAGE: TOC ===== -->
  <div class="page-header">DeltaV Installation &amp; Integration Procedure - ${customerName}</div>
  <div style="page-break-before:always;margin-top:60px;padding-top:15px;">
    <div class="header-row">
      ${logoImg}
      <div>
        <h1>DeltaV Installation &amp; Integration Procedure</h1>
        <div><strong>Customer:</strong> ${customerName}</div>
        <div><strong>DeltaV System ID:</strong> ${systemId}</div>
      </div>
    </div>
    <h2 style="text-align:left;border:none;font-size:18px;color:#2563eb;">Table of Contents</h2>
    <div class="toc-section">
      <div class="toc-item"><span>1. Introduction</span><span>2</span></div>
      <div class="toc-item"><span>2. Equipment Necessary</span><span>2</span></div>
      <div class="toc-item"><span>3. Good Engineering Practices</span><span>3</span></div>
      <div class="toc-item"><span>4. Power and Grounding Connections</span><span>3</span></div>
      <div class="toc-item"><span>5. Enclosures</span><span>3</span></div>
      <div class="toc-item"><span>6. AC Power System</span><span>3</span></div>
      <div class="toc-item"><span>7. DC Power System</span><span>3</span></div>
      <div class="toc-item"><span>8. DeltaV Controllers</span><span>3</span></div>
      <div class="toc-item"><span>9. List of Equipment Used</span><span>3</span></div>
      <div class="toc-item"><span>10. Ground Cable Sizing - Reference</span><span>3</span></div>
    </div>
  </div>

  <!-- ===== INTRO PAGE: Introduction & Equipment Necessary ===== -->
  <div style="page-break-before:always;margin-top:60px;padding-top:15px;">
    <h2 style="text-align:left;border:none;font-size:18px;color:#2563eb;">1. Introduction</h2>
    <p class="intro-text">The Installation and Integration (I&amp;I) checklists in this document help to properly verify and document power and grounding for Emerson's CHARMs, S-series, and M-series products. For more thorough information on other aspects of site preparation please refer to the Site Preparation and Design for DeltaV Digital Automation Systems.</p>
    <p class="intro-text">All of the inspection criteria in this document are based on good engineering practice and apply to any control system, and were derived from the Emerson Process management guidelines contained in the DeltaV Quick Start Guide for DeltaV Power, Grounding, and Surge Suppression, and the Site Preparation and Design for DeltaV Digital Automation Systems.</p>
    <p class="intro-text">The DeltaV system itself has already been verified in the Factory Acceptance Test (FAT). This I&amp;I does not repeat that verification. This I&amp;I is limited to the verification that all components of the DeltaV system have been properly installed, including power, grounding, and intra-system communications, in the field before initial application of power.</p>
    <p class="intro-text">Checks of the installation and operation of the entire instrumentation and control system, including additional checks of the DeltaV operation, are performed in the Site Acceptance Test (SAT) and loop checks for the project and are not part of this I&amp;I.</p>

    <h2 style="text-align:left;border:none;font-size:18px;color:#2563eb;margin-top:40px;">2. Equipment Necessary</h2>
    <p class="intro-text">The following equipment is needed to perform the checks in this I&amp;I:</p>
    <ul style="margin:10px 0 10px 20px;">
      <li>Clamp-on RMS ammeter (for AC and DC current measurements)</li>
      <li>4-1/2 digit DVM with accuracy of ± 0.05%, or better.</li>
      <li>Fluke 1630 Earth Ground Clamp Meter</li>
      <li>Fluke MT-8200-49A Micromapper</li>
    </ul>
    <p class="intro-text"><strong>Note:</strong> Equivalent equipment may be substituted for the equipment listed above. Review the most current revision of product manuals and installation manuals prior to checkout.</p>
  </div>

  <!-- ===== DOCUMENT SECTIONS ===== -->
  ${documentSectionsHTML.join('')}

  <!-- ===== FINAL PAGE: Ground Cable Sizing ===== -->
  <div style="page-break-before:always;margin-top:60px;padding-top:15px;">
    <h2>Ground Cable Sizing - Reference</h2>
    <p class="intro-text">DeltaV is a ground referenced system. To maintain high integrity it is important that careful consideration be paid to ground conductor sizing. The original site preparation manual, Site Preparation and Design for DeltaV Digital Automation Systems, lists some typical methods of connecting grounding networks.</p>
    <p class="intro-text">Typically for large high-integrity systems, shields are connected to the chassis ground bar. One of the most cost efficient grounding method uses a star topology with larger conductor sizes at the sections located a greater distance from the cabinets.</p>
    <p class="intro-text">The following tables are applicable for all DeltaV products. Table 5-1 lists the appropriate wire size with respect to the distance between a cabinet and the closest ground bar or between individual ground bars.</p>

    <h3 style="color:#2563eb;">Table 5-1: Ground wire sizing</h3>
    <table class="ground-table">
      <thead>
        <tr><th>I/O points</th><th>10 ft</th><th>25 ft</th><th>50 ft</th><th>100 ft</th><th>300 ft</th></tr>
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

    <h3 style="color:#2563eb;margin-top:30px;">Table 5-3: Braided cable system</h3>
    <table class="ground-table">
      <thead>
        <tr><th>I/O points</th><th>10 ft</th><th>25 ft</th><th>50 ft</th><th>100 ft</th></tr>
      </thead>
      <tbody>
        <tr><td>128</td><td>N30-36T-762-2ULG</td><td>N30-36T-762-2ULG</td><td>N30-36T-762-2ULG</td><td>N30-30T-652-2UL</td></tr>
        <tr><td>256</td><td>N30-36T-762-2ULG</td><td>N30-36T-762-2ULG</td><td>N30-30T-652-2UL</td><td>---</td></tr>
        <tr><td>512</td><td>N30-36T-762-2ULG</td><td>N30-30T-652-2UL</td><td>---</td><td>---</td></tr>
        <tr><td>1024</td><td>N30-30T-652-2UL</td><td>---</td><td>---</td><td>---</td></tr>
      </tbody>
    </table>

    <h3 style="color:#2563eb;margin-top:30px;">Table 5-4: Single cable length with chassis ground and DC ground connected in enclosure</h3>
    <table class="ground-table">
      <thead>
        <tr><th>I/O points</th><th>10 ft</th><th>25 ft</th><th>50 ft</th><th>100 ft</th></tr>
      </thead>
      <tbody>
        <tr><td>64</td><td>8 AWG</td><td>8 AWG</td><td>6 AWG</td><td>2 AWG</td></tr>
        <tr><td>128</td><td>8 AWG</td><td>6 AWG</td><td>2 AWG</td><td>1/0</td></tr>
        <tr><td>256</td><td>6 AWG</td><td>2 AWG</td><td>1/0</td><td>2/0</td></tr>
        <tr><td>512</td><td>2 AWG</td><td>1/0</td><td>2/0</td><td>3/0</td></tr>
        <tr><td>1024</td><td>1/0</td><td>2/0</td><td>3/0</td><td>4/0</td></tr>
      </tbody>
    </table>

    <div style="margin-top:40px;text-align:center;font-size:10px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:20px;">
      <p><strong>Equipment &amp; Controls, Inc. Confidential</strong></p>
      <p>Generated on ${new Date().toLocaleString()}</p>
      <p>Performed by: ${performedBy}</p>
    </div>
  </div>

</body>
</html>`;
}

module.exports = { generateIIPDF, generateCombinedIIPDF };
