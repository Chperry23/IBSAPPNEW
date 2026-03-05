const fs = require('fs');
const path = require('path');
const os = require('os');
// Opaque dynamic require — prevents pkg from statically analysing and
// trying to bundle Chromium (~300 MB) into the exe snapshot.
const _pptr = 'puppeteer';
function getPuppeteer() { return require(_pptr); }

// Chrome detection function for PDF generation
async function findChrome() {
  const platform = os.platform();
  const possiblePaths = [];
  
  if (platform === 'win32') {
    possiblePaths.push(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    );
  } else if (platform === 'darwin') {
    possiblePaths.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    );
  } else {
    possiblePaths.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/snap/bin/chromium'
    );
  }
  
  // Check for existing Chrome installations
  for (const chromePath of possiblePaths) {
    if (fs.existsSync(chromePath)) {
      console.log(`🌐 Found Chrome/Edge at: ${chromePath}`);
      return chromePath;
    }
  }
  
  // If no Chrome found, try to use Puppeteer's bundled Chromium
  try {
    const puppeteerChrome = getPuppeteer().executablePath();
    if (fs.existsSync(puppeteerChrome)) {
      console.log(`🌐 Using Puppeteer bundled Chromium: ${puppeteerChrome}`);
      return puppeteerChrome;
    }
  } catch (error) {
    console.log('⚠️ Puppeteer bundled Chromium not available');
  }
  
  console.log('❌ No Chrome/Edge installation found. PDF generation may fail.');
  console.log('   Please install Google Chrome or Microsoft Edge to enable PDF generation.');

  // Return undefined to let Puppeteer try its default behavior
  return undefined;
}

module.exports = { findChrome };

