const sqlite3 = require('sqlite3').verbose();

const dbPath = process.argv[2] || './cabinet_pm_tablet.db';
console.log('Checking schema for:', dbPath);

const db = new sqlite3.Database(dbPath);

db.all(`PRAGMA table_info(cabinets)`, (err, columns) => {
  if (err) {
    console.error('Error:', err);
    db.close();
    return;
  }
  
  console.log('\n📊 Cabinets Table Schema:');
  console.log('─'.repeat(80));
  columns.forEach(col => {
    console.log(`${col.name.padEnd(25)} | ${col.type.padEnd(15)} | NOT NULL: ${col.notnull} | DEFAULT: ${col.dflt_value}`);
  });
  console.log('─'.repeat(80));
  
  db.close();
});

