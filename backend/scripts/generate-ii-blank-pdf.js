/**
 * Builds samples/I-I-blank-cabinet-template.pdf using the SAME HTML + Puppeteer
 * pipeline as POST /api/ii-documents/:id/export-pdf (iiReport.generateIIPDF).
 *
 * Requires: puppeteer dependency + Chrome or Edge on PATH/common locations.
 *
 * Usage (from repo root): node backend/scripts/generate-ii-blank-pdf.js
 */
const path = require('path');
const fs = require('fs');
const { generateIIPDF, buildBlankIIChecklistItems } = require('../services/pdf/iiReport');
const { findChrome, getPuppeteer } = require('../utils/chrome');

const OUT = path.join(__dirname, '../../samples/I-I-blank-cabinet-template.pdf');

function emptyEquipmentRows(n) {
  return Array.from({ length: n }, () => ({
    manufacturer: '',
    type: '',
    serial_number: '',
    recalibration_date: '',
    used_in_section: ''
  }));
}

async function main() {
  const pptr = getPuppeteer();
  if (!pptr) {
    console.error('Puppeteer is not installed. Run npm install from the repo root.');
    process.exit(1);
  }

  const chromePath = await findChrome();
  if (!chromePath) {
    console.error('No Chrome/Edge found. Install Google Chrome or Microsoft Edge for PDF generation.');
    process.exit(1);
  }

  const document = {
    document_name: 'Blank Installation & Integration — Cabinet',
    deltav_system_id: '',
    location: '',
    date_performed: '',
    header_date_placeholder: ''
  };

  const session = {
    ii_customer_name: '',
    ii_location: '',
    ii_performed_by: '',
    ii_date_performed: '',
    ii_initials: '',
    ii_prepared_for: '',
    customer_name: '',
    customer_location: '',
    deltav_system_id: ''
  };

  const checklistItems = buildBlankIIChecklistItems();
  const equipmentUsed = emptyEquipmentRows(6);

  const html = generateIIPDF(document, session, checklistItems, equipmentUsed, { blankTemplate: true });

  const browser = await pptr.launch({
    executablePath: chromePath,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-web-security',
      '--memory-pressure-off'
    ]
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 120000 });

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' }
  });

  await browser.close();

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, pdfBuffer);
  console.log('Wrote', OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
