/**
 * Quick script to migrate DIST database specifically
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = 'C:\\IBS APP\\TABLET-DEPLOYMENT\\dist\\CabinetPM-v2.1.0\\data\\cabinet_pm_tablet.db';

console.log(`✅ Migrating: ${dbPath}`);
console.log('');

const db = new sqlite3.Database(dbPath);

// List of tables and their sync columns
const migrations = [
  { table: 'users', columns: ['uuid', 'synced', 'device_id', 'deleted'] },
  { table: 'customers', columns: ['uuid', 'synced', 'device_id', 'deleted'] },
  { table: 'sessions', columns: ['uuid', 'synced', 'device_id', 'deleted'] },
  { table: 'cabinets', columns: ['uuid', 'synced', 'device_id', 'deleted'] },
  { table: 'nodes', columns: ['uuid', 'synced', 'device_id', 'deleted'] },
  { table: 'session_node_maintenance', columns: ['uuid', 'synced', 'device_id', 'deleted'] },
  { table: 'session_node_tracker', columns: ['uuid', 'synced', 'device_id', 'deleted'] },
  { table: 'cabinet_locations', columns: ['uuid', 'synced', 'device_id', 'deleted'] },
  { table: 'session_pm_notes', columns: ['uuid', 'synced', 'device_id', 'deleted'] },
  { table: 'session_ii_documents', columns: ['uuid', 'synced', 'device_id', 'deleted'] },
  { table: 'session_ii_equipment', columns: ['uuid', 'synced', 'device_id', 'deleted'] },
  { table: 'session_ii_checklist', columns: ['uuid', 'synced', 'device_id', 'deleted'] },
  { table: 'session_ii_equipment_used', columns: ['uuid', 'synced', 'device_id', 'deleted'] },
  { table: 'session_diagnostics', columns: ['uuid', 'synced', 'device_id', 'deleted'] }
];

const columnDefs = {
  'uuid': 'TEXT',
  'synced': 'INTEGER DEFAULT 0',
  'device_id': 'TEXT',
  'deleted': 'INTEGER DEFAULT 0'
};

console.log('🔧 Starting Migration...');

// Create sync_metadata table
db.run(`CREATE TABLE IF NOT EXISTS sync_metadata (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`, (err) => {
  if (err) {
    console.log('   ⚠️  sync_metadata error:', err.message);
  } else {
    console.log('   ✅ sync_metadata table created');
  }
  
  let totalAdded = 0;
  let completedTables = 0;
  
  function processTable(index) {
    if (index >= migrations.length) {
      console.log('');
      console.log('=====================================');
      console.log(`✅ Migration Complete! Added ${totalAdded} columns`);
      db.close();
      return;
    }
    
    const { table, columns } = migrations[index];
    
    db.all(`PRAGMA table_info(${table})`, (err, existingColumns) => {
      if (err) {
        console.log(`   ⚠️  Table ${table} not found`);
        processTable(index + 1);
        return;
      }
      
      const existingColumnNames = existingColumns.map(col => col.name);
      let addedForTable = 0;
      let columnIndex = 0;
      
      function addNextColumn() {
        if (columnIndex >= columns.length) {
          if (addedForTable > 0) {
            console.log(`   ✅ ${table}: Added ${addedForTable} columns`);
          }
          completedTables++;
          processTable(index + 1);
          return;
        }
        
        const colName = columns[columnIndex];
        
        if (existingColumnNames.includes(colName)) {
          columnIndex++;
          addNextColumn();
        } else {
          const colDef = columnDefs[colName];
          db.run(`ALTER TABLE ${table} ADD COLUMN ${colName} ${colDef}`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
              console.log(`   ⚠️  ${table}.${colName}: ${err.message}`);
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
  
  processTable(0);
});

