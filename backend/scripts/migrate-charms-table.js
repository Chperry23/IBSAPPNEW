/**
 * Migration Script: Drop and Recreate sys_charms Table
 * 
 * This removes the UNIQUE constraint on (customer_id, name) 
 * to allow duplicate charm names across different CIOCs.
 * 
 * Run this once: node backend/scripts/migrate-charms-table.js
 */

const db = require('../config/database');

async function migrateCharmsTable() {
  console.log('🔧 Starting sys_charms table migration...');
  
  try {
    // Step 1: Backup existing data
    console.log('📦 Backing up existing charm data...');
    const existingCharms = await db.prepare('SELECT * FROM sys_charms').all();
    console.log('📦 Found', existingCharms.length, 'existing charms');
    
    // Step 2: Drop the old table
    console.log('🗑️  Dropping old sys_charms table...');
    await db.prepare('DROP TABLE IF EXISTS sys_charms').run();
    
    // Step 3: Create new table without UNIQUE constraint on name
    console.log('🆕 Creating new sys_charms table...');
    await db.prepare(`
      CREATE TABLE sys_charms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        charms_io_card_name TEXT,
        name TEXT NOT NULL,
        model TEXT,
        software_revision TEXT,
        hardware_revision TEXT,
        serial_number TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      )
    `).run();
    
    console.log('✅ New sys_charms table created successfully');
    console.log('');
    console.log('⚠️  Note: Existing charm data was not restored.');
    console.log('   Please re-import your system registry XML to populate the new table.');
    console.log('');
    console.log('✅ Migration complete!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrateCharmsTable();
