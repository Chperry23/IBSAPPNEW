#!/usr/bin/env node
/**
 * ECI Cabinet PM - Complete Deployment Package with Executable
 * 
 * Creates a ZIP with:
 * - Standalone .exe (includes Node.js)
 * - Batch file launcher
 * - All necessary files
 * - Easy instructions
 */

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { exec } = require('child_process');

const OUTPUT_FILE = 'ECI-Cabinet-PM-Complete.zip';

console.log('📦 Creating COMPLETE deployment package with executable...\n');

// Step 1: Build the executable first
console.log('Step 1: Building standalone executable...');
exec('node build-exe.js', { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
  if (error) {
    console.error('❌ Failed to build executable');
    console.log('\n📦 Creating package WITHOUT executable (batch files only)...\n');
    createPackage(false);
  } else {
    console.log(stdout);
    console.log('\n✅ Executable built!\n');
    console.log('Step 2: Creating deployment package...\n');
    createPackage(true);
  }
});

function createPackage(includeExe) {
  const output = fs.createWriteStream(OUTPUT_FILE);
  const archive = archiver('zip', {
    zlib: { level: 9 }
  });

  archive.on('error', (err) => {
    throw err;
  });

  archive.pipe(output);

  console.log('📁 Adding files to package:');

  // Core files for deployment
  const files = [
    'README-TABLET.txt',
    'TABLET-DEPLOYMENT-GUIDE.md'
  ];
  
  // Add appropriate launcher based on what's available
  if (includeExe) {
    files.push('START-CABINET-PM-EXE.bat');
  } else {
    files.push('START-CABINET-PM.bat');
    files.push('INSTALL-ON-TABLET.bat');
    files.push('CREATE-DESKTOP-SHORTCUT.vbs');
    files.push('server-tablet.js');
    files.push('package.json');
    files.push('package-lock.json');
  }

  files.forEach(file => {
    if (fs.existsSync(file)) {
      console.log(`  ✅ ${file}`);
      archive.file(file, { name: file });
    }
  });

  // Add executable if it exists
  if (includeExe && fs.existsSync('dist/CabinetPM.exe')) {
    console.log(`  ✅ dist/CabinetPM.exe (standalone executable)`);
    archive.file('dist/CabinetPM.exe', { name: 'CabinetPM.exe' });
  }

  // Add directories
  const dirs = [
    'backend',
    'frontend-react/dist'
  ];

  dirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      console.log(`  ✅ ${dir}/ (directory)`);
      archive.directory(dir, dir);
    }
  });

  // CRITICAL: Include sqlite3 native module AND all its runtime dependencies.
  // sqlite3 requires @mapbox/node-pre-gyp to resolve its native binding at runtime.
  // Without these, the exe will crash on startup with a module-not-found error.
  const requiredModuleDirs = [
    'node_modules/sqlite3',
    'node_modules/@mapbox',
    'node_modules/node-addon-api',
    'node_modules/detect-libc',
    'node_modules/nopt',
    'node_modules/abbrev',
    'node_modules/semver',
    'node_modules/make-dir',
    'node_modules/npmlog',
    'node_modules/are-we-there-yet',
    'node_modules/console-control-strings',
    'node_modules/gauge',
    'node_modules/set-blocking',
    'node_modules/delegates',
    'node_modules/readable-stream',
    'node_modules/string_decoder',
    'node_modules/safe-buffer',
    'node_modules/util-deprecate',
    'node_modules/inherits',
    'node_modules/has-unicode',
    'node_modules/wide-align',
    'node_modules/string-width',
    'node_modules/strip-ansi',
    'node_modules/ansi-regex',
    'node_modules/is-fullwidth-code-point',
    'node_modules/emoji-regex',
    'node_modules/color-support',
    'node_modules/signal-exit',
    'node_modules/aproba',
    'node_modules/object-assign',
    'node_modules/tar',
    'node_modules/minipass',
    'node_modules/minizlib',
    'node_modules/yallist',
    'node_modules/chownr',
    'node_modules/fs-minipass',
    'node_modules/mkdirp',
    'node_modules/rimraf',
    'node_modules/glob',
    'node_modules/inflight',
    'node_modules/once',
    'node_modules/wrappy',
    'node_modules/balanced-match',
    'node_modules/brace-expansion',
    'node_modules/minimatch',
    'node_modules/fs.realpath',
    'node_modules/node-fetch',
    'node_modules/whatwg-url',
    'node_modules/tr46',
    'node_modules/webidl-conversions',
    'node_modules/https-proxy-agent',
    'node_modules/agent-base',
    'node_modules/debug',
    'node_modules/ms',
  ];

  let modulesAdded = 0;
  let modulesMissing = 0;
  requiredModuleDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      archive.directory(dir, dir);
      modulesAdded++;
    } else {
      console.warn(`  -- ${dir}/ not found (may be optional)`);
      modulesMissing++;
    }
  });
  console.log(`  + ${modulesAdded} node_modules included (${modulesMissing} optional modules not found)`);

  if (!fs.existsSync('node_modules/sqlite3')) {
    console.warn(`  WARNING: node_modules/sqlite3/ NOT FOUND! Run: npm install`);
  }

  archive.finalize();

  output.on('close', () => {
    const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
    console.log('\n================================================================');
    console.log('  ✅ COMPLETE DEPLOYMENT PACKAGE CREATED!');
    console.log('================================================================');
    console.log(`\n📦 File: ${OUTPUT_FILE}`);
    console.log(`💾 Size: ${sizeMB} MB`);
    console.log(`\n🎯 What's Inside:`);
    if (includeExe) {
      console.log(`   ✅ CabinetPM.exe (Node.js built-in!)`);
      console.log(`   ✅ START-CABINET-PM-EXE.bat (one-click launcher)`);
      console.log(`   ✅ SQLite3 native module (included)`);
      console.log(`   ⭐ Tablets need NOTHING installed!`);
    } else {
      console.log(`   ✅ START-CABINET-PM.bat (launcher)`);
      console.log(`   ✅ INSTALL-ON-TABLET.bat (installer)`);
      console.log(`   ⚠️  Tablets need Node.js installed`);
    }
    console.log(`   ✅ React frontend (pre-built)`);
    console.log(`   ✅ Backend modules`);
    console.log(`   ✅ Instructions (README-TABLET.txt)`);
    console.log(`\n📱 SUPER EASY TABLET SETUP:`);
    console.log(`   1. Copy ZIP to USB drive`);
    console.log(`   2. On tablet: Extract ZIP file`);
    if (includeExe) {
      console.log(`   3. Double-click: START-CABINET-PM-EXE.bat`);
      console.log(`   ⭐ That's it! No installation needed!`);
    } else {
      console.log(`   3. Double-click: INSTALL-ON-TABLET.bat (first time)`);
      console.log(`   4. Double-click: START-CABINET-PM.bat`);
    }
    console.log('\n================================================================\n');
  });
}
