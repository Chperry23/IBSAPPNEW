/**
 * Migration Script: cabinet_location -> cabinet_name
 * Run this to update existing databases
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.argv[2] || './data/cabinet_pm_tablet.db';

console.log('🔄 Starting database migration...');
console.log('📁 Database:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err);
    process.exit(1);
  }
  console.log('✅ Database opened successfully');
});

db.serialize(() => {
  // Check current schema
  db.all(`PRAGMA table_info(cabinets)`, (err, columns) => {
    if (err) {
      console.error('❌ Error checking schema:', err);
      db.close();
      return;
    }
    
    const hasCabinetLocation = columns.some(col => col.name === 'cabinet_location');
    const hasCabinetName = columns.some(col => col.name === 'cabinet_name');
    
    console.log('\n📊 Current Schema:');
    console.log('   cabinet_location:', hasCabinetLocation ? '✓' : '✗');
    console.log('   cabinet_name:', hasCabinetName ? '✓' : '✗');
    
    if (hasCabinetLocation && !hasCabinetName) {
      console.log('\n🔧 Migration needed: Adding cabinet_name column...');
      
      // Add new column
      db.run(`ALTER TABLE cabinets ADD COLUMN cabinet_name TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.error('❌ Error adding cabinet_name column:', err);
          db.close();
          return;
        }
        
        console.log('✅ cabinet_name column added');
        
        // Copy data
        db.run(`UPDATE cabinets SET cabinet_name = cabinet_location WHERE cabinet_name IS NULL`, (err) => {
          if (err) {
            console.error('❌ Error copying data:', err);
            db.close();
            return;
          }
          
          console.log('✅ Data copied from cabinet_location to cabinet_name');
          
          // Verify migration
          db.get(`SELECT COUNT(*) as count FROM cabinets WHERE cabinet_name IS NULL`, (err, row) => {
            if (err) {
              console.error('❌ Error verifying migration:', err);
            } else {
              console.log(`\n📊 Verification:`);
              console.log(`   Cabinets with NULL cabinet_name: ${row.count}`);
              
              if (row.count === 0) {
                console.log('\n✅ Migration completed successfully!');
                console.log('🎉 All cabinets now have cabinet_name populated');
              } else {
                console.log('\n⚠️  Warning: Some cabinets still have NULL cabinet_name');
              }
            }
            
            db.close(() => {
              console.log('\n💾 Database closed');
              console.log('✅ You can now restart the application');
            });
          });
        });
      });
      
    } else if (hasCabinetName && !hasCabinetLocation) {
      console.log('\n✅ Already migrated! Database is using cabinet_name');
      db.close();
      
    } else if (hasCabinetName && hasCabinetLocation) {
      console.log('\n⚠️  Both columns exist. Syncing data...');
      
      db.run(`UPDATE cabinets SET cabinet_name = cabinet_location WHERE cabinet_name IS NULL OR cabinet_name = ''`, (err) => {
        if (err) {
          console.error('❌ Error syncing data:', err);
        } else {
          console.log('✅ Data synced from cabinet_location to cabinet_name');
        }
        db.close();
      });
      
    } else {
      console.log('\n❌ Unexpected schema state');
      db.close();
    }
  });
});

