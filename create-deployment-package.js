#!/usr/bin/env node
/**
 * ECI Cabinet PM - Deployment Package Creator
 * 
 * Creates a clean deployment package for tablets
 * Excludes development files and old HTML frontend
 */

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const OUTPUT_FILE = 'ECI-Cabinet-PM-Deployment.zip';

// Files and folders to INCLUDE in deployment
const INCLUDE = [
  'server-tablet.js',
  'package.json',
  'package-lock.json',
  'backend/',
  'frontend-react/dist/',
  'DEPLOYMENT-INSTRUCTIONS.md',
  'START-CABINET-PM.bat',
  'INSTALL-ON-TABLET.bat',
  'CREATE-DESKTOP-SHORTCUT.vbs',
  'README-TABLET.txt'
];

// Files and folders to EXCLUDE from deployment
const EXCLUDE = [
  'node_modules/',
  'cabinet-pm.db',      // Database (each tablet creates its own)
  'cabinet-pm.db-wal',
  'cabinet-pm.db-shm',
  '.git/',
  '.gitignore',
  'create-deployment-package.js',
  'create-full-package.js',
  'build-exe.js',
  'cabinet-pm-installer.iss',
  'DEPLOY-TO-TABLETS.bat'
];

console.log('📦 Creating deployment package for tablets...\n');

// Create output stream
const output = fs.createWriteStream(OUTPUT_FILE);
const archive = archiver('zip', {
  zlib: { level: 9 } // Maximum compression
});

// Listen for warnings and errors
archive.on('warning', (err) => {
  if (err.code === 'ENOENT') {
    console.warn('⚠️  Warning:', err.message);
  } else {
    throw err;
  }
});

archive.on('error', (err) => {
  throw err;
});

// Pipe archive data to the file
archive.pipe(output);

// Add files and folders
console.log('📁 Adding files to package:');
INCLUDE.forEach(item => {
  const fullPath = path.join(__dirname, item);
  
  if (fs.existsSync(fullPath)) {
    const stats = fs.statSync(fullPath);
    
    if (stats.isDirectory()) {
      console.log(`  ✅ ${item} (directory)`);
      archive.directory(fullPath, item);
    } else {
      console.log(`  ✅ ${item}`);
      archive.file(fullPath, { name: item });
    }
  } else {
    console.log(`  ⚠️  ${item} (not found, skipping)`);
  }
});

// Finalize the archive
archive.finalize();

output.on('close', () => {
  const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
  console.log(`\n✅ Deployment package created successfully!`);
  console.log(`📦 File: ${OUTPUT_FILE}`);
  console.log(`💾 Size: ${sizeMB} MB`);
  console.log(`\n📋 EASY DEPLOYMENT - No Command Prompt Needed!`);
  console.log(`================================================`);
  console.log(`\n🎯 On Your Main Computer:`);
  console.log(`   1. Copy ${OUTPUT_FILE} to USB drive`);
  console.log(`\n📱 On Each Tablet:`);
  console.log(`   1. Copy ZIP from USB to tablet`);
  console.log(`   2. Extract the ZIP file`);
  console.log(`   3. Open README-TABLET.txt for instructions`);
  console.log(`   4. Double-click: INSTALL-ON-TABLET.bat`);
  console.log(`   5. Double-click: START-CABINET-PM.bat`);
  console.log(`\n✨ That's it! No command line needed!`);
  console.log(`================================================\n`);
});
