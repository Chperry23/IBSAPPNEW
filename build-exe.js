#!/usr/bin/env node
/**
 * ECI Cabinet PM - Standalone Executable Builder
 * 
 * Creates a TRUE standalone .exe with Node.js built-in!
 * Tablets need NOTHING installed - just run the .exe!
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('  ECI CABINET PM - STANDALONE EXECUTABLE BUILDER');
console.log('================================================================\n');
console.log('🔨 Building standalone .exe with Node.js embedded...');
console.log('   Tablets will NOT need Node.js installed!\n');

// Ensure dist folder exists
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist', { recursive: true });
}

// Check if pkg is installed
exec('npm list pkg', (error) => {
  if (error) {
    console.log('📦 First time setup - Installing pkg tool...\n');
    exec('npm install pkg --save-dev', (installError) => {
      if (installError) {
        console.error('❌ Failed to install pkg:', installError.message);
        console.error('\n💡 Try running: npm install pkg --save-dev\n');
        process.exit(1);
      }
      console.log('✅ pkg installed!\n');
      buildExecutable();
    });
  } else {
    buildExecutable();
  }
});

function buildExecutable() {
  console.log('🏗️  Building Windows executable...');
  console.log('   This may take 2-3 minutes...\n');
  console.log('⚠️  Note: SQLite3 uses native modules, so we keep it external');
  console.log('   The deployment will include node_modules/sqlite3/\n');
  
  // Build for Windows 64-bit with Node 18 - no compression to avoid issues
  const buildCommand = 'npx pkg server-tablet.js --targets node18-win-x64 --output dist/CabinetPM.exe';
  
  exec(buildCommand, { maxBuffer: 30 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Build failed:', error.message);
      if (stderr) {
        console.error('\nDetails:', stderr);
      }
      console.error('\n💡 Troubleshooting:');
      console.error('   1. Make sure pkg is installed: npm install pkg --save-dev');
      console.error('   2. Make sure frontend-react/dist/ exists: npm run build:frontend');
      console.error('   3. Try deleting dist/ folder and rebuild\n');
      process.exit(1);
    }
    
    if (stdout) console.log(stdout);
    if (stderr && !error) console.log('Build warnings:', stderr);
    
    if (fs.existsSync('dist/CabinetPM.exe')) {
      const stats = fs.statSync('dist/CabinetPM.exe');
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      
      // Validate size (should be at least 40 MB with Node.js)
      if (stats.size < 10 * 1024 * 1024) {
        console.error('\n❌ WARNING: Executable is too small (' + sizeMB + ' MB)!');
        console.error('   Expected: 40-80 MB with Node.js embedded');
        console.error('   This indicates the build failed partially.\n');
        console.error('💡 Try:');
        console.error('   1. Delete dist/ folder');
        console.error('   2. Run: npm install pkg --save-dev');
        console.error('   3. Run: npm run build:exe again\n');
        process.exit(1);
      }
      
      console.log('\n================================================================');
      console.log('  ✅ STANDALONE EXECUTABLE CREATED SUCCESSFULLY!');
      console.log('================================================================');
      console.log(`\n📦 File: dist/CabinetPM.exe`);
      console.log(`💾 Size: ${sizeMB} MB (includes Node.js!)`);
      console.log(`\n✨ What's Inside:`);
      console.log(`   ✅ Node.js 18 runtime (embedded)`);
      console.log(`   ✅ All your server code`);
      console.log(`   ✅ All backend dependencies`);
      console.log(`   ✅ React frontend (from dist/)`);
      console.log(`\n⚠️  Still Needed (bundled separately):`);
      console.log(`   📁 node_modules/sqlite3/ (native module)`);
      console.log(`   📁 backend/ (imported modules)`);
      console.log(`\n📋 Next Step:`);
      console.log(`   Run: npm run build:full`);
      console.log(`   This creates the complete ZIP with everything`);
      console.log(`\n🎯 On tablets: Extract ZIP and double-click START-CABINET-PM-EXE.bat`);
      console.log('================================================================\n');
    } else {
      console.error('\n❌ Executable file not found after build');
      console.error('   Expected: dist/CabinetPM.exe');
      console.error('\n💡 Check:');
      console.error('   1. Do you have write permissions to dist/ folder?');
      console.error('   2. Is antivirus blocking the file creation?\n');
      process.exit(1);
    }
  });
}

