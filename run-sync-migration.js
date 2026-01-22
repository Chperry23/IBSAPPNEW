/**
 * Sync Migration Script
 * Adds required sync columns to existing Cabinet PM database
 * Run this if you see "no such column: deleted/synced" errors
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Find the database
const isPackaged = typeof process.pkg !== 'undefined';
const possiblePaths = [
  path.join(process.cwd(), 'cabinet_pm_tablet.db'),
  path.join(__dirname, 'cabinet_pm_tablet.db'),
  path.join(__dirname, 'data', 'cabinet_pm_tablet.db'),
  path.join(__dirname, 'dist', 'CabinetPM-v2.1.0', 'data', 'cabinet_pm_tablet.db'),
  'C:\\IBS APP\\TABLET-DEPLOYMENT\\cabinet_pm_tablet.db',
  'C:\\IBS APP\\TABLET-DEPLOYMENT\\dist\\CabinetPM-v2.1.0\\data\\cabinet_pm_tablet.db'
];

let dbPath = null;
for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    dbPath = p;
    break;
  }
}

if (!dbPath) {
  console.error('❌ Could not find database file!');
  console.log('Searched paths:');
  possiblePaths.forEach(p => console.log(`  - ${p}`));
  process.exit(1);
}

console.log(`✅ Found database: ${dbPath}`);
console.log('');

const db = new sqlite3.Database(dbPath);

// List of tables and their sync columns
const migrations = [
  // Core tables
  { table: 'users', columns: ['uuid', 'synced', 'device_id', 'deleted', 'updated_at'] },
  { table: 'customers', columns: ['uuid', 'synced', 'device_id', 'deleted', 'updated_at'] },
  { table: 'sessions', columns: ['uuid', 'synced', 'device_id', 'deleted', 'updated_at'] },
  { table: 'cabinets', columns: ['uuid', 'synced', 'device_id', 'deleted', 'updated_at'] },
  { table: 'nodes', columns: ['uuid', 'synced', 'device_id', 'deleted', 'updated_at'] },
  
  // Session tables
  { table: 'session_node_maintenance', columns: ['uuid', 'synced', 'device_id', 'deleted', 'updated_at'] },
  { table: 'session_node_tracker', columns: ['uuid', 'synced', 'device_id', 'deleted', 'updated_at'] },
  { table: 'cabinet_locations', columns: ['uuid', 'synced', 'device_id', 'deleted', 'updated_at'] },
  { table: 'session_pm_notes', columns: ['uuid', 'synced', 'device_id', 'deleted', 'updated_at'] },
  
  // I&I tables
  { table: 'session_ii_documents', columns: ['uuid', 'synced', 'device_id', 'deleted', 'updated_at'] },
  { table: 'session_ii_equipment', columns: ['uuid', 'synced', 'device_id', 'deleted', 'updated_at'] },
  { table: 'session_ii_checklist', columns: ['uuid', 'synced', 'device_id', 'deleted', 'updated_at'] },
  { table: 'session_ii_equipment_used', columns: ['uuid', 'synced', 'device_id', 'deleted', 'updated_at'] },
  
  // Diagnostic tables
  { table: 'session_diagnostics', columns: ['uuid', 'synced', 'device_id', 'deleted', 'updated_at'] },
  { table: 'session_node_snapshots', columns: ['created_at', 'updated_at'] }
];

// Column definitions
const columnDefs = {
  'uuid': 'TEXT',
  'synced': 'INTEGER DEFAULT 0',
  'device_id': 'TEXT',
  'deleted': 'INTEGER DEFAULT 0',
  'updated_at': 'DATETIME DEFAULT CURRENT_TIMESTAMP',
  'created_at': 'DATETIME DEFAULT CURRENT_TIMESTAMP'
};

console.log('🔧 Starting Sync Column Migration...');
console.log('=====================================');
console.log('');

// First, ensure sync_metadata table exists
db.run(`CREATE TABLE IF NOT EXISTS sync_metadata (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`, (err) => {
  if (err) {
    console.log('   ⚠️  Error creating sync_metadata table:', err.message);
  } else {
    console.log('   ✅ sync_metadata table ensured');
  }
});

console.log('');

let totalAdded = 0;
let totalSkipped = 0;
let completedTables = 0;

// Process each table sequentially
function processTable(index) {
  if (index >= migrations.length) {
    console.log('');
    console.log('=====================================');
    console.log('✅ Migration Complete!');
    console.log(`   Tables processed: ${completedTables}`);
    console.log(`   Columns added: ${totalAdded}`);
    console.log(`   Columns skipped: ${totalSkipped}`);
    console.log('');
    console.log('You can now use the sync functionality!');
    db.close();
    return;
  }
  
  const { table, columns } = migrations[index];
  
  console.log(`📋 Processing table: ${table}`);
  
  // Get existing columns
  db.all(`PRAGMA table_info(${table})`, (err, existingColumns) => {
    if (err) {
      console.log(`   ⚠️  Table ${table} not found - skipping`);
      completedTables++;
      processTable(index + 1);
      return;
    }
    
    const existingColumnNames = existingColumns.map(col => col.name);
    let addedForTable = 0;
    let skippedForTable = 0;
    
    // Add each column if it doesn't exist
    let columnIndex = 0;
    
    function addNextColumn() {
      if (columnIndex >= columns.length) {
        console.log(`   ✅ Added ${addedForTable} columns, skipped ${skippedForTable} existing`);
        completedTables++;
        processTable(index + 1);
        return;
      }
      
      const colName = columns[columnIndex];
      
      if (existingColumnNames.includes(colName)) {
        skippedForTable++;
        totalSkipped++;
        columnIndex++;
        addNextColumn();
      } else {
        const colDef = columnDefs[colName];
        db.run(`ALTER TABLE ${table} ADD COLUMN ${colName} ${colDef}`, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            console.log(`   ⚠️  Failed to add ${colName}: ${err.message}`);
          } else if (!err) {
            addedForTable++;
            totalAdded++;
          }
          columnIndex++;
          addNextColumn();
        });
      }
    }
    
    addNextColumn();
  });
}

// Start processing
processTable(0);

