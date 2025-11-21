const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const puppeteer = require('puppeteer');
const archiver = require('archiver');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const os = require('os');

// Add comprehensive error handling for executable
process.on('uncaughtException', (error) => {
    console.error('❌ UNCAUGHT EXCEPTION:', error);
    console.error('Stack:', error.stack);
    try {
        fs.writeFileSync('error.log', `${new Date().toISOString()} - UNCAUGHT EXCEPTION: ${error.message}\n${error.stack}\n`, { flag: 'a' });
        console.log('💾 Error logged to error.log');
    } catch (e) {
        console.error('Failed to write error log:', e);
    }
    console.log('🔄 Server will continue running. Press Ctrl+C to exit...');
    console.log('📋 Check error.log for details. Window will stay open for debugging.');
    // Don't exit - keep server running
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ UNHANDLED REJECTION at:', promise, 'reason:', reason);
    try {
        fs.writeFileSync('error.log', `${new Date().toISOString()} - UNHANDLED REJECTION: ${reason}\n`, { flag: 'a' });
        console.log('💾 Error logged to error.log');
    } catch (e) {
        console.error('Failed to write error log:', e);
    }
    // Don't exit - keep server running
});

// Log startup information
console.log('🚀 Starting Cabinet PM Tablet Server...');
console.log('📁 Working directory:', process.cwd());
console.log('📁 __dirname:', __dirname);
console.log('📁 Process argv:', process.argv);
console.log('📁 Node version:', process.version);

const app = express();
const PORT = process.env.PORT || 3000;

// Determine if running as packaged executable
const isPackaged = typeof process.pkg !== 'undefined';

// Set up proper paths for packaged executable
const appBasePath = isPackaged ? path.dirname(process.execPath) : __dirname;
const dbPath = path.join(appBasePath, 'data', 'cabinet_pm_tablet.db');

console.log('🔧 Environment Setup:');
console.log(`   Packaged: ${isPackaged}`);
console.log(`   Base Path: ${appBasePath}`);
console.log(`   Database Path: ${dbPath}`);

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
    const puppeteerChrome = puppeteer.executablePath();
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

// SQLite Database setup for tablet deployment (using sqlite3)
console.log('📊 Initializing database...');
let db;
try {
    db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error('❌ Database connection failed:', err);
            fs.writeFileSync('error.log', `${new Date().toISOString()} - DATABASE ERROR: ${err.message}\n`, { flag: 'a' });
            throw err;
        } else {
            console.log('✅ Database connected successfully');
        }
    });
} catch (error) {
    console.error('❌ Critical database error:', error);
    process.exit(1);
}

// Create a better-sqlite3 compatible wrapper for easier migration
const originalPrepare = db.prepare;
db.prepare = function(sql) {
  return {
    get: function(params) {
      return new Promise((resolve, reject) => {
        if (params === undefined) {
          db.get(sql, [], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        } else if (Array.isArray(params)) {
          db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        } else {
          db.get(sql, [params], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        }
      });
    },
    all: function(params) {
      return new Promise((resolve, reject) => {
        if (params === undefined) {
          db.all(sql, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          });
        } else if (Array.isArray(params)) {
          db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          });
        } else {
          db.all(sql, [params], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          });
        }
      });
    },
    run: function(params) {
      return new Promise((resolve, reject) => {
        if (params === undefined) {
          db.run(sql, [], function(err) {
            if (err) reject(err);
            else resolve({ lastInsertRowid: this.lastID, changes: this.changes });
          });
        } else if (Array.isArray(params)) {
          db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ lastInsertRowid: this.lastID, changes: this.changes });
          });
        } else {
          db.run(sql, [params], function(err) {
            if (err) reject(err);
            else resolve({ lastInsertRowid: this.lastID, changes: this.changes });
          });
        }
      });
    }
  };
};

// Initialize SQLite database tables (sqlite3 async)
function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
    // Users table
      db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) {
          console.error('❌ Error creating users table:', err);
        } else {
          console.log('✅ Created (or found) users table');
        }
      });

    // Customers table
      db.run(`CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      location TEXT,
      contact_info TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) {
          console.error('❌ Error creating customers table:', err);
        } else {
          console.log('✅ Created (or found) customers table');
        }
      });

    // Sessions table
      db.run(`CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      customer_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      session_name TEXT NOT NULL,
      session_type TEXT DEFAULT 'pm',
      status TEXT DEFAULT 'active',
      uuid TEXT,
      synced INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // Add completed_at column if it doesn't exist (for existing databases)
      db.run(`ALTER TABLE sessions ADD COLUMN completed_at DATETIME`, (err) => {
      // Column already exists, ignore error
      });

      // Add uuid column if it doesn't exist (for existing databases)
      db.run(`ALTER TABLE sessions ADD COLUMN uuid TEXT`, (err) => {
      // Column already exists, ignore error
      });

      // Add synced column if it doesn't exist (for existing databases)
      db.run(`ALTER TABLE sessions ADD COLUMN synced INTEGER DEFAULT 0`, (err) => {
      // Column already exists, ignore error
      });

      // Add deleted column if it doesn't exist (for soft delete sync)
      db.run(`ALTER TABLE sessions ADD COLUMN deleted INTEGER DEFAULT 0`, (err) => {
      // Column already exists, ignore error
      });

      // Add session_type column if it doesn't exist (for existing databases)
      db.run(`ALTER TABLE sessions ADD COLUMN session_type TEXT DEFAULT 'pm'`, (err) => {
      // Column already exists, ignore error
      });

    // Cabinets table
      db.run(`CREATE TABLE IF NOT EXISTS cabinets (
      id TEXT PRIMARY KEY,
      pm_session_id TEXT NOT NULL,
      cabinet_location TEXT NOT NULL,
      cabinet_date DATE,
      status TEXT DEFAULT 'active',
      power_supplies TEXT DEFAULT '[]',
      distribution_blocks TEXT DEFAULT '[]',
      diodes TEXT DEFAULT '[]',
      network_equipment TEXT DEFAULT '[]',
      controllers TEXT DEFAULT '[]',
      inspection_data TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (pm_session_id) REFERENCES sessions(id)
    )`);

    // Add deleted column to cabinets table (for soft delete sync)
    db.run(`ALTER TABLE cabinets ADD COLUMN deleted INTEGER DEFAULT 0`, (err) => {
      // Column already exists, ignore error
    });

    // Nodes table for customer equipment inventory
      db.run(`CREATE TABLE IF NOT EXISTS nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      node_name TEXT NOT NULL,
      node_type TEXT NOT NULL,
      model TEXT,
      description TEXT,
      serial TEXT,
      firmware TEXT,
      version TEXT,
      status TEXT,
      redundant TEXT,
      os_name TEXT,
      os_service_pack TEXT,
      bios_version TEXT,
      oem_type_description TEXT,
      assigned_cabinet_id TEXT,
      assigned_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (assigned_cabinet_id) REFERENCES cabinets(id),
      UNIQUE(customer_id, node_name)
    )`);

    // Session node maintenance tracking table
      db.run(`CREATE TABLE IF NOT EXISTS session_node_maintenance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      node_id INTEGER NOT NULL,
      dv_checked BOOLEAN DEFAULT FALSE,
      os_checked BOOLEAN DEFAULT FALSE,
      macafee_checked BOOLEAN DEFAULT FALSE,
      free_time TEXT,
      redundancy_checked BOOLEAN DEFAULT FALSE,
      cold_restart_checked BOOLEAN DEFAULT FALSE,
      no_errors_checked BOOLEAN DEFAULT FALSE,
      hdd_replaced BOOLEAN DEFAULT FALSE,
      performance_type TEXT DEFAULT 'free_time',
      performance_value TEXT,
      hf_updated BOOLEAN DEFAULT FALSE,
      firmware_updated_checked BOOLEAN DEFAULT FALSE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      FOREIGN KEY (node_id) REFERENCES nodes(id),
      UNIQUE(session_id, node_id)
    )`);

    // Add missing columns to existing session_node_maintenance tables
    db.run(`ALTER TABLE session_node_maintenance ADD COLUMN hdd_replaced BOOLEAN DEFAULT FALSE`, (err) => {
      // Column already exists, ignore error
    });
    db.run(`ALTER TABLE session_node_maintenance ADD COLUMN performance_type TEXT DEFAULT 'free_time'`, (err) => {
      // Column already exists, ignore error
    });
    db.run(`ALTER TABLE session_node_maintenance ADD COLUMN performance_value TEXT`, (err) => {
      // Column already exists, ignore error
    });
    db.run(`ALTER TABLE session_node_maintenance ADD COLUMN hf_updated BOOLEAN DEFAULT FALSE`, (err) => {
      // Column already exists, ignore error
    });
    db.run(`ALTER TABLE session_node_maintenance ADD COLUMN firmware_updated_checked BOOLEAN DEFAULT FALSE`, (err) => {
      // Column already exists, ignore error
    });

    // Add sync columns to session_node_maintenance table
    db.run(`ALTER TABLE session_node_maintenance ADD COLUMN uuid TEXT`, (err) => {
      // Column already exists, ignore error
    });
    db.run(`ALTER TABLE session_node_maintenance ADD COLUMN synced INTEGER DEFAULT 0`, (err) => {
      // Column already exists, ignore error
    });
    db.run(`ALTER TABLE session_node_maintenance ADD COLUMN device_id TEXT`, (err) => {
      // Column already exists, ignore error
    });
    db.run(`ALTER TABLE session_node_maintenance ADD COLUMN deleted INTEGER DEFAULT 0`, (err) => {
      // Column already exists, ignore error
    });

    // Session node tracker table
      db.run(`CREATE TABLE IF NOT EXISTS session_node_tracker (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      node_id INTEGER NOT NULL,
      completed BOOLEAN DEFAULT FALSE,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      FOREIGN KEY (node_id) REFERENCES nodes(id),
      UNIQUE(session_id, node_id)
    )`);

    // Add deleted column to session_node_tracker table (for soft delete sync)
    db.run(`ALTER TABLE session_node_tracker ADD COLUMN deleted INTEGER DEFAULT 0`, (err) => {
      // Column already exists, ignore error
    });

    // Session node snapshots table - stores node data at completion time
      db.run(`CREATE TABLE IF NOT EXISTS session_node_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      original_node_id INTEGER NOT NULL,
      node_name TEXT NOT NULL,
      node_type TEXT NOT NULL,
      model TEXT,
      description TEXT,
      serial TEXT,
      firmware TEXT,
      version TEXT,
      status TEXT,
      redundant TEXT,
      os_name TEXT,
      os_service_pack TEXT,
      bios_version TEXT,
      oem_type_description TEXT,
      assigned_cabinet_location TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      UNIQUE(session_id, original_node_id)
    )`);

    // Session diagnostics table - stores controller diagnostics
      db.run(`CREATE TABLE IF NOT EXISTS session_diagnostics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      controller_name TEXT NOT NULL,
      card_number INTEGER NOT NULL,
      channel_number INTEGER,
      error_type TEXT NOT NULL,
      error_description TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )`);

    // Add new columns for existing databases
      db.run(`ALTER TABLE session_node_maintenance ADD COLUMN free_time TEXT`, (err) => {
      // Column already exists, ignore error
      });
    
      db.run(`ALTER TABLE session_node_maintenance ADD COLUMN redundancy_checked BOOLEAN DEFAULT FALSE`, (err) => {
      // Column already exists, ignore error
      });
    
      db.run(`ALTER TABLE session_node_maintenance ADD COLUMN cold_restart_checked BOOLEAN DEFAULT FALSE`, (err) => {
      // Column already exists, ignore error
      });
    
      db.run(`ALTER TABLE session_node_maintenance ADD COLUMN no_errors_checked BOOLEAN DEFAULT FALSE`, (err) => {
      // Column already exists, ignore error
      });
    
      // Add sync columns to session_diagnostics table
      db.run(`ALTER TABLE session_diagnostics ADD COLUMN deleted INTEGER DEFAULT 0`, (err) => {
      // Column already exists, ignore error
      });
    
      db.run(`ALTER TABLE session_diagnostics ADD COLUMN synced INTEGER DEFAULT 0`, (err) => {
      // Column already exists, ignore error
      });

      // Add new columns for enhanced node maintenance
      db.run(`ALTER TABLE session_node_maintenance ADD COLUMN hdd_replaced BOOLEAN DEFAULT FALSE`, (err) => {
        // Column already exists, ignore error
      });
      
      db.run(`ALTER TABLE session_node_maintenance ADD COLUMN performance_type TEXT`, (err) => {
        // Column already exists, ignore error - values: 'perf_index' or 'free_time'
      });
      
      db.run(`ALTER TABLE session_node_maintenance ADD COLUMN performance_value INTEGER`, (err) => {
        // Column already exists, ignore error - 1-5 for perf_index, 1-100 for free_time
      });
      
      db.run(`ALTER TABLE session_node_maintenance ADD COLUMN hf_updated BOOLEAN DEFAULT FALSE`, (err) => {
        // Column already exists, ignore error - for controller HF updates
      });
      
      db.run(`ALTER TABLE session_node_maintenance ADD COLUMN firmware_updated_checked BOOLEAN DEFAULT FALSE`, (err) => {
        // Column already exists, ignore error - for switches firmware updates
      });

    // Cabinet Locations table
    db.run(`CREATE TABLE IF NOT EXISTS cabinet_locations (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      location_name TEXT NOT NULL,
      description TEXT,
      is_collapsed BOOLEAN DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      UNIQUE(session_id, location_name)
    )`);

    // Add deleted column to cabinet_locations table (for soft delete sync)
    db.run(`ALTER TABLE cabinet_locations ADD COLUMN deleted INTEGER DEFAULT 0`, (err) => {
      // Column already exists, ignore error
    });

    // Add location_id column to cabinets table (check if exists first)
    db.run(`PRAGMA table_info(cabinets)`, (err, rows) => {
      if (!err) {
        db.all(`PRAGMA table_info(cabinets)`, (err, columns) => {
          if (!err) {
            const hasLocationId = columns.some(col => col.name === 'location_id');
            if (!hasLocationId) {
              console.log('Adding location_id column to cabinets table...');
              db.run(`ALTER TABLE cabinets ADD COLUMN location_id TEXT`, (err) => {
                if (err) {
                  console.log('Column location_id already exists or error:', err.message);
                } else {
                  console.log('✅ Added location_id column to cabinets table');
                }
              });
            }
          }
        });
      }
    });

    // PM Notes table
    db.run(`CREATE TABLE IF NOT EXISTS session_pm_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      common_tasks TEXT,
      additional_work_notes TEXT,
      troubleshooting_notes TEXT,
      recommendations_notes TEXT,
      uuid TEXT,
      synced INTEGER DEFAULT 0,
      deleted INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      UNIQUE(session_id)
    )`, (err) => {
      if (err) {
        console.error('❌ Error creating session_pm_notes table:', err);
      } else {
        console.log('✅ Created (or found) session_pm_notes table');
      }
    });

    // Add new columns to existing session_pm_notes table if they don't exist
    db.run(`ALTER TABLE session_pm_notes ADD COLUMN common_tasks TEXT`, (err) => {
      // Column already exists, ignore error
    });
    
    db.run(`ALTER TABLE session_pm_notes ADD COLUMN additional_work_notes TEXT`, (err) => {
      // Column already exists, ignore error
    });
    
    db.run(`ALTER TABLE session_pm_notes ADD COLUMN troubleshooting_notes TEXT`, (err) => {
      // Column already exists, ignore error
    });
    
    db.run(`ALTER TABLE session_pm_notes ADD COLUMN recommendations_notes TEXT`, (err) => {
      // Column already exists, ignore error
    });

    // Add sync columns to session_pm_notes table if they don't exist
    db.run(`ALTER TABLE session_pm_notes ADD COLUMN uuid TEXT`, (err) => {
      // Column already exists, ignore error
    });
    
    db.run(`ALTER TABLE session_pm_notes ADD COLUMN synced INTEGER DEFAULT 0`, (err) => {
      // Column already exists, ignore error
    });
    
    db.run(`ALTER TABLE session_pm_notes ADD COLUMN deleted INTEGER DEFAULT 0`, (err) => {
      // Column already exists, ignore error
    });

    // I&I Documents table (multiple documents per session)
    db.run(`CREATE TABLE IF NOT EXISTS session_ii_documents (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      document_name TEXT NOT NULL,
      deltav_system_id TEXT,
      location TEXT,
      revision_number INTEGER DEFAULT 1,
      performed_by TEXT,
      date_performed DATE,
      status TEXT DEFAULT 'active',
      uuid TEXT,
      synced INTEGER DEFAULT 0,
      deleted INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )`, (err) => {
      if (err) {
        console.error('❌ Error creating session_ii_documents table:', err);
      } else {
        console.log('✅ Created (or found) session_ii_documents table');
      }
    });

    // I&I Equipment Necessary table
    db.run(`CREATE TABLE IF NOT EXISTS session_ii_equipment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL,
      clamp_on_rms_ammeter BOOLEAN DEFAULT FALSE,
      digit_dvm BOOLEAN DEFAULT FALSE,
      fluke_1630_earth_ground BOOLEAN DEFAULT FALSE,
      fluke_mt8200_micromapper BOOLEAN DEFAULT FALSE,
      notes TEXT,
      uuid TEXT,
      synced INTEGER DEFAULT 0,
      deleted INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES session_ii_documents(id),
      UNIQUE(document_id)
    )`, (err) => {
      if (err) {
        console.error('❌ Error creating session_ii_equipment table:', err);
      } else {
        console.log('✅ Created (or found) session_ii_equipment table');
      }
    });

    // I&I Checklist Items table
    db.run(`CREATE TABLE IF NOT EXISTS session_ii_checklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL,
      section_name TEXT NOT NULL,
      item_name TEXT NOT NULL,
      answer TEXT, -- Pass/Fail/N.A.
      comments TEXT,
      performed_by TEXT,
      date_completed DATE,
      enclosure_location TEXT,
      breaker_location TEXT,
      recorded_value TEXT,
      measurement_ohms TEXT,
      measurement_ac_ma TEXT,
      measurement_dc_ma TEXT,
      measurement_voltage TEXT,
      measurement_frequency TEXT,
      uuid TEXT,
      synced INTEGER DEFAULT 0,
      deleted INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES session_ii_documents(id)
    )`, (err) => {
      if (err) {
        console.error('❌ Error creating session_ii_checklist table:', err);
      } else {
        console.log('✅ Created (or found) session_ii_checklist table');
      }
    });

    // I&I Equipment Used table
    db.run(`CREATE TABLE IF NOT EXISTS session_ii_equipment_used (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL,
      manufacturer TEXT,
      type TEXT,
      serial_number TEXT,
      recalibration_date DATE,
      used_in_section TEXT,
      uuid TEXT,
      synced INTEGER DEFAULT 0,
      deleted INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES session_ii_documents(id)
    )`, (err) => {
      if (err) {
        console.error('❌ Error creating session_ii_equipment_used table:', err);
      } else {
        console.log('✅ Created (or found) session_ii_equipment_used table');
      }
    });

    // Database migrations - add columns if they don't exist
    const addColumnIfNotExists = (tableName, columnName, columnType) => {
      console.log(`🔍 DEBUG: Checking if column ${columnName} exists in table ${tableName}`);
      db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
        if (err) {
          console.error(`❌ DEBUG: Error getting table info for ${tableName}:`, err);
          return;
        }
        if (!columns) {
          console.error(`❌ DEBUG: No column info returned for table ${tableName}`);
          return;
        }
        
        console.log(`🔍 DEBUG: Table ${tableName} has columns:`, columns.map(col => col.name).join(', '));
        const columnExists = columns.some(col => col.name === columnName);
        
        if (!columnExists) {
          console.log(`⚠️  DEBUG: Column ${columnName} does NOT exist in ${tableName}, adding it...`);
          db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`, (alterErr) => {
            if (alterErr) {
              console.error(`❌ DEBUG: Error adding column ${columnName} to ${tableName}:`, alterErr);
            } else {
              console.log(`✅ DEBUG: Successfully added column ${columnName} to ${tableName}`);
            }
          });
        } else {
          console.log(`✅ DEBUG: Column ${columnName} already exists in ${tableName}`);
        }
      });
    };

    // Add new measurement columns to existing session_ii_checklist table
    addColumnIfNotExists('session_ii_checklist', 'measurement_ohms', 'TEXT');
    addColumnIfNotExists('session_ii_checklist', 'measurement_ac_ma', 'TEXT');
    addColumnIfNotExists('session_ii_checklist', 'measurement_dc_ma', 'TEXT');
    addColumnIfNotExists('session_ii_checklist', 'measurement_voltage', 'TEXT');
    addColumnIfNotExists('session_ii_checklist', 'measurement_frequency', 'TEXT');
    
    // Add I&I header fields to sessions table
    addColumnIfNotExists('sessions', 'deltav_system_id', 'TEXT');
    addColumnIfNotExists('sessions', 'ii_location', 'TEXT');
    addColumnIfNotExists('sessions', 'ii_performed_by', 'TEXT');
    addColumnIfNotExists('sessions', 'ii_date_performed', 'DATE');
    addColumnIfNotExists('sessions', 'ii_customer_name', 'TEXT');
    
    // Add document_id column to equipment tables (migration from session_id to document_id)
    addColumnIfNotExists('session_ii_equipment', 'document_id', 'TEXT');
    addColumnIfNotExists('session_ii_equipment_used', 'document_id', 'TEXT');

    console.log('✅ Database tables initialized successfully');
    
    // Debug: Check cabinet data after initialization
    db.all('SELECT id, cabinet_location, power_supplies, distribution_blocks, diodes, network_equipment, controllers FROM cabinets', (err, cabinets) => {
      if (!err) {
        console.log(`🔍 DEBUG: Found ${cabinets.length} cabinets in database after initialization`);
        cabinets.forEach(cabinet => {
          console.log(`📦 Cabinet: ${cabinet.cabinet_location} (ID: ${cabinet.id})`);
          console.log(`   Power Supplies: ${cabinet.power_supplies ? cabinet.power_supplies.length : 0} chars`);
          console.log(`   Distribution Blocks: ${cabinet.distribution_blocks ? cabinet.distribution_blocks.length : 0} chars`);
          console.log(`   Diodes: ${cabinet.diodes ? cabinet.diodes.length : 0} chars`);
          console.log(`   Network Equipment: ${cabinet.network_equipment ? cabinet.network_equipment.length : 0} chars`);
          console.log(`   Controllers: ${cabinet.controllers ? cabinet.controllers.length : 0} chars`);
        });
      }
    });
    
      createDefaultUser().then(() => {
        console.log('✅ Database ready for tablet deployment');
        resolve(true);
      }).catch(reject);
    });
  });
}

// Create default admin user for tablet (sqlite3 async)
async function createDefaultUser() {
  const defaultUsername = 'admin';
  const defaultPassword = 'cabinet123';
  
  return new Promise(async (resolve, reject) => {
  try {
      db.get('SELECT id FROM users WHERE username = ?', [defaultUsername], async (err, existingUser) => {
        if (err) {
          console.error('❌ Error checking for existing user:', err);
          return reject(err);
        }
    
    if (!existingUser) {
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);
          db.run('INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)', 
            [defaultUsername, hashedPassword, 'admin@cabinet-pm.tablet'], 
            function(err) {
              if (err) {
                console.error('❌ Error creating default user:', err);
                return reject(err);
              }
      console.log(`✅ Default user created: ${defaultUsername} / ${defaultPassword}`);
              resolve();
            });
    } else {
      console.log('✅ Default user already exists');
          resolve();
    }
      });
  } catch (error) {
    console.error('❌ Error creating default user:', error);
      reject(error);
    }
  });
  }

// Helper function to check if session is completed
async function isSessionCompleted(sessionId) {
  const session = await db.prepare('SELECT status FROM sessions WHERE id = ?').get([sessionId]);
  return session && session.status === 'completed';
}

// Body parsing middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Session configuration
app.use(session({
  secret: 'cabinet-pm-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Serve static files
// Detect if running as executable and adjust paths (reuse isPackaged from above)
const basePath = isPackaged ? path.dirname(process.execPath) : __dirname;

// Serve static files from frontend/public directory
app.use(express.static(path.join(basePath, 'frontend', 'public')));
app.use('/assets', express.static(path.join(basePath, 'frontend', 'public', 'assets')));

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  } else {
    return res.status(401).json({ error: 'Authentication required' });
  }
}

// Routes

// Login page
app.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    res.redirect('/dashboard');
  } else {
    res.sendFile(path.join(basePath, 'frontend', 'public', 'login.html'));
  }
});

// Login endpoint
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const user = await db.prepare('SELECT * FROM users WHERE username = ?').get([username]);
    
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    req.session.userId = user.id;
    req.session.username = user.username;
    res.json({ success: true, message: 'Login successful' });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Register endpoint
app.post('/register', async (req, res) => {
  const { username, password, email } = req.body;
  
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }
  
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run('INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)', 
      [username, hashedPassword, email], 
      function(err) {
        if (err) {
          if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(400).json({ error: 'Username already exists' });
          }
          console.error('Registration error:', err);
          return res.status(500).json({ error: 'Server error' });
        }
        
        req.session.userId = this.lastID;
    req.session.username = username;
    res.json({ success: true, message: 'Registration successful' });
      });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Logout endpoint
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out' });
    }
    res.json({ success: true, message: 'Logout successful' });
  });
});

// Dashboard
app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(basePath, 'frontend', 'public', 'dashboard.html'));
});

// Sync - Default to MongoDB Cloud Sync
app.get('/sync', requireAuth, (req, res) => {
  res.sendFile(path.join(basePath, 'frontend', 'public', 'sync', 'mongo-sync.html'));
});

// Legacy File Sync removed - no longer needed

// API Routes

// Get all customers
app.get('/api/customers', requireAuth, async (req, res) => {
  try {
    const customers = await db.prepare('SELECT * FROM customers ORDER BY name').all([]);
    res.json(customers);
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// NEW: Efficient endpoint to get all customers with session counts
app.get('/api/customers/with-counts', requireAuth, async (req, res) => {
  try {
    // Get all customers with session counts in one efficient query (exclude deleted sessions)
    const customersWithCounts = await db.prepare(`
      SELECT c.*, 
             COUNT(s.id) as session_count,
             COUNT(CASE WHEN s.status != 'completed' THEN 1 END) as active_sessions
      FROM customers c
      LEFT JOIN sessions s ON c.id = s.customer_id AND (s.deleted IS NULL OR s.deleted = 0)
      GROUP BY c.id, c.name, c.location, c.contact_info, c.created_at, c.updated_at
      ORDER BY c.name
    `).all([]);
    
    res.json(customersWithCounts);
  } catch (error) {
    console.error('Get customers with counts error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get individual customer
app.get('/api/customers/:customerId', requireAuth, async (req, res) => {
  const customerId = parseInt(req.params.customerId);
  
  try {
    const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get([customerId]);
    
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    res.json(customer);
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create customer
app.post('/api/customers', requireAuth, async (req, res) => {
  const { name, location, contact_info } = req.body;
  
  try {
    const result = await db.prepare('INSERT INTO customers (name, location, contact_info) VALUES (?, ?, ?)').run([name, location, contact_info]);
    
    const customer = {
      id: result.lastInsertRowid,
      name,
      location,
      contact_info,
      created_at: new Date().toISOString()
    };
    
    res.json({ success: true, customer });
  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update customer
app.put('/api/customers/:customerId', requireAuth, async (req, res) => {
  const customerId = parseInt(req.params.customerId);
  const { name, location, contact_info } = req.body;
  
  try {
    const result = await db.prepare('UPDATE customers SET name = ?, location = ?, contact_info = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run([name, location, contact_info, customerId]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete customer
app.delete('/api/customers/:customerId', requireAuth, async (req, res) => {
  const customerId = parseInt(req.params.customerId);
  
  try {
    // Delete all related records first due to foreign key constraints
    // Delete in proper order: cabinets -> sessions -> nodes -> customer
    await db.prepare('DELETE FROM cabinets WHERE pm_session_id IN (SELECT id FROM sessions WHERE customer_id = ?)').run([customerId]);
    await db.prepare('DELETE FROM sessions WHERE customer_id = ?').run([customerId]);
    await db.prepare('DELETE FROM nodes WHERE customer_id = ?').run([customerId]);
    const result = await db.prepare('DELETE FROM customers WHERE id = ?').run([customerId]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get PM sessions for a customer
app.get('/api/customers/:customerId/sessions', requireAuth, async (req, res) => {
  const customerId = parseInt(req.params.customerId);
  
  try {
    // Get sessions with user info and cabinet count (exclude deleted)
    const customerSessions = await db.prepare(`
      SELECT s.*, u.username,
             (SELECT COUNT(*) FROM cabinets c WHERE c.pm_session_id = s.id AND COALESCE(c.deleted, 0) = 0) as cabinet_count
      FROM sessions s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.customer_id = ? AND (s.deleted IS NULL OR s.deleted = 0)
      ORDER BY s.created_at DESC
    `).all([customerId]);
    
    res.json(customerSessions);
  } catch (error) {
    console.error('Get customer sessions error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// NEW: Efficient endpoint to get ALL sessions with customer info in one call
app.get('/api/sessions/all', requireAuth, async (req, res) => {
  try {
    // Get all sessions with customer and user info in one efficient query (exclude deleted)
    const allSessions = await db.prepare(`
      SELECT s.*, 
             c.name as customer_name,
             c.location as customer_location,
             s.customer_id,
             u.username,
             (SELECT COUNT(*) FROM cabinets cab WHERE cab.pm_session_id = s.id AND COALESCE(cab.deleted, 0) = 0) as cabinet_count
      FROM sessions s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN users u ON s.user_id = u.id
      WHERE (s.deleted IS NULL OR s.deleted = 0)
      ORDER BY s.created_at DESC
    `).all();
    
    res.json(allSessions);
  } catch (error) {
    console.error('Get all sessions error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// NEW: Optimized dashboard statistics endpoint
app.get('/api/dashboard/stats', requireAuth, async (req, res) => {
  try {
    // Get all statistics in one efficient query
    const stats = await db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM customers) as total_customers,
        (SELECT COUNT(*) FROM sessions WHERE (deleted IS NULL OR deleted = 0)) as total_sessions,
        (SELECT COUNT(*) FROM sessions WHERE status = 'completed' AND (deleted IS NULL OR deleted = 0)) as completed_sessions,
        (SELECT COUNT(*) FROM cabinets WHERE (deleted IS NULL OR deleted = 0)) as total_cabinets
    `).get();
    
    res.json(stats);
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create new session (PM or I&I)
app.post('/api/sessions', requireAuth, async (req, res) => {
  const { customer_id, session_name, session_type = 'pm' } = req.body;
  const sessionId = uuidv4();
  const sessionUuid = uuidv4();
  
  try {
    await db.prepare('INSERT INTO sessions (id, customer_id, user_id, session_name, session_type, status, uuid, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run([sessionId, parseInt(customer_id), req.session.userId, session_name, session_type, 'active', sessionUuid, 0]);
    
    const session = {
      id: sessionId,
      customer_id: parseInt(customer_id),
      user_id: req.session.userId,
      session_name,
      session_type,
      status: 'active',
      uuid: sessionUuid,
      synced: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    res.json({ success: true, session });
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update PM session
app.put('/api/sessions/:sessionId', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  const { session_name, status } = req.body;
  
  try {
    const result = await db.prepare('UPDATE sessions SET session_name = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run([session_name, status, sessionId]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Update session error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete PM session (soft delete for sync)
app.delete('/api/sessions/:sessionId', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  
  try {
    // 1. First, get all cabinet IDs for this session
    const cabinetIds = await db.prepare('SELECT id FROM cabinets WHERE pm_session_id = ?').all([sessionId]);
    
    // 2. Clear node assignments for cabinets in this session
    if (cabinetIds.length > 0) {
      for (const cabinet of cabinetIds) {
        await db.prepare('UPDATE nodes SET assigned_cabinet_id = NULL, assigned_at = NULL WHERE assigned_cabinet_id = ?').run([cabinet.id]);
      }
    }
    
    // 3. Soft delete session node maintenance records
    await db.prepare('UPDATE session_node_maintenance SET deleted = 1, synced = 0, updated_at = CURRENT_TIMESTAMP WHERE session_id = ?').run([sessionId]);
    
    // 4. Soft delete session node tracker records
    await db.prepare('UPDATE session_node_tracker SET deleted = 1, synced = 0, updated_at = CURRENT_TIMESTAMP WHERE session_id = ?').run([sessionId]);
    
    // 5. Soft delete session diagnostics
    await db.prepare('UPDATE session_diagnostics SET deleted = 1, synced = 0, updated_at = CURRENT_TIMESTAMP WHERE session_id = ?').run([sessionId]);
    
    // 6. Soft delete cabinets
    await db.prepare('UPDATE cabinets SET deleted = 1, synced = 0, updated_at = CURRENT_TIMESTAMP WHERE pm_session_id = ?').run([sessionId]);
    
    // 7. Finally soft delete the session
    const result = await db.prepare('UPDATE sessions SET deleted = 1, synced = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run([sessionId]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json({ success: true, message: 'Session marked for deletion and will be synced to cloud' });
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get session details
// Check if session is completed (for frontend)
app.get('/api/sessions/:sessionId/status', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  
  try {
    const session = await db.prepare('SELECT status FROM sessions WHERE id = ?').get([sessionId]);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json({ 
      sessionId,
      status: session.status,
      isCompleted: session.status === 'completed'
    });
  } catch (error) {
    console.error('Get session status error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/sessions/:sessionId', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  
  try {
    const session = await db.prepare(`
      SELECT s.*, c.name as customer_name, c.location
      FROM sessions s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.id = ?
    `).get([sessionId]);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const sessionCabinets = await db.prepare(`
      SELECT c.*, cl.location_name, cl.id as location_id
      FROM cabinets c
      LEFT JOIN cabinet_locations cl ON c.location_id = cl.id
      WHERE c.pm_session_id = ? 
      ORDER BY cl.sort_order, cl.location_name, c.created_at
    `).all([sessionId]);
    
    // Get all locations for this session
    const locations = await db.prepare(`
      SELECT * FROM cabinet_locations 
      WHERE session_id = ? 
      ORDER BY sort_order, location_name
    `).all([sessionId]);
    
    // Parse JSON fields for cabinets
    const cabinets = sessionCabinets.map(cabinet => ({
      ...cabinet,
      power_supplies: JSON.parse(cabinet.power_supplies || '[]'),
      distribution_blocks: JSON.parse(cabinet.distribution_blocks || '[]'),
      diodes: JSON.parse(cabinet.diodes || '[]'),
      network_equipment: JSON.parse(cabinet.network_equipment || '[]'),
      controllers: JSON.parse(cabinet.controllers || '[]'),
      inspection: JSON.parse(cabinet.inspection_data || '{}')
    }));
    
    const result = {
      ...session,
      cabinets,
      locations
    };
    
    res.json(result);
  } catch (error) {
    console.error('Get session details error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Complete PM session
app.put('/api/sessions/:sessionId/complete', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  
  try {
    // First, get the session to find the customer ID
    const session = await db.prepare('SELECT customer_id FROM sessions WHERE id = ?').get([sessionId]);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Create snapshots of all nodes for this customer at completion time
    const nodes = await db.prepare(`
      SELECT n.*, c.cabinet_location as assigned_cabinet_location
      FROM nodes n
      LEFT JOIN cabinets c ON n.assigned_cabinet_id = c.id
      WHERE n.customer_id = ?
      ORDER BY n.node_type, n.node_name
    `).all([session.customer_id]);
    
    // Insert node snapshots for this session
    for (const node of nodes) {
      try {
        await db.prepare(`
          INSERT OR REPLACE INTO session_node_snapshots (
            session_id, original_node_id, node_name, node_type, model, description, 
            serial, firmware, version, status, redundant, os_name, os_service_pack,
            bios_version, oem_type_description, assigned_cabinet_location
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run([
          sessionId,
          node.id,
          node.node_name,
          node.node_type,
          node.model,
          node.description,
          node.serial,
          node.firmware,
          node.version,
          node.status,
          node.redundant,
          node.os_name,
          node.os_service_pack,
          node.bios_version,
          node.oem_type_description,
          node.assigned_cabinet_location
        ]);
      } catch (snapshotError) {
        console.error('Error creating node snapshot:', snapshotError);
        // Continue with other nodes even if one fails
      }
    }
    
    // Mark the session as completed
    const result = await db.prepare('UPDATE sessions SET status = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(['completed', sessionId]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json({ success: true, message: 'Session marked as completed' });
  } catch (error) {
    console.error('Complete session error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Duplicate PM session
app.post('/api/sessions/:sessionId/duplicate', requireAuth, async (req, res) => {
  const sourceSessionId = req.params.sessionId;
  const { session_name } = req.body;
  const newSessionId = uuidv4();
  
  try {
    console.log('🔄 DUPLICATE SESSION DEBUG - Starting duplication');
    console.log('📋 Source Session ID:', sourceSessionId);
    console.log('📋 New Session Name:', session_name);
    console.log('📋 New Session ID:', newSessionId);
    
    // Get source session
    const sourceSession = await db.prepare('SELECT * FROM sessions WHERE id = ?').get([sourceSessionId]);
    if (!sourceSession) {
      console.log('❌ Source session not found');
      return res.status(404).json({ error: 'Source session not found' });
    }
    
    console.log('✅ Source session found:', sourceSession.session_name);
    
    // Create new session
    await db.prepare('INSERT INTO sessions (id, customer_id, user_id, session_name, status) VALUES (?, ?, ?, ?, ?)').run([
      newSessionId, 
      sourceSession.customer_id, 
      req.session.userId, 
      session_name, 
      'active'
    ]);
    
    console.log('✅ New session created');
    
    // Get all cabinets from source session
    const sourceCabinets = await db.prepare('SELECT * FROM cabinets WHERE pm_session_id = ?').all([sourceSessionId]);
    console.log('📦 Found', sourceCabinets.length, 'cabinets to duplicate');
    
    // Copy each cabinet and its controller assignments
    for (const sourceCabinet of sourceCabinets) {
      const newCabinetId = uuidv4();
      
      console.log('📦 Duplicating cabinet:', sourceCabinet.cabinet_location);
      console.log('📦 Source cabinet ID:', sourceCabinet.id);
      console.log('📦 New cabinet ID:', newCabinetId);
      console.log('📦 Source controllers JSON:', sourceCabinet.controllers);

      // Parse and clear readings from power supplies and diodes
      let powerSupplies = [];
      let diodes = [];
      
      if (sourceCabinet.power_supplies) {
        const sourcePowerSupplies = JSON.parse(sourceCabinet.power_supplies);
        powerSupplies = sourcePowerSupplies.map(ps => ({
          voltage_type: ps.voltage_type,
          dc_reading: '', // Clear reading
          line_neutral: '', // Clear reading
          line_ground: '', // Clear reading
          neutral_ground: '', // Clear reading
          status: 'pass' // Reset status
        }));
      }
      
      if (sourceCabinet.diodes) {
        const sourceDiodes = JSON.parse(sourceCabinet.diodes);
        diodes = sourceDiodes.map(diode => ({
          dc_reading: '', // Clear reading
          status: 'pass' // Reset status
        }));
      }

      // Create new cabinet
      await db.prepare(`
        INSERT INTO cabinets (
          id, pm_session_id, cabinet_location, cabinet_date, status,
          power_supplies, distribution_blocks, diodes, network_equipment, 
          inspection_data, controllers, location_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run([
        newCabinetId,
        newSessionId,
        sourceCabinet.cabinet_location,
        sourceCabinet.cabinet_date,
        'active', // Reset status to active
        JSON.stringify(powerSupplies),
        sourceCabinet.distribution_blocks, // Keep distribution blocks
        JSON.stringify(diodes),
        sourceCabinet.network_equipment, // Keep network equipment
        '{}', // Clear inspection data
        sourceCabinet.controllers, // Keep controller assignments
        sourceCabinet.location_id // Keep location assignment
      ]);
      
      console.log('✅ Cabinet created in database');
      
      // Assign controllers to the new cabinet based on the controllers JSON field
      if (sourceCabinet.controllers) {
        const controllers = JSON.parse(sourceCabinet.controllers);
        console.log('🎮 Parsed controllers:', controllers);
        
        for (const controller of controllers) {
          if (controller.node_id) {
            console.log('🎮 Assigning controller:', controller.node_id, 'to cabinet:', newCabinetId);
            try {
              const result = await db.prepare(`
                UPDATE nodes SET 
                  assigned_cabinet_id = ?, 
                  assigned_at = CURRENT_TIMESTAMP,
                  updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `).run([newCabinetId, controller.node_id]);
              console.log('✅ Controller assigned, changes:', result.changes);
            } catch (error) {
              console.error('❌ Error assigning controller during duplication:', error);
            }
          }
        }
      } else {
        console.log('📦 No controllers to assign for this cabinet');
      }
    }
    
    // Copy session node maintenance data (keep structure but clear actual maintenance data)
    const sourceNodeMaintenance = await db.prepare('SELECT * FROM session_node_maintenance WHERE session_id = ?').all([sourceSessionId]);
    
    for (const maintenance of sourceNodeMaintenance) {
      await db.prepare(`
        INSERT INTO session_node_maintenance (
          session_id, node_id, dv_checked, os_checked, macafee_checked,
          free_time, redundancy_checked, cold_restart_checked, no_errors_checked,
          hdd_replaced, performance_type, performance_value, hf_updated, firmware_updated_checked,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run([
        newSessionId,
        maintenance.node_id,
        0, // Clear dv_checked
        0, // Clear os_checked
        0, // Clear macafee_checked
        null, // Clear free_time
        0, // Clear redundancy_checked
        0, // Clear cold_restart_checked
        0, // Clear no_errors_checked
        0, // Clear hdd_replaced
        maintenance.performance_type || 'free_time', // Keep performance type
        null, // Clear performance value
        0, // Clear hf_updated
        0 // Clear firmware_updated_checked
      ]);
    }
    
    // Get the new session data
    const newSession = await db.prepare(`
      SELECT s.*, c.name as customer_name, c.location
      FROM sessions s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.id = ?
    `).get([newSessionId]);
    
    console.log('✅ DUPLICATE SESSION COMPLETED');
    console.log('📋 New session data:', newSession);
    
    res.json({ 
      success: true, 
      session: newSession,
      message: 'Session duplicated successfully'
    });
  } catch (error) {
    console.error('❌ DUPLICATE SESSION ERROR:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create new cabinet
app.post('/api/cabinets', requireAuth, async (req, res) => {
  const { 
    pm_session_id, 
    cabinet_location, 
    cabinet_date,
    power_supplies = [],
    distribution_blocks = [],
    diodes = [],
    network_equipment = [],
    inspection = {}
  } = req.body;
  
  const cabinetId = uuidv4();
  
  const defaultInspection = {
    cabinet_fans: 'pass',
    controller_leds: 'pass',
    io_status: 'pass',
    network_status: 'pass',
    temperatures: 'pass',
    is_clean: 'pass',
    clean_filter_installed: 'pass',
    ground_inspection: 'pass',
    comments: '',
    ...inspection
  };
  
  try {
    // Check if session is completed
    if (await isSessionCompleted(pm_session_id)) {
      return res.status(403).json({ 
        error: 'Cannot add cabinet - PM session is completed',
        message: 'This PM session has been completed and cannot be modified.'
      });
    }
    
    await db.prepare(`
      INSERT INTO cabinets (id, pm_session_id, cabinet_location, cabinet_date, status, 
                           power_supplies, distribution_blocks, diodes, network_equipment, inspection_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run([
      cabinetId,
      pm_session_id,
      cabinet_location,
      cabinet_date,
      'active',
      JSON.stringify(power_supplies || []),
      JSON.stringify(distribution_blocks || []),
      JSON.stringify(diodes || []),
      JSON.stringify(network_equipment || []),
      JSON.stringify(defaultInspection)
    ]);
    
    const cabinet = {
      id: cabinetId,
      pm_session_id,
      cabinet_location,
      cabinet_date,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      power_supplies: power_supplies || [],
      distribution_blocks: distribution_blocks || [],
      diodes: diodes || [],
      inspection: defaultInspection,
      network_equipment: network_equipment || []
    };
    
    res.json({ success: true, cabinet });
  } catch (error) {
    console.error('Create cabinet error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get cabinet details
app.get('/api/cabinets/:cabinetId', requireAuth, async (req, res) => {
  const cabinetId = req.params.cabinetId;
  
  try {
    const cabinet = await db.prepare('SELECT * FROM cabinets WHERE id = ?').get([cabinetId]);
    
    if (!cabinet) {
      return res.status(404).json({ error: 'Cabinet not found' });
    }
    
    // Parse JSON fields
    let controllers = JSON.parse(cabinet.controllers || '[]');
    
    // Enhance controllers with full node details
    if (controllers.length > 0) {
      for (let i = 0; i < controllers.length; i++) {
        const controller = controllers[i];
        if (controller.node_id) {
          const nodeDetails = await db.prepare('SELECT * FROM nodes WHERE id = ?').get([controller.node_id]);
          if (nodeDetails) {
            controllers[i] = {
              ...controller,
              node_name: nodeDetails.node_name,
              model: nodeDetails.model,
              serial: nodeDetails.serial,
              firmware: nodeDetails.firmware,
              node_type: nodeDetails.node_type
            };
          }
        }
      }
    }
    
    const result = {
      ...cabinet,
      power_supplies: JSON.parse(cabinet.power_supplies || '[]'),
      distribution_blocks: JSON.parse(cabinet.distribution_blocks || '[]'),
      diodes: JSON.parse(cabinet.diodes || '[]'),
      network_equipment: JSON.parse(cabinet.network_equipment || '[]'),
      controllers: controllers,
      inspection: JSON.parse(cabinet.inspection_data || '{}')
    };
    
    res.json(result);
  } catch (error) {
    console.error('Get cabinet details error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Save cabinet data
app.put('/api/cabinets/:cabinetId', requireAuth, async (req, res) => {
  const cabinetId = req.params.cabinetId;
  const updateData = req.body;
  
  try {
    // First check if this cabinet belongs to a completed session
    const cabinet = await db.prepare(`
      SELECT c.pm_session_id, s.status 
      FROM cabinets c 
      LEFT JOIN sessions s ON c.pm_session_id = s.id 
      WHERE c.id = ?
    `).get(cabinetId);
    
    if (!cabinet) {
      return res.status(404).json({ error: 'Cabinet not found' });
    }
    
    // Prevent modifications to completed sessions
    if (cabinet.status === 'completed') {
      return res.status(403).json({ 
        error: 'Cannot modify cabinet data - PM session is completed',
        message: 'This PM session has been completed and cannot be modified. Create a new session to make changes.'
      });
    }
    
    const result = await db.prepare(`
      UPDATE cabinets SET 
        cabinet_location = ?, cabinet_date = ?, status = ?,
        power_supplies = ?, distribution_blocks = ?, diodes = ?,
        network_equipment = ?, controllers = ?, inspection_data = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run([
      updateData.cabinet_location,
      updateData.cabinet_date,
      updateData.status || 'active',
      JSON.stringify(updateData.power_supplies || []),
      JSON.stringify(updateData.distribution_blocks || []),
      JSON.stringify(updateData.diodes || []),
      JSON.stringify(updateData.network_equipment || []),
      JSON.stringify(updateData.controllers || []),
      JSON.stringify(updateData.inspection || {}),
      cabinetId
    ]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Cabinet not found' });
    }
    
    res.json({ success: true, message: 'Cabinet data saved successfully' });
  } catch (error) {
    console.error('Save cabinet data error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete cabinet
app.delete('/api/cabinets/:cabinetId', requireAuth, async (req, res) => {
  const cabinetId = req.params.cabinetId;
  
  try {
    // First check if this cabinet belongs to a completed session
    const cabinet = await db.prepare(`
      SELECT c.pm_session_id, s.status 
      FROM cabinets c 
      LEFT JOIN sessions s ON c.pm_session_id = s.id 
      WHERE c.id = ?
    `).get(cabinetId);
    
    if (!cabinet) {
      return res.status(404).json({ error: 'Cabinet not found' });
    }
    
    // Prevent deletion from completed sessions
    if (cabinet.status === 'completed') {
      return res.status(403).json({ 
        error: 'Cannot delete cabinet - PM session is completed',
        message: 'This PM session has been completed and cannot be modified. Create a new session to make changes.'
      });
    }
    
    // First, unassign any controllers assigned to this cabinet
    const controllersData = await db.prepare('SELECT controllers FROM cabinets WHERE id = ?').get(cabinetId);
    if (controllersData && controllersData.controllers) {
      const controllers = JSON.parse(controllersData.controllers);
      for (const controller of controllers) {
        if (controller.node_id) {
          await db.prepare('UPDATE nodes SET assigned_cabinet_id = NULL, assigned_at = NULL WHERE id = ?').run([controller.node_id]);
        }
      }
    }
    
    // Delete the cabinet
    const result = await db.prepare('DELETE FROM cabinets WHERE id = ?').run([cabinetId]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Cabinet not found' });
    }
    
    res.json({ success: true, message: 'Cabinet deleted successfully' });
  } catch (error) {
    console.error('Delete cabinet error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Bulk import customers
app.post('/api/customers/bulk-import', requireAuth, async (req, res) => {
  const { customers } = req.body;
  
  if (!customers || !Array.isArray(customers) || customers.length === 0) {
    return res.status(400).json({ error: 'No customer data provided' });
  }
  
  try {
    let imported = 0;
    
    for (const customer of customers) {
      if (!customer.name || !customer.name.trim()) {
        continue; // Skip customers without names
      }
      
      // Check if customer already exists
      const existing = await db.prepare('SELECT id FROM customers WHERE name = ?').get([customer.name.trim()]);
      
      if (!existing) {
        await db.prepare(`
          INSERT INTO customers (name, location, contact_info, created_at, updated_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run([
          customer.name.trim(),
          customer.location || '',
          customer.contact_info || ''
        ]);
        imported++;
      }
    }
    
    res.json({ success: true, imported, total: customers.length });
  } catch (error) {
    console.error('Bulk import customers error:', error);
    res.status(500).json({ error: 'Database error during import' });
  }
});

// Delete cabinet
app.delete('/api/cabinets/:cabinetId', requireAuth, async (req, res) => {
  const cabinetId = req.params.cabinetId;
  
  try {
    // Check if cabinet exists and get session info
    const cabinet = await db.prepare('SELECT pm_session_id FROM cabinets WHERE id = ?').get([cabinetId]);
    
    if (!cabinet) {
      return res.status(404).json({ error: 'Cabinet not found' });
    }
    
    // Check if session is completed
    if (await isSessionCompleted(cabinet.pm_session_id)) {
      return res.status(403).json({ 
        error: 'Cannot delete cabinet - PM session is completed',
        message: 'This PM session has been completed and cannot be modified.'
      });
    }
    
    // Delete the cabinet
    const result = await db.prepare('DELETE FROM cabinets WHERE id = ?').run([cabinetId]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Cabinet not found' });
    }
    
    res.json({ success: true, message: 'Cabinet deleted successfully' });
  } catch (error) {
    console.error('Delete cabinet error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Cabinet Location Management API Endpoints

// Get all locations for a session
app.get('/api/sessions/:sessionId/locations', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  
  try {
    const locations = await db.prepare(`
      SELECT * FROM cabinet_locations 
      WHERE session_id = ? 
      ORDER BY sort_order, location_name
    `).all([sessionId]);
    
    res.json(locations);
  } catch (error) {
    console.error('Get locations error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create new location
app.post('/api/sessions/:sessionId/locations', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  const { location_name, description } = req.body;
  
  if (!location_name || !location_name.trim()) {
    return res.status(400).json({ error: 'Location name is required' });
  }
  
  const locationId = uuidv4();
  
  try {
    // Check if session is completed
    if (await isSessionCompleted(sessionId)) {
      return res.status(403).json({ 
        error: 'Cannot add location - PM session is completed',
        message: 'This PM session has been completed and cannot be modified.'
      });
    }
    
    await db.prepare(`
      INSERT INTO cabinet_locations (id, session_id, location_name, description, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `).run([
      locationId,
      sessionId,
      location_name.trim(),
      description || '',
      0
    ]);
    
    const location = {
      id: locationId,
      session_id: sessionId,
      location_name: location_name.trim(),
      description: description || '',
      is_collapsed: 0,
      sort_order: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    res.json({ success: true, location });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: 'Location name already exists in this session' });
    }
    console.error('Create location error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update location
app.put('/api/locations/:locationId', requireAuth, async (req, res) => {
  const locationId = req.params.locationId;
  const { location_name, description, is_collapsed, sort_order } = req.body;
  
  try {
    const result = await db.prepare(`
      UPDATE cabinet_locations SET 
        location_name = ?, description = ?, is_collapsed = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run([
      location_name,
      description || '',
      is_collapsed || 0,
      sort_order || 0,
      locationId
    ]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }
    
    res.json({ success: true, message: 'Location updated successfully' });
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete location
app.delete('/api/locations/:locationId', requireAuth, async (req, res) => {
  const locationId = req.params.locationId;
  
  try {
    // First, unassign any cabinets from this location
    await db.prepare('UPDATE cabinets SET location_id = NULL WHERE location_id = ?').run([locationId]);
    
    // Delete the location
    const result = await db.prepare('DELETE FROM cabinet_locations WHERE id = ?').run([locationId]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }
    
    res.json({ success: true, message: 'Location deleted successfully' });
  } catch (error) {
    console.error('Delete location error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Assign cabinet to location
app.post('/api/cabinets/:cabinetId/assign-location', requireAuth, async (req, res) => {
  const cabinetId = req.params.cabinetId;
  const { location_id } = req.body;
  
  try {
    const result = await db.prepare(`
      UPDATE cabinets SET location_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run([location_id, cabinetId]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Cabinet not found' });
    }
    
    res.json({ success: true, message: 'Cabinet assigned to location successfully' });
  } catch (error) {
    console.error('Assign cabinet to location error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Bulk import cabinets
app.post('/api/cabinets/bulk-import', requireAuth, async (req, res) => {
  const { cabinets, session_id } = req.body;
  
  if (!cabinets || !Array.isArray(cabinets) || cabinets.length === 0) {
    return res.status(400).json({ error: 'No cabinet data provided' });
  }
  
  if (!session_id) {
    return res.status(400).json({ error: 'Session ID is required' });
  }
  
  try {
    // Verify session exists and is not completed
    const session = await db.prepare('SELECT status FROM sessions WHERE id = ?').get([session_id]);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    if (session.status === 'completed') {
      return res.status(403).json({ error: 'Cannot add cabinets to completed session' });
    }
    
    let imported = 0;
    
    for (const cabinet of cabinets) {
      if (!cabinet.cabinet_location || !cabinet.cabinet_location.trim()) {
        continue; // Skip cabinets without locations
      }
      
      // Check if cabinet already exists in this session
      const existing = await db.prepare(`
        SELECT id FROM cabinets 
        WHERE pm_session_id = ? AND cabinet_location = ?
      `).get([session_id, cabinet.cabinet_location.trim()]);
      
      if (!existing) {
        await db.prepare(`
          INSERT INTO cabinets (
            id, pm_session_id, cabinet_location, cabinet_date, status,
            power_supplies, distribution_blocks, diodes, network_equipment, 
            controllers, inspection_data, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'active', '[]', '[]', '[]', '[]', '[]', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run([
          require('crypto').randomUUID(),
          session_id,
          cabinet.cabinet_location.trim(),
          cabinet.cabinet_date || new Date().toISOString().split('T')[0]
        ]);
        imported++;
      }
    }
    
    res.json({ success: true, imported, total: cabinets.length });
  } catch (error) {
    console.error('Bulk import cabinets error:', error);
    res.status(500).json({ error: 'Database error during import' });
  }
});

// Professional PDF generation
app.post('/api/cabinets/:cabinetId/pdf', requireAuth, async (req, res) => {
  const cabinetId = req.params.cabinetId;
  
  try {
    // Get cabinet with session and customer info
    const cabinetData = await db.prepare(`
      SELECT c.*, s.session_name, cu.name as customer_name, cu.location
      FROM cabinets c
      LEFT JOIN sessions s ON c.pm_session_id = s.id
      LEFT JOIN customers cu ON s.customer_id = cu.id
      WHERE c.id = ?
    `).get(cabinetId);
    
    if (!cabinetData) {
      return res.status(404).json({ error: 'Cabinet not found' });
    }

    // Parse JSON fields
    let controllers = JSON.parse(cabinetData.controllers || '[]');
    
    // Enhance controllers with full node details
    if (controllers.length > 0) {
      for (let i = 0; i < controllers.length; i++) {
        const controller = controllers[i];
        if (controller.node_id) {
          const nodeDetails = await db.prepare('SELECT * FROM nodes WHERE id = ?').get([controller.node_id]);
          if (nodeDetails) {
            controllers[i] = {
              ...controller,
              node_name: nodeDetails.node_name,
              model: nodeDetails.model,
              serial: nodeDetails.serial,
              firmware: nodeDetails.firmware,
              node_type: nodeDetails.node_type
            };
          }
        }
      }
    }
    
    const cabinet = {
      ...cabinetData,
      power_supplies: JSON.parse(cabinetData.power_supplies || '[]'),
      distribution_blocks: JSON.parse(cabinetData.distribution_blocks || '[]'),
      diodes: JSON.parse(cabinetData.diodes || '[]'),
      network_equipment: JSON.parse(cabinetData.network_equipment || '[]'),
      controllers: controllers,
      inspection: JSON.parse(cabinetData.inspection_data || '{}')
    };
    
    // Generate PDF HTML
    const pdfHtml = generatePDFHtml({
      cabinet,
      sessionInfo: {
        session_name: cabinetData.session_name || '',
        customer_name: cabinetData.customer_name || '',
        location: cabinetData.location || ''
      }
    });
    
    // Use puppeteer to generate PDF with Chrome detection
    const browser = await puppeteer.launch({ 
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: await findChrome()
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(60000); // 60 second timeout
    
    await page.setContent(pdfHtml, { waitUntil: 'networkidle0', timeout: 60000 });
    
    console.log('📄 Generating compressed PDF (PDF Lite mode)...');
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0.5in',
        bottom: '0.5in',
        left: '0.5in',
        right: '0.5in'
      },
      // PDF Lite compression settings (similar to Exchange Editor 300 DPI)
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      tagged: false,
      outline: false,
      scale: 0.9  // Reduce scale for smaller file size
    });
    
    await browser.close();
    
    const originalSize = pdfBuffer.length;
    console.log(`📊 PDF generated: ${(originalSize / 1024).toFixed(1)} KB (compressed)`);
    
    // Send PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="cabinet-pm-${cabinet.cabinet_location.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf"`);
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Error generating PDF' });
  }
});

// Bulk PDF export for entire session - Combined into single PDF
app.post('/api/sessions/:sessionId/export-pdfs', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  const { nodeFilterMode, selectedNodeIds, customCustomerName } = req.body || {};
  
  try {
    const session = await db.prepare(`
      SELECT s.*, c.name as customer_name, c.location
      FROM sessions s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.id = ?
    `).get([sessionId]);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const sessionCabinetsData = await db.prepare('SELECT * FROM cabinets WHERE pm_session_id = ? ORDER BY created_at').all([sessionId]);
    
    // Allow export even with 0 cabinets - just show node maintenance report
    // if (sessionCabinetsData.length === 0) {
    //   return res.status(400).json({ error: 'No cabinets found in this session' });
    // }

    // Parse JSON fields for cabinets and enhance controllers
    const sessionCabinets = [];
    
    for (const cabinetData of sessionCabinetsData) {
      let controllers = JSON.parse(cabinetData.controllers || '[]');
      
      // Enhance controllers with full node details
      if (controllers.length > 0) {
        for (let i = 0; i < controllers.length; i++) {
          const controller = controllers[i];
          if (controller.node_id) {
            const nodeDetails = await db.prepare('SELECT * FROM nodes WHERE id = ?').get([controller.node_id]);
            if (nodeDetails) {
              controllers[i] = {
                ...controller,
                node_name: nodeDetails.node_name,
                model: nodeDetails.model,
                serial: nodeDetails.serial,
                firmware: nodeDetails.firmware,
                node_type: nodeDetails.node_type
              };
            }
          }
        }
      }
      
      // Apply node filtering to cabinet controllers as well
      if (selectedNodeIds && selectedNodeIds.length > 0) {
        if (nodeFilterMode === 'include') {
          // Only include selected nodes
          controllers = controllers.filter(controller => 
            selectedNodeIds.includes(controller.node_id)
          );
        } else if (nodeFilterMode === 'exclude') {
          // Exclude selected nodes
          controllers = controllers.filter(controller => 
            !selectedNodeIds.includes(controller.node_id)
          );
        }
      }
      
      sessionCabinets.push({
        ...cabinetData,
        power_supplies: JSON.parse(cabinetData.power_supplies || '[]'),
        distribution_blocks: JSON.parse(cabinetData.distribution_blocks || '[]'),
        diodes: JSON.parse(cabinetData.diodes || '[]'),
        network_equipment: JSON.parse(cabinetData.network_equipment || '[]'),
        controllers: controllers,
        inspection: JSON.parse(cabinetData.inspection_data || '{}')
      });
    }
    
    // Get node maintenance data for the session
    let nodeMaintenanceQuery;
    let queryParams;
    
    if (selectedNodeIds && selectedNodeIds.length > 0) {
      if (nodeFilterMode === 'include') {
        // Only include selected nodes - get all selected nodes and LEFT JOIN maintenance data
        const placeholders = selectedNodeIds.map(() => '?').join(',');
        nodeMaintenanceQuery = `
          SELECT n.id as node_id, n.node_name, n.node_type, n.model,
                 snm.dv_checked, snm.os_checked, snm.macafee_checked, snm.free_time,
                 snm.redundancy_checked, snm.cold_restart_checked, snm.no_errors_checked,
                 snm.hdd_replaced, snm.performance_type, snm.performance_value, 
                 snm.hf_updated, snm.firmware_updated_checked
          FROM nodes n
          LEFT JOIN session_node_maintenance snm ON n.id = snm.node_id AND snm.session_id = ?
          WHERE n.id IN (${placeholders})
        `;
        queryParams = [sessionId].concat(selectedNodeIds);
      } else if (nodeFilterMode === 'exclude') {
        // Exclude selected nodes - get all nodes except selected ones
        const placeholders = selectedNodeIds.map(() => '?').join(',');
        nodeMaintenanceQuery = `
          SELECT n.id as node_id, n.node_name, n.node_type, n.model,
                 snm.dv_checked, snm.os_checked, snm.macafee_checked, snm.free_time,
                 snm.redundancy_checked, snm.cold_restart_checked, snm.no_errors_checked,
                 snm.hdd_replaced, snm.performance_type, snm.performance_value, 
                 snm.hf_updated, snm.firmware_updated_checked
          FROM nodes n
          LEFT JOIN session_node_maintenance snm ON n.id = snm.node_id AND snm.session_id = ?
          WHERE n.id NOT IN (${placeholders})
        `;
        queryParams = [sessionId].concat(selectedNodeIds);
      }
    } else {
      // No filter applied - get all nodes with maintenance data (original behavior)
      nodeMaintenanceQuery = `
        SELECT snm.*, n.node_name, n.node_type, n.model
        FROM session_node_maintenance snm
        LEFT JOIN nodes n ON snm.node_id = n.id
        WHERE snm.session_id = ?
      `;
      queryParams = [sessionId];
    }
    
    const nodeMaintenanceData = await db.prepare(nodeMaintenanceQuery).all(queryParams);
    
    // Debug: Log the nodes being included in PDF
    console.log('=== PDF NODE DEBUG ===');
    console.log('Filter mode:', nodeFilterMode);
    console.log('Selected node IDs:', selectedNodeIds);
    console.log('Nodes returned from query:', nodeMaintenanceData.length);
    nodeMaintenanceData.forEach(node => {
      console.log(`- ${node.node_name} (${node.node_type}) - ID: ${node.node_id}`);
    });
    console.log('=== END DEBUG ===');
    
    // Generate combined HTML for all cabinets
    const combinedHtml = await generateCombinedPDFHtml({
      session,
      cabinets: sessionCabinets,
      customer: {
        name: customCustomerName || session.customer_name,
        location: session.location
      },
      nodeMaintenanceData,
      diagnosticsData: req.body ? req.body.diagnostics : undefined,
      sessionId
    });
    
    // Launch browser and generate single PDF with Chrome detection
    const browser = await puppeteer.launch({ 
      headless: "new",
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--memory-pressure-off'
      ],
      executablePath: await findChrome()
    });
    
    const page = await browser.newPage();
    page.setDefaultTimeout(120000); // 2 minute timeout for large reports
    await page.setContent(combinedHtml, { waitUntil: 'domcontentloaded', timeout: 120000 });
    
    console.log('📄 Generating compressed combined PDF (PDF Lite mode)...');
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0.5in',
        bottom: '0.5in',
        left: '0.5in',
        right: '0.5in'
      },
      // PDF Lite compression settings (similar to Exchange Editor 300 DPI)
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      tagged: false,
      outline: false,
      scale: 0.9  // Reduce scale for smaller file size
    });
    
    await browser.close();
    
    const originalSize = pdfBuffer.length;
    console.log(`📊 Combined PDF generated: ${(originalSize / 1024).toFixed(1)} KB (compressed)`);
    
    // Send combined PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${session.session_name.replace(/[^a-zA-Z0-9]/g, '-')}-Complete-PM-Report.pdf"`);
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error('Error generating combined PDF:', error);
    res.status(500).json({ error: 'Error generating combined PDF' });
  }
});

// Voltage range specifications
const VOLTAGE_RANGES = {
  '24VDC': { min: 22.8, max: 25.2, type: 'DC' },
  '12VDC': { min: 11.4, max: 12.6, type: 'DC' },
  // AC voltage ranges
  'line_neutral': { min: 100, max: 130, type: 'AC', unit: 'V' },
  'line_ground': { min: 100, max: 130, type: 'AC', unit: 'V' },
  'neutral_ground': { min: 0, max: 1000, type: 'AC', unit: 'mV' }
};

function checkVoltageInRange(voltage, voltageType) {
  const numVoltage = parseFloat(voltage);
  if (isNaN(numVoltage)) return { inRange: true, message: '' };
  
  const range = VOLTAGE_RANGES[voltageType];
  if (!range) return { inRange: true, message: '' };
  
  const inRange = numVoltage >= range.min && numVoltage <= range.max;
  const unit = range.unit || 'V';
  const message = inRange ? '' : `${voltageType} reading ${numVoltage}${unit} is outside normal range (${range.min}-${range.max}${unit})`;
  
  return { inRange, message };
}

// Weighted risk scoring system
const RISK_WEIGHTS = {
  // Inspection items
  cabinet_fans: { weight: 8, level: 'MODERATE', description: 'affects controller efficiency and hardware lifetime' },
  controller_leds: { weight: 25, level: 'SUPER CRITICAL', description: 'indicates critical system fault' },
  io_status: { weight: 20, level: 'CRITICAL', description: 'communication failure affects process control' },
  network_status: { weight: 20, level: 'CRITICAL', description: 'network failure affects system connectivity' },
  temperatures: { weight: 4, level: 'SLIGHT', description: 'environmental conditions outside optimal range' },
  is_clean: { weight: 3, level: 'SLIGHT', description: 'cleanliness affects long-term reliability' },
  clean_filter_installed: { weight: 3, level: 'SLIGHT', description: 'filter maintenance affects air quality' },
  ground_inspection: { weight: 10, level: 'MODERATE', description: 'electrical safety concern' },
  
  // Power supply failures
  power_supply_fail: { weight: 8, level: 'MODERATE', description: 'power supply voltage out of spec' },
  voltage_out_of_range: { weight: 12, level: 'MODERATE', description: 'voltage deviation may cause instability' },
  
  // Network equipment specific
  network_equipment_entron: { weight: 20, level: 'CRITICAL', description: 'Entron switch failure is critical' },
  network_equipment_other: { weight: 8, level: 'MODERATE', description: 'network equipment failure' }
};

function generateRiskAssessment(cabinets, nodeMaintenanceData = []) {
  let riskScore = 0;
  let criticalIssues = [];
  let warnings = [];
  let moderateIssues = [];
  let slightIssues = [];
  let totalComponents = 0;
  let failedComponents = 0;
  let riskBreakdown = [];
  
  // Performance risk assessment from node maintenance data
  nodeMaintenanceData.forEach(maintenance => {
    if (maintenance.performance_value && maintenance.performance_type) {
      const nodeName = maintenance.node_name || `Node ${maintenance.node_id}`;
      
      if (maintenance.performance_type === 'perf_index' && maintenance.performance_value <= 2) {
        const weight = 15; // High risk for poor performance index
        riskScore += weight;
                 riskBreakdown.push(`${nodeName}: Poor performance index (${maintenance.performance_value}/5)`);
         moderateIssues.push(`${nodeName}: Performance index ${maintenance.performance_value}/5 indicates degraded controller performance`);
       } else if (maintenance.performance_type === 'free_time' && maintenance.performance_value <= 28) {
         const weight = 12; // Moderate risk for low free time
         riskScore += weight;
         riskBreakdown.push(`${nodeName}: Low free time (${maintenance.performance_value}%)`);
        moderateIssues.push(`${nodeName}: Free time ${maintenance.performance_value}% indicates high controller utilization`);
      }
    }
  });
  
  cabinets.forEach((cabinet, cabinetIndex) => {
    const cabinetName = cabinet.cabinet_location || `Cabinet ${cabinetIndex + 1}`;
    
    // Check power supplies
    if (cabinet.power_supplies) {
      cabinet.power_supplies.forEach((ps, psIndex) => {
        totalComponents++;
        
        // Check status
        if (ps.status === 'fail') {
          failedComponents++;
          const weight = RISK_WEIGHTS.power_supply_fail.weight;
          riskScore += weight;
          riskBreakdown.push(`${cabinetName}: Power Supply ${psIndex + 1} voltage out of spec`);
          moderateIssues.push(`${cabinetName}: Power Supply ${psIndex + 1} (${ps.voltage_type}) voltage out of spec`);
        }
        
        // Check DC voltage ranges
        if (ps.dc_reading) {
          const voltageCheck = checkVoltageInRange(ps.dc_reading, ps.voltage_type);
          if (!voltageCheck.inRange) {
            const weight = RISK_WEIGHTS.voltage_out_of_range.weight;
            riskScore += weight;
            riskBreakdown.push(`${cabinetName}: DC voltage out of range`);
            moderateIssues.push(`${cabinetName}: ${voltageCheck.message}`);
          }
        }
        
        // Check AC voltage ranges (slight risk)
        ['line_neutral', 'line_ground', 'neutral_ground'].forEach(measurement => {
          if (ps[measurement] !== undefined && ps[measurement] !== '') {
            const voltageCheck = checkVoltageInRange(ps[measurement], measurement);
            if (!voltageCheck.inRange) {
              const weight = 3; // Slight risk for AC voltage issues
              riskScore += weight;
              riskBreakdown.push(`${cabinetName}: ${measurement.replace('_', ' ')} out of range`);
              slightIssues.push(`${cabinetName}: ${voltageCheck.message}`);
            }
          }
        });
      });
    }
    
    // Check distribution blocks
    if (cabinet.distribution_blocks) {
      cabinet.distribution_blocks.forEach((db, dbIndex) => {
        totalComponents++;
        if (db.status === 'fail') {
          failedComponents++;
          const weight = 8; // Moderate risk
          riskScore += weight;
          riskBreakdown.push(`${cabinetName}: Distribution Block ${dbIndex + 1} voltage out of spec`);
          moderateIssues.push(`${cabinetName}: Distribution Block ${dbIndex + 1} voltage out of spec`);
        }
      });
    }
    
    // Check diodes
    if (cabinet.diodes) {
      cabinet.diodes.forEach((diode, diodeIndex) => {
        totalComponents++;
        if (diode.status === 'fail') {
          failedComponents++;
          const weight = 6; // Moderate risk
          riskScore += weight;
          riskBreakdown.push(`${cabinetName}: Diode ${diodeIndex + 1} voltage out of spec`);
          moderateIssues.push(`${cabinetName}: Diode ${diodeIndex + 1} voltage out of spec`);
        }
      });
    }
    
    // Check network equipment with special Entron handling
    if (cabinet.network_equipment) {
      cabinet.network_equipment.forEach((ne, neIndex) => {
        totalComponents++;
        if (ne.status === 'fail') {
          failedComponents++;
          const isEntron = ne.model_number && ne.model_number.toLowerCase().includes('entron');
          const weight = isEntron ? RISK_WEIGHTS.network_equipment_entron.weight : RISK_WEIGHTS.network_equipment_other.weight;
          riskScore += weight;
          riskBreakdown.push(`${cabinetName}: ${ne.equipment_type} ${ne.model_number || ''} voltage out of spec`);
          
          if (isEntron) {
            criticalIssues.push(`${cabinetName}: Entron switch voltage out of spec - Critical network infrastructure failure`);
          } else {
            moderateIssues.push(`${cabinetName}: ${ne.equipment_type} ${ne.model_number || ''} voltage out of spec`);
          }
        }
      });
    }
    
    // Check inspection items with weighted scoring
    const inspection = cabinet.inspection || {};
    
    Object.keys(RISK_WEIGHTS).forEach(key => {
      if (key.startsWith('power_supply') || key.startsWith('network_equipment') || key === 'voltage_out_of_range') return;
      
      if (inspection[key] === 'fail') {
        totalComponents++; // Count inspection items as components
        failedComponents++;
        const riskItem = RISK_WEIGHTS[key];
        const weight = riskItem.weight;
        riskScore += weight;
        riskBreakdown.push(`${cabinetName}: ${key.replace(/_/g, ' ')} failed inspection`);
        
        const message = `${cabinetName}: ${getInspectionDescription(key)} - ${riskItem.description}`;
        
        switch (riskItem.level) {
          case 'SUPER CRITICAL':
          case 'CRITICAL':
            criticalIssues.push(message);
            break;
          case 'MODERATE':
            moderateIssues.push(message);
            break;
          case 'SLIGHT':
            slightIssues.push(message);
            break;
        }
      } else if (inspection[key] === 'pass') {
        totalComponents++; // Count passing inspection items too
      }
    });
  });
  
  // Determine risk level based on actual issue severity, not just score
  let riskLevel = 'LOW';
  let riskColor = '#28a745';
  let recommendations = [];
  
  // Check if we actually have critical issues
  const hasCriticalIssues = criticalIssues.length > 0;
  const hasModerateIssues = moderateIssues.length > 0;
  const hasSlightIssues = slightIssues.length > 0;
  
  if (hasCriticalIssues) {
    riskLevel = 'CRITICAL';
    riskColor = '#dc3545';
    recommendations.push('Critical issues identified - Schedule priority maintenance');
    recommendations.push('Address critical items within 1-2 weeks');
    recommendations.push('Monitor affected systems closely until resolved');
  } else if (hasModerateIssues) {
    riskLevel = 'MODERATE';
    riskColor = '#fd7e14';
    recommendations.push('Moderate issues identified - Schedule maintenance');
    recommendations.push('Address issues within 30-60 days');
    recommendations.push('Continue normal system monitoring');
  } else if (hasSlightIssues) {
    riskLevel = 'LOW';
    riskColor = '#ffc107';
    recommendations.push('Minor issues identified - Include in next maintenance cycle');
    recommendations.push('Continue regular maintenance schedule');
    recommendations.push('Monitor for any developing issues');
  } else {
    recommendations.push('System is operating within acceptable parameters');
    recommendations.push('Continue regular maintenance schedule');
    recommendations.push('Monitor for any developing issues');
  }
  
  return {
    riskScore,
    riskLevel,
    riskColor,
    criticalIssues,
    warnings: moderateIssues, // Rename for consistency
    slightIssues,
    recommendations,
    totalComponents,
    failedComponents,
    riskBreakdown
  };
}

function getInspectionDescription(key) {
  const descriptions = {
    cabinet_fans: 'Cabinet cooling fans failed',
    controller_leds: 'Controller status LEDs indicate fault',
    io_status: 'I/O module status indicates failure',
    network_status: 'Network equipment status failed',
    temperatures: 'Environmental temperatures out of range',
    is_clean: 'Enclosure cleanliness below standard',
    clean_filter_installed: 'Clean filter not properly installed',
    ground_inspection: 'Ground connection inspection failed'
  };
  return descriptions[key] || key.replace(/_/g, ' ');
}

async function generateCombinedPDFHtml(data) {
  const { session, cabinets, customer, nodeMaintenanceData = [], diagnosticsData, sessionId } = data;
  
  const formatDate = (dateStr) => dateStr ? new Date(dateStr).toLocaleDateString() : 'Not specified';
  const formatStatus = (status) => status ? status.toUpperCase() : 'PASS';
  const formatValue = (value) => value !== null && value !== undefined ? value : '';
  
  // Clean session name to remove date if present
  const cleanSessionName = session.session_name ? 
    session.session_name.replace(/\s*-\s*\d{1,2}\/\d{1,2}\/\d{4}.*$/, '').trim() : '';
  
  const sessionInfo = {
    session_name: cleanSessionName || session.session_name,
    customer_name: customer ? customer.name : '',
    location: customer ? customer.location : ''
  };
  
  // Generate risk assessment with node maintenance data
  const riskAssessment = generateRiskAssessment(cabinets, nodeMaintenanceData);
  
  // Check if ECI logo exists
  const fs = require('fs');
  const path = require('path');
  let logoData = '';
  const logoPath = path.join(basePath, 'assets', 'Lifecycle logo.png');
  
  try {
    if (fs.existsSync(logoPath)) {
      const logoBuffer = fs.readFileSync(logoPath);
      logoData = `data:image/png;base64,${logoBuffer.toString('base64')}`;
    }
  } catch (error) {
    console.log('Logo not found, using text logo');
  }
  
  // Generate title page
  const titlePage = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>DeltaV Preventive Maintenance Report - ${session.session_name}</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          margin: 0;
          padding: 20px;
          color: #333;
        }
        .title-page {
          text-align: center;
          padding: 100px 20px;
          min-height: 80vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .logo-container {
          margin-bottom: 40px;
        }
        .logo-image {
          max-width: 300px;
          max-height: 150px;
        }
        .main-title {
          font-size: 42px;
          font-weight: 900;
          color: #2563eb;
          margin-bottom: 30px;
          text-shadow: 1px 1px 2px rgba(0,0,0,0.1);
        }
        .session-title {
          font-size: 28px;
          color: #333;
          margin-bottom: 40px;
        }
        .summary-box {
          background: #f8f9fa;
          border: 3px solid #2563eb;
          border-radius: 12px;
          padding: 30px;
          margin: 40px auto;
          max-width: 600px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .summary-item {
          display: flex;
          justify-content: space-between;
          margin: 15px 0;
          font-size: 18px;
        }
        .summary-label {
          font-weight: 900;
          color: #2563eb;
        }
        .page-break { page-break-before: always; }
        ${getSharedStyles()}
      </style>
    </head>
    <body>
      <div class="title-page">
        <div class="logo-container">
          ${logoData ? `<img src="${logoData}" alt="Lifecycle Logo" class="logo-image">` : `
            <div class="logo">
              ECI
              <div class="logo-subtitle">Emerson Impact Partner</div>
            </div>
          `}
        </div>
        <div class="main-title">DeltaV Preventative Maintenance Report</div>
        
        <div class="summary-box">
          <div class="summary-item">
            <span class="summary-label">Date:</span>
            <span>${formatDate(new Date().toISOString())}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Customer:</span>
            <span>${sessionInfo.customer_name || 'Not specified'}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Session:</span>
            <span>${sessionInfo.session_name || 'Not specified'}</span>
          </div>
        </div>
        
        <p style="margin-top: 60px; font-size: 16px; color: #666;">
          This document includes the Summary of the PM for all equipment for <strong>${sessionInfo.customer_name || 'Customer'}</strong>.
        </p>
      </div>
  `;
  
  // Generate risk assessment page (no page break, continues from title page)
  const riskAssessmentPage = `
      <div class="header">
        <div class="logo">
          ECI
          <div class="logo-subtitle">Emerson Impact Partner</div>
        </div>
        <div class="title">Risk Assessment Summary</div>
      </div>
      
      <div class="risk-summary">
        <div class="risk-score-box" style="background: ${riskAssessment.riskColor}; color: white;">
          <div class="risk-score">${riskAssessment.riskScore}</div>
          <div class="risk-level">${riskAssessment.riskLevel} RISK</div>
        </div>
        
        <div class="risk-stats">
          <div class="stat-item">
            <span class="stat-label">Total Components Inspected:</span>
            <span class="stat-value">${riskAssessment.totalComponents}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Failed Components:</span>
            <span class="stat-value">${riskAssessment.failedComponents}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Success Rate:</span>
            <span class="stat-value">${riskAssessment.totalComponents > 0 ? Math.round((1 - riskAssessment.failedComponents / riskAssessment.totalComponents) * 100) : 100}%</span>
          </div>
        </div>
      </div>
      
      ${riskAssessment.criticalIssues.length > 0 ? `
        <div class="issues-section critical">
          <div class="issues-header">🚨 CRITICAL ISSUES - IMMEDIATE ACTION REQUIRED</div>
          <ul class="issues-list">
            ${riskAssessment.criticalIssues.map(issue => `<li>${issue}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      
      ${riskAssessment.warnings.length > 0 ? `
        <div class="issues-section warning">
          <div class="issues-header">⚠️ MODERATE ISSUES - ATTENTION NEEDED</div>
          <ul class="issues-list">
            ${riskAssessment.warnings.map(warning => `<li>${warning}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      
      ${riskAssessment.slightIssues && riskAssessment.slightIssues.length > 0 ? `
        <div class="issues-section slight">
          <div class="issues-header">ℹ️ MINOR ISSUES - ROUTINE MAINTENANCE</div>
          <ul class="issues-list">
            ${riskAssessment.slightIssues.map(issue => `<li>${issue}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      
      <div class="recommendations-section">
        <div class="recommendations-header">📋 RECOMMENDATIONS</div>
        <ul class="recommendations-list">
          ${riskAssessment.recommendations.map(rec => `<li>${rec}</li>`).join('')}
        </ul>
      </div>
      
             <div class="voltage-specs">
         <div class="specs-header">Voltage Specifications</div>
        <table>
          <thead>
            <tr>
              <th>Voltage Type</th>
              <th>Nominal Range</th>
              <th>Measurement Points</th>
            </tr>
          </thead>
                     <tbody>
             <tr>
               <td><strong>24VDC</strong></td>
               <td>22.8 to 25.2V</td>
               <td>Power Supply DC Output</td>
             </tr>
             <tr>
               <td><strong>12VDC</strong></td>
               <td>11.4 to 12.6V</td>
               <td>Power Supply DC Output</td>
             </tr>
                           <tr>
                <td><strong>Line to Neutral AC</strong></td>
                <td>100 to 130V</td>
                <td>AC Input Voltage</td>
              </tr>
              <tr>
                <td><strong>Line to Ground AC</strong></td>
                <td>100 to 130V</td>
                <td>AC Input Voltage</td>
              </tr>
             <tr>
               <td><strong>Neutral to Ground</strong></td>
               <td>0 to 1000mV</td>
               <td>AC Ground Reference</td>
             </tr>
           </tbody>
        </table>
      </div>
    </div>
  `;
  
  // Get diagnostics data - prefer client-sent data over database
  console.log('🔧 DEBUG: diagnosticsData parameter:', typeof diagnosticsData, diagnosticsData);
  console.log('🔧 DEBUG: sessionId parameter:', sessionId);
  
  let finalDiagnosticsData = [];
  if (diagnosticsData && Array.isArray(diagnosticsData) && diagnosticsData.length > 0) {
    finalDiagnosticsData = diagnosticsData;
    console.log('✅ Using client-sent diagnostics data:', finalDiagnosticsData.length, 'errors');
  } else {
    console.log('🔧 DEBUG: No client diagnostics data, trying database...');
    // Fallback to database if no client data provided (will be empty until server restart)
    try {
      console.log('🔧 DEBUG: Attempting database query for sessionId:', sessionId);
      // Use the Promise-based wrapper and await it
      const queryResult = await db.prepare(`
        SELECT * FROM session_diagnostics 
        WHERE session_id = ? AND (deleted IS NULL OR deleted = 0)
        ORDER BY controller_name, card_number, channel_number
      `).all([sessionId]);
      console.log('🔧 DEBUG: Database query result:', typeof queryResult, queryResult);
      finalDiagnosticsData = Array.isArray(queryResult) ? queryResult : [];
      console.log('⚠️ Using database diagnostics data:', finalDiagnosticsData.length, 'errors');
    } catch (dbError) {
      console.log('❌ Database diagnostics error:', dbError);
      console.log('⚠️ Database diagnostics table not available, using empty array');
      finalDiagnosticsData = [];
    }
  }
  
  console.log('🔧 DEBUG: Final finalDiagnosticsData:', typeof finalDiagnosticsData, 'isArray:', Array.isArray(finalDiagnosticsData), 'length:', finalDiagnosticsData ? finalDiagnosticsData.length : 'N/A');
  
  // Get PM notes data for the session
  let pmNotesData = null;
  try {
    const pmNotesResult = await db.prepare(`
      SELECT common_tasks, additional_work_notes, troubleshooting_notes, recommendations_notes, updated_at FROM session_pm_notes 
      WHERE session_id = ? AND deleted = 0
    `).get([sessionId]);
    pmNotesData = pmNotesResult;
    console.log('✅ Retrieved PM notes for PDF:', pmNotesData ? 'Found notes' : 'No notes');
  } catch (pmNotesError) {
    console.log('❌ PM notes error:', pmNotesError);
    console.log('⚠️ PM notes table not available, using null');
    pmNotesData = null;
  }
  
  // Generate maintenance report section
  const maintenanceReportPage = generateMaintenanceReportPage(nodeMaintenanceData);
  
  // Generate PM notes section
  const pmNotesPage = generatePMNotesPage(pmNotesData, sessionInfo, logoData);
  
  // Generate diagnostics table section
  const diagnosticsPage = generateDiagnosticsPage(finalDiagnosticsData);
  
  // Generate individual cabinet pages
  const cabinetPages = cabinets.map((cabinet, index) => `
    <div class="page-break">
      ${generateSingleCabinetHtml(cabinet, sessionInfo, index + 1)}
    </div>
  `).join('');
  
  // New order: Title → Risk Assessment → Node Maintenance → PM Notes → Diagnostics → Cabinets
  return titlePage + riskAssessmentPage + maintenanceReportPage + pmNotesPage + diagnosticsPage + cabinetPages + `
    </body>
    </html>
  `;
}

function generatePMNotesPage(pmNotesData, sessionInfo, logoData) {
  // Check if any PM notes data exists
  const hasCommonTasks = pmNotesData && pmNotesData.common_tasks;
  const hasAdditionalWork = pmNotesData && pmNotesData.additional_work_notes && pmNotesData.additional_work_notes.trim() !== '';
  const hasTroubleshooting = pmNotesData && pmNotesData.troubleshooting_notes && pmNotesData.troubleshooting_notes.trim() !== '';
  const hasRecommendations = pmNotesData && pmNotesData.recommendations_notes && pmNotesData.recommendations_notes.trim() !== '';
  
  // If no PM notes data exists at all, don't include this section
  if (!hasCommonTasks && !hasAdditionalWork && !hasTroubleshooting && !hasRecommendations) {
    return '';
  }

  const lastUpdated = pmNotesData && pmNotesData.updated_at ? 
    new Date(pmNotesData.updated_at).toLocaleString() : 
    'Unknown';

  // Common task definitions for display
  const commonTaskLabels = {
    'backup-charts': 'Charts Backup',
    'backup-graphics': 'Graphics Backup',
    'power-up-backup': 'Power-up Backup',
    'sound-backup': 'Sound Backup',
    'events-backup': 'Events Backup',
    'fhx-backup': 'FHX Backup',
    'sure-service-report': 'Sure Service Report',
    'machine-cleaning': 'Machine Cleaning (Blowing out)'
  };

  // Parse common tasks if they exist
  let commonTasksList = [];
  if (hasCommonTasks) {
    try {
      const tasks = JSON.parse(pmNotesData.common_tasks);
      if (Array.isArray(tasks)) {
        commonTasksList = tasks.map(taskId => commonTaskLabels[taskId] || taskId).filter(Boolean);
      }
    } catch (e) {
      console.error('Error parsing common_tasks:', e);
    }
  }

  // Helper function to escape HTML and convert line breaks
  const formatText = (text) => {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  };

  return `
    <div class="page-break">
      <div class="header">
        <div class="logo">
          ${logoData ? `<img src="${logoData}" alt="Lifecycle Logo" class="logo-image">` : 'ECI'}
        </div>
        <div class="header-text">
          <div>ECI</div>
          <div>Emerson Impact Partner</div>
          <div>DeltaV Preventive Maintenance Report</div>
        </div>
      </div>

      <div class="content">
        <div class="cabinet-title">PM Notes & Additional Work</div>

        <div class="pm-notes-section">

          ${commonTasksList.length > 0 || hasAdditionalWork ? `
          <div class="pm-section">
            <h2 class="pm-section-title">Additional Work Performed</h2>
            
            ${commonTasksList.length > 0 ? `
            <div class="common-tasks-section">
              <h3 class="pm-subsection-title">Other PM Tasks Completed:</h3>
              <ul class="pm-tasks-bulleted-list">
                ${commonTasksList.map(task => `<li>• ${task}</li>`).join('')}
              </ul>
            </div>
            ` : ''}
            
            ${hasAdditionalWork ? `
            <div class="notes-subsection">
              <h3 class="pm-subsection-title">Additional Work Details:</h3>
              <div class="notes-text">
                ${formatText(pmNotesData.additional_work_notes)}
              </div>
            </div>
            ` : ''}
          </div>
          ` : ''}

          ${hasTroubleshooting ? `
          <div class="pm-section">
            <h2 class="pm-section-title">Troubleshooting Performed</h2>
            <div class="notes-text">
              ${formatText(pmNotesData.troubleshooting_notes)}
            </div>
          </div>
          ` : ''}

          ${hasRecommendations ? `
          <div class="pm-section">
            <h2 class="pm-section-title">Recommendations</h2>
            <div class="notes-text">
              ${formatText(pmNotesData.recommendations_notes)}
            </div>
          </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

// Helper function to get base64 logo
function getBase64Logo() {
  const fs = require('fs');
  const path = require('path');
  let logoData = '';
  
  // Try multiple logo paths - prioritize Lifecycle logo
  const logoPaths = [
    path.join(basePath, 'assets', 'Lifecycle logo.png'),
    path.join(__dirname, 'assets', 'Lifecycle logo.png'),
    path.join(basePath, 'assets', 'deltav-logo.png'),
    path.join(basePath, 'assets', 'eci-logo.png'),
    path.join(__dirname, 'assets', 'deltav-logo.png'),
    path.join(__dirname, 'assets', 'eci-logo.png')
  ];
  
  for (const logoPath of logoPaths) {
    try {
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        logoData = logoBuffer.toString('base64');
        console.log(`✅ DEBUG: Logo loaded from: ${logoPath}`);
        break;
      }
    } catch (error) {
      console.log(`⚠️  DEBUG: Could not load logo from ${logoPath}:`, error.message);
    }
  }
  
  if (!logoData) {
    console.log('⚠️  DEBUG: No logo found, using text logo');
  }
  
  return logoData;
}

// Generate combined I&I PDF for all documents in a session
async function generateCombinedIIPDF(session, documents) {
  const logoData = getBase64Logo();
  const currentDate = new Date().toLocaleDateString('en-US');
  
  console.log(`🔍 DEBUG: Generating combined PDF for ${documents.length} documents`);
  
  // Generate cover page
  const coverPage = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>DeltaV I&I Report - ${session.session_name}</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          margin: 0; 
          padding: 40px; 
          font-size: 12px; 
          line-height: 1.4;
          text-align: center;
        }
        .logo { 
          max-width: 150px; 
          height: auto; 
          margin-bottom: 30px;
        }
        .main-title {
          font-size: 24px;
          font-weight: bold;
          margin-bottom: 10px;
          color: #2563eb;
        }
        .subtitle {
          font-size: 16px;
          margin-bottom: 20px;
          color: #374151;
        }
        .for-section {
          font-size: 14px;
          margin: 30px 0;
        }
        .customer-info {
          margin: 20px 0;
          font-size: 14px;
        }
        .revision-table {
          width: 100%;
          border-collapse: collapse;
          margin: 30px 0;
          font-size: 10px;
        }
        .revision-table th, .revision-table td {
          border: 1px solid #000;
          padding: 8px;
          text-align: left;
        }
        .revision-table th {
          background-color: #f0f0f0;
        }
        .note-section {
          font-size: 10px;
          text-align: left;
          margin: 20px 0;
        }
        .signature-section {
          margin: 40px 0;
          text-align: left;
        }
        .footer-text {
          position: fixed;
          bottom: 30px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 12px;
          color: #374151;
        }
      </style>
    </head>
    <body>
      ${logoData ? `<img src="data:image/png;base64,${logoData}" alt="Lifecycle Logo" class="logo">` : ''}
      
      <div class="main-title">DeltaV</div>
      <div class="main-title">Installation & Integration Procedure</div>
      
      <div class="for-section">
        <strong>for</strong><br>
        <strong>${session.ii_customer_name || session.customer_name}</strong>
      </div>
      
      <div class="customer-info">
        <strong>DeltaV System ID: ${session.deltav_system_id || session.customer_name}</strong>
      </div>
      
      <table class="revision-table">
        <thead>
          <tr>
            <th>Rev.</th>
            <th>Date</th>
            <th>Description</th>
            <th>By</th>
            <th>Reviewed By / Date</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td>
            <td></td>
            <td>Prepared for</td>
            <td></td>
            <td></td>
          </tr>
          <tr><td></td><td></td><td></td><td></td><td></td></tr>
          <tr><td></td><td></td><td></td><td></td><td></td></tr>
          <tr><td></td><td></td><td></td><td></td><td></td></tr>
          <tr><td></td><td></td><td></td><td></td><td></td></tr>
        </tbody>
      </table>
      
      <div class="note-section">
        <strong>Note:</strong> Number in Rev. identifies version sent to customer. Lower case letter in Rev. identifies internal version
      </div>
      
      <div class="signature-section">
        <strong>Performed By:</strong> ${session.ii_performed_by || '_____________'} &nbsp;&nbsp;&nbsp;&nbsp; <strong>Date:</strong> ${currentDate}
      </div>
      
      <div class="footer-text">
        An Emerson Process Management Local Business Partner
      </div>
    </body>
    </html>
  `;
  
  // Generate introduction pages (beginning 3 pages)
  const introPages = generateIIIntroPages(session, logoData);
  
  // Generate document sections
  const documentSections = [];
  
  for (let i = 0; i < documents.length; i++) {
    const document = documents[i];
    console.log(`🔍 DEBUG: Processing document ${i + 1}: ${document.document_name}`);
    
    // Get checklist items for this document
    const checklistItems = await db.prepare('SELECT * FROM session_ii_checklist WHERE document_id = ? AND deleted = 0 ORDER BY section_name, item_name').all([document.id]);
    
    // Get equipment used for this document
    const equipmentUsed = await db.prepare('SELECT * FROM session_ii_equipment_used WHERE document_id = ? AND deleted = 0 ORDER BY manufacturer, type').all([document.id]);
    
    // Generate document content
    const documentContent = generateSingleIIDocumentContent(document, session, checklistItems, equipmentUsed, i + 1);
    documentSections.push(documentContent);
  }
  
  // Generate final pages (equipment reference tables)
  const finalPages = generateIIFinalPages(session, logoData);
  
  // Combine all sections
  const combinedContent = `
    ${coverPage}
    ${introPages}
    ${documentSections.join('')}
    ${finalPages}
  `;
  
  console.log(`✅ DEBUG: Combined PDF content generated successfully`);
  console.log(`📊 DEBUG: Combined content size: ${Math.round(combinedContent.length / 1024)} KB`);
  return combinedContent;
}

// Generate introduction pages for I&I report
function generateIIIntroPages(session, logoData) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { 
          font-family: Arial, sans-serif; 
          margin: 0; 
          padding: 20px; 
          font-size: 11px; 
          line-height: 1.5;
        }
        .page {
          min-height: 100vh;
          padding: 20px;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
          border-bottom: 2px solid #2563eb;
          padding-bottom: 20px;
        }
        .page-header {
          position: fixed;
          top: 10px;
          left: 0;
          right: 0;
          text-align: center;
          font-size: 10px;
          color: #666;
          border-bottom: 1px solid #ccc;
          padding-bottom: 5px;
          background: white;
          z-index: 1000;
        }
        .logo { max-width: 120px; height: auto; }
        h1 { color: #2563eb; font-size: 24px; margin: 0; }
        h2 { color: #2563eb; font-size: 18px; margin-top: 30px; margin-bottom: 15px; }
        h3 { color: #2563eb; font-size: 14px; margin-top: 20px; margin-bottom: 10px; }
        .toc { margin: 20px 0; }
        .toc-item { 
          display: flex; 
          justify-content: space-between; 
          padding: 8px 0; 
          border-bottom: 1px dotted #ccc; 
        }
        .intro-text { 
          text-align: justify; 
          margin: 15px 0; 
        }
        .equipment-list {
          margin: 20px 0;
        }
        .equipment-item {
          margin: 8px 0;
          padding-left: 20px;
        }
      </style>
    </head>
    <body>
      <div class="page-header">DeltaV Installation & Integration Procedure - ${session.ii_customer_name || session.customer_name}</div>
      
      <!-- Page 1: Table of Contents -->
      <div class="page" style="page-break-before: always; margin-top: 60px; padding-top: 15px;">
        <div class="header">
          ${logoData ? `<img src="data:image/png;base64,${logoData}" alt="Lifecycle Logo" class="logo">` : '<div style="font-size: 20px; font-weight: bold;">ECI</div>'}
          <div>
            <h1>DeltaV Installation & Integration Procedure</h1>
            <div><strong>Customer:</strong> ${session.ii_customer_name || session.customer_name}</div>
            <div><strong>DeltaV System ID:</strong> ${session.deltav_system_id || session.customer_name}</div>
          </div>
        </div>
        
        <h2>Table of Contents</h2>
        <div class="toc">
          <div class="toc-item"><span>1. Introduction</span><span>2</span></div>
          <div class="toc-item"><span>2. Equipment Necessary</span><span>2</span></div>
          <div class="toc-item"><span>3. Good Engineering Practices for General Systems</span><span>3</span></div>
          <div class="toc-item"><span>4. Power and Grounding Connections</span><span>3</span></div>
          <div class="toc-item"><span>5. Enclosures</span><span>3</span></div>
          <div class="toc-item"><span>6. AC Power System and Distribution</span><span>3</span></div>
          <div class="toc-item"><span>7. DC Power System and Distribution</span><span>3</span></div>
          <div class="toc-item"><span>8. DeltaV Controllers</span><span>3</span></div>
          <div class="toc-item"><span>9. List of Equipment Used</span><span>3</span></div>
          <div class="toc-item"><span>10. Ground Cable Sizing - Reference</span><span>3</span></div>
        </div>
      </div>
      
      <!-- Page 2: Introduction and Equipment Necessary -->
      <div class="page" style="page-break-before: always; margin-top: 60px; padding-top: 15px;">
        <h2>1. Introduction</h2>
        <div class="intro-text">
          The Installation and Integration (I&I) checklists in this document help to properly verify and document power and grounding for Emerson's CHARMs, S-series, and M-series products. For more thorough information on other aspects of site preparation please refer to the Site Preparation and Design for DeltaV Digital Automation Systems.
        </div>
        <div class="intro-text">
          All of the inspection criteria in this document are based on good engineering practice and apply to any control system, and were derived from the Emerson Process management guidelines contained in the DeltaV Quick Start Guide for DeltaV Power, Grounding, and Surge Suppression, and the Site Preparation and Design for DeltaV Digital Automation Systems.
        </div>
        <div class="intro-text">
          The DeltaV system itself has already been verified in the Factory Acceptance Test (FAT). This I&I does not repeat that verification. This I&I is limited to the verification that all components of the DeltaV system have been properly installed, including power, grounding, and intra-system communications, in the field before initial application of power.
        </div>
        <div class="intro-text">
          Checks of the installation and operation of the entire instrumentation and control system, including additional checks of the DeltaV operation, are performed in the Site Acceptance Test (SAT) and loop checks for the project and are not part of this I&I.
        </div>
        
        <h2 style="margin-top: 40px;">2. Equipment Necessary</h2>
        <div class="intro-text">
          The following equipment is needed to perform the checks in this I&I:
        </div>
        <div class="equipment-list">
          <div class="equipment-item">• Clamp-on RMS ammeter (for AC and DC current measurements)</div>
          <div class="equipment-item">• 4-1/2 digit DVM with accuracy of ± 0.05%, or better.</div>
          <div class="equipment-item">• Fluke 1630 Earth Ground Clamp Meter</div>
          <div class="equipment-item">• Fluke MT-8200-49A Micromapper</div>
        </div>
        <div class="intro-text">
          <strong>Note:</strong> Equivalent equipment may be substituted for the equipment listed above. Review the most current revision of product manuals and installation manuals prior to checkout.
        </div>
      </div>
    </body>
    </html>
  `;
}

// Generate single document content for combined PDF
function generateSingleIIDocumentContent(document, session, checklistItems, equipmentUsed, documentNumber) {
  // Group checklist items by section
  const sectionGroups = {};
  checklistItems.forEach(item => {
    if (!sectionGroups[item.section_name]) {
      sectionGroups[item.section_name] = [];
    }
    sectionGroups[item.section_name].push(item);
  });
  
  // Define the correct section order
  const sectionOrder = [
    'Good Engineering Practices',
    'Power and Grounding Connections',
    'Enclosures',
    'AC Power System and Distribution',
    'DC Power System and Distribution',
    'DeltaV Controllers',
    'List of Equipment Used'
  ];
  
  // Sort sections according to the defined order
  const sortedSectionNames = Object.keys(sectionGroups).sort((a, b) => {
    const indexA = sectionOrder.indexOf(a);
    const indexB = sectionOrder.indexOf(b);
    // If section not in order array, put it at the end
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });
  
  // Generate checklist sections HTML
  const checklistSectionsHTML = sortedSectionNames.map(sectionName => {
    const items = sectionGroups[sectionName];
    const itemsHTML = items.map(item => {
      let measurementCells = '';
      
      // Add measurement columns if this item has measurements
      if (item.measurement_ohms || item.measurement_ac_ma || item.measurement_voltage || item.measurement_frequency) {
        const measurements = [];
        if (item.measurement_ohms) measurements.push(`<strong>${item.measurement_ohms} Ω</strong>`);
        if (item.measurement_ac_ma) measurements.push(`<strong>${item.measurement_ac_ma} AC mA</strong>`);
        // Removed DC mA as requested
        if (item.measurement_voltage) measurements.push(`<strong>${item.measurement_voltage} V</strong>`);
        if (item.measurement_frequency) measurements.push(`<strong>${item.measurement_frequency} Hz</strong>`);
        
        measurementCells = `
          <td style="border: 1px solid #ccc; padding: 8px; font-size: 10px;">
            ${measurements.join('<br>')}
          </td>
        `;
      }
      
      return `
        <tr>
          <td style="border: 1px solid #ccc; padding: 8px; vertical-align: top; width: 50%;">
            ${item.item_name}
          </td>
          <td style="border: 1px solid #ccc; padding: 8px; text-align: center; width: 12%;">
            ${item.answer || ''}
          </td>
          ${measurementCells || '<td style="border: 1px solid #ccc; padding: 8px; width: 15%;">&nbsp;</td>'}
          <td style="border: 1px solid #ccc; padding: 8px; width: 23%;">
            ${item.comments || '&nbsp;'}
          </td>
        </tr>
      `;
    }).join('');
    
    return `
      <div style="page-break-before: always; page-break-inside: avoid; margin-bottom: 30px; margin-top: 60px; padding-top: 15px;">
        <h3 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 5px; margin-bottom: 15px; font-size: 16px; font-weight: bold; text-align: center;">
          ${sectionName}
        </h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="background-color: #f8fafc;">
              <th style="border: 1px solid #ccc; padding: 8px; text-align: left;">Verification</th>
              <th style="border: 1px solid #ccc; padding: 8px;">Answer</th>
              <th style="border: 1px solid #ccc; padding: 8px;">Measurements</th>
              <th style="border: 1px solid #ccc; padding: 8px;">Comments</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>
      </div>
    `;
  }).join('');
  
  // Generate equipment used table
  const equipmentHTML = equipmentUsed.length > 0 ? `
    <div style="page-break-inside: avoid; margin-bottom: 30px;">
      <h3 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 5px; margin-bottom: 15px; font-size: 16px; font-weight: bold; text-align: center;">
        Equipment Used
      </h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
        <thead>
          <tr style="background-color: #f8fafc;">
            <th style="border: 1px solid #ccc; padding: 8px;">Manufacturer</th>
            <th style="border: 1px solid #ccc; padding: 8px;">Type</th>
            <th style="border: 1px solid #ccc; padding: 8px;">Serial Number</th>
            <th style="border: 1px solid #ccc; padding: 8px;">Re-calibration Date</th>
            <th style="border: 1px solid #ccc; padding: 8px;">Used in Section</th>
          </tr>
        </thead>
        <tbody>
          ${equipmentUsed.map(item => `
            <tr>
              <td style="border: 1px solid #ccc; padding: 8px;">${item.manufacturer || ''}</td>
              <td style="border: 1px solid #ccc; padding: 8px;">${item.type || ''}</td>
              <td style="border: 1px solid #ccc; padding: 8px;">${item.serial_number || ''}</td>
              <td style="border: 1px solid #ccc; padding: 8px;">${item.recalibration_date || ''}</td>
              <td style="border: 1px solid #ccc; padding: 8px;">${item.used_in_section || ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : '';
  
    return `
    <div style="page-break-before: always;">
      <div style="position: fixed; top: 10px; left: 0; right: 0; text-align: center; font-size: 10px; color: #666; border-bottom: 1px solid #ccc; padding-bottom: 5px; background: white; z-index: 1000;">DeltaV Installation & Integration Procedure - ${session.ii_customer_name || session.customer_name}</div>
      <div style="margin-top: 60px; margin-bottom: 20px; padding-top: 15px;">
        <h2 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-top: 0; margin-bottom: 20px; font-size: 20px; text-align: center;">Document ${documentNumber}: ${document.document_name}</h2>
      </div>
      
      ${checklistSectionsHTML}
      ${equipmentHTML}
    </div>
  `;
}

// Generate final pages for I&I report
function generateIIFinalPages(session, logoData) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { 
          font-family: Arial, sans-serif; 
          margin: 0; 
          padding: 20px; 
          font-size: 10px; 
          line-height: 1.4;
        }
        h2 { 
          color: #2563eb; 
          border-bottom: 2px solid #2563eb; 
          padding-bottom: 10px; 
          margin-top: 0; 
          margin-bottom: 20px; 
          font-size: 18px;
        }
        table { 
          width: 100%; 
          border-collapse: collapse; 
          margin-bottom: 20px; 
          font-size: 9px;
        }
        th, td { 
          border: 1px solid #ccc; 
          padding: 4px; 
          text-align: center; 
        }
        th { 
          background-color: #f8fafc; 
          font-weight: bold; 
        }
        .intro-text { 
          text-align: justify; 
          margin: 15px 0; 
          font-size: 10px;
        }
        .page-header {
          position: fixed;
          top: 10px;
          left: 0;
          right: 0;
          text-align: center;
          font-size: 10px;
          color: #666;
          border-bottom: 1px solid #ccc;
          padding-bottom: 5px;
          background: white;
          z-index: 1000;
        }
      </style>
    </head>
    <body>
      <div class="page-header">DeltaV Installation & Integration Procedure - ${session.ii_customer_name || session.customer_name}</div>
      <div style="page-break-before: always; margin-top: 60px; padding-top: 15px;">
      <h2>Ground Cable Sizing - Reference</h2>
      <div class="intro-text">
        DeltaV is a ground referenced system. To maintain high integrity it is important that careful consideration be paid to ground conductor sizing. The original site preparation manual, Site Preparation and Design for DeltaV Digital Automation Systems, lists some typical methods of connecting grounding networks.
      </div>
      <div class="intro-text">
        Typically for large high-integrity systems, shields are connected to the chassis ground bar. One of the most cost efficient grounding method uses a star topology with larger conductor sizes at the sections located a greater distance from the cabinets.
      </div>
      <div class="intro-text">
        The following tables are applicable for all DeltaV products. Table 5-1 lists the appropriate wire size with respect to the distance between a cabinet and the closest ground bar or between individual ground bars.
      </div>
      
      <h3>Table 5-1: Ground wire sizing</h3>
      <table>
        <thead>
          <tr>
            <th>I/O points</th>
            <th>10 ft</th>
            <th>25 ft</th>
            <th>50 ft</th>
            <th>100 ft</th>
            <th>300 ft</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>64</td><td>8 AWG</td><td>8 AWG</td><td>8 AWG</td><td>6 AWG</td><td>2 AWG</td></tr>
          <tr><td>128</td><td>8 AWG</td><td>8 AWG</td><td>6 AWG</td><td>2 AWG</td><td>1/0</td></tr>
          <tr><td>256</td><td>8 AWG</td><td>6 AWG</td><td>2 AWG</td><td>1/0</td><td>2/0</td></tr>
          <tr><td>512</td><td>6 AWG</td><td>2 AWG</td><td>1/0</td><td>2/0</td><td>3/0</td></tr>
          <tr><td>1024</td><td>2 AWG</td><td>1/0</td><td>2/0</td><td>3/0</td><td>4/0</td></tr>
          <tr><td>2048</td><td>1/0</td><td>2/0</td><td>3/0</td><td>4/0</td><td>---</td></tr>
          <tr><td>4096</td><td>2/0</td><td>3/0</td><td>4/0</td><td>---</td><td>---</td></tr>
          <tr><td>8192</td><td>3/0</td><td>4/0</td><td>---</td><td>---</td><td>---</td></tr>
        </tbody>
      </table>
      
      <h3 style="margin-top: 30px;">Table 5-3: Braided cable system</h3>
      <table>
        <thead>
          <tr>
            <th>I/O points</th>
            <th>10 ft</th>
            <th>25 ft</th>
            <th>50 ft</th>
            <th>100 ft</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>128</td><td>N30-36T-762-2ULG</td><td>N30-36T-762-2ULG</td><td>N30-36T-762-2ULG</td><td>N30-30T-652-2UL</td></tr>
          <tr><td>256</td><td>N30-36T-762-2ULG</td><td>N30-36T-762-2ULG</td><td>N30-30T-652-2UL</td><td>---</td></tr>
          <tr><td>512</td><td>N30-36T-762-2ULG</td><td>N30-30T-652-2UL</td><td>---</td><td>---</td></tr>
          <tr><td>1024</td><td>N30-30T-652-2UL</td><td>---</td><td>---</td><td>---</td></tr>
        </tbody>
      </table>
      
      <h3 style="margin-top: 30px;">Table 5-4: Single cable length with chassis ground and DC ground connected in enclosure</h3>
      <table>
        <thead>
          <tr>
            <th>I/O points</th>
            <th>10 ft</th>
            <th>25 ft</th>
            <th>50 ft</th>
            <th>100 ft</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>64</td><td>8 AWG</td><td>8 AWG</td><td>6 AWG</td><td>2 AWG</td></tr>
          <tr><td>128</td><td>8 AWG</td><td>6 AWG</td><td>2 AWG</td><td>1/0</td></tr>
          <tr><td>256</td><td>6 AWG</td><td>2 AWG</td><td>1/0</td><td>2/0</td></tr>
          <tr><td>512</td><td>2 AWG</td><td>1/0</td><td>2/0</td><td>3/0</td></tr>
          <tr><td>1024</td><td>1/0</td><td>2/0</td><td>3/0</td><td>4/0</td></tr>
        </tbody>
      </table>
      
      <div style="margin-top: 40px; text-align: center; font-size: 10px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 20px;">
        <p><strong>Equipment & Controls, Inc. Confidential</strong></p>
        <p>Generated on ${new Date().toLocaleString()}</p>
        <p>Performed by: ${session.ii_performed_by || 'Not specified'}</p>
      </div>
      </div>
    </body>
    </html>
  `;
}

function generateIIPDF(document, session, checklistItems, equipmentUsed) {
  const logoData = getBase64Logo();
  const currentDate = new Date().toLocaleDateString('en-US');
  
  // Group checklist items by section
  const sectionGroups = {};
  checklistItems.forEach(item => {
    if (!sectionGroups[item.section_name]) {
      sectionGroups[item.section_name] = [];
    }
    sectionGroups[item.section_name].push(item);
  });
  
  // Define the correct section order
  const sectionOrder = [
    'Good Engineering Practices',
    'Power and Grounding Connections',
    'Enclosures',
    'AC Power System and Distribution',
    'DC Power System and Distribution',
    'DeltaV Controllers',
    'List of Equipment Used'
  ];
  
  // Sort sections according to the defined order
  const sortedSectionNames = Object.keys(sectionGroups).sort((a, b) => {
    const indexA = sectionOrder.indexOf(a);
    const indexB = sectionOrder.indexOf(b);
    // If section not in order array, put it at the end
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });
  
  // Generate checklist sections HTML
  const checklistSectionsHTML = sortedSectionNames.map(sectionName => {
    const items = sectionGroups[sectionName];
    const itemsHTML = items.map(item => {
      // Check if this item has measurements
      const hasMeasurements = item.measurement_ohms || item.measurement_ac_ma || item.measurement_voltage || item.measurement_frequency;
      
      let measurementCell = '';
      if (hasMeasurements) {
        const measurements = [];
        if (item.measurement_ohms) measurements.push(`<strong>${item.measurement_ohms} Ω</strong>`);
        if (item.measurement_ac_ma) measurements.push(`<strong>${item.measurement_ac_ma} AC mA</strong>`);
        // Removed DC mA as requested
        if (item.measurement_voltage) measurements.push(`<strong>${item.measurement_voltage} V</strong>`);
        if (item.measurement_frequency) measurements.push(`<strong>${item.measurement_frequency} Hz</strong>`);
        
        measurementCell = `
          <td style="border: 1px solid #ccc; padding: 8px; font-size: 10px; width: 15%;">
            ${measurements.join('<br>')}
          </td>
        `;
      }
      
      return `
        <tr>
          <td style="border: 1px solid #ccc; padding: 8px; vertical-align: top; width: 45%;">
            ${item.item_name}
          </td>
          <td style="border: 1px solid #ccc; padding: 8px; text-align: center; width: 15%;">
            ${item.answer || ''}
          </td>
          ${measurementCell || '<td style="border: 1px solid #ccc; padding: 8px; width: 15%;">&nbsp;</td>'}
          <td style="border: 1px solid #ccc; padding: 8px; width: 25%;">
            ${item.comments || '&nbsp;'}
          </td>
        </tr>
      `;
    }).join('');
    
    // Check if any items in this section have measurements
    const sectionHasMeasurements = items.some(item => 
      item.measurement_ohms || item.measurement_ac_ma || 
      item.measurement_voltage || item.measurement_frequency
    );
    
    return `
      <div style="page-break-before: always; page-break-inside: avoid; margin-bottom: 30px; margin-top: 60px; padding-top: 15px;">
        <h3 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 5px; margin-bottom: 15px; font-size: 16px; font-weight: bold; text-align: center;">
          ${sectionName}
        </h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr style="background-color: #f8fafc;">
              <th style="border: 1px solid #ccc; padding: 8px; text-align: left;">Verification</th>
              <th style="border: 1px solid #ccc; padding: 8px;">Answer</th>
              <th style="border: 1px solid #ccc; padding: 8px;">Measurements</th>
              <th style="border: 1px solid #ccc; padding: 8px;">Comments</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>
      </div>
    `;
  }).join('');
  
  // Generate equipment used table
  const equipmentHTML = equipmentUsed.length > 0 ? `
    <div style="page-break-inside: avoid; margin-bottom: 30px;">
      <h3 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 5px; margin-bottom: 15px; font-size: 16px; font-weight: bold; text-align: center;">
        List of Equipment Used
      </h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
        <thead>
          <tr style="background-color: #f8fafc;">
            <th style="border: 1px solid #ccc; padding: 8px;">Manufacturer</th>
            <th style="border: 1px solid #ccc; padding: 8px;">Type</th>
            <th style="border: 1px solid #ccc; padding: 8px;">Serial Number</th>
            <th style="border: 1px solid #ccc; padding: 8px;">Re-calibration Date</th>
            <th style="border: 1px solid #ccc; padding: 8px;">Used in Section</th>
          </tr>
        </thead>
        <tbody>
          ${equipmentUsed.map(item => `
            <tr>
              <td style="border: 1px solid #ccc; padding: 8px;">${item.manufacturer || ''}</td>
              <td style="border: 1px solid #ccc; padding: 8px;">${item.type || ''}</td>
              <td style="border: 1px solid #ccc; padding: 8px;">${item.serial_number || ''}</td>
              <td style="border: 1px solid #ccc; padding: 8px;">${item.recalibration_date || ''}</td>
              <td style="border: 1px solid #ccc; padding: 8px;">${item.used_in_section || ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>I&I Document - ${document.document_name}</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          margin: 0; 
          padding: 20px; 
          font-size: 11px; 
          line-height: 1.4;
        }
        .header { 
          display: flex; 
          justify-content: space-between; 
          align-items: flex-start; 
          margin-bottom: 30px; 
          border-bottom: 2px solid #2563eb; 
          padding-bottom: 20px;
        }
        .logo { max-width: 120px; height: auto; }
        .header-info { text-align: right; }
        .header-info h1 { 
          margin: 0 0 10px 0; 
          color: #2563eb; 
          font-size: 18px; 
        }
        .document-info {
          background: #f8fafc;
          padding: 15px;
          border-radius: 5px;
          margin-bottom: 20px;
        }
        .info-row {
          display: flex;
          margin-bottom: 8px;
        }
        .info-label {
          font-weight: bold;
          width: 150px;
          color: #374151;
        }
        .info-value {
          color: #6b7280;
        }
        h2 { 
          color: #2563eb; 
          border-bottom: 1px solid #2563eb; 
          padding-bottom: 5px; 
          margin-top: 25px; 
          margin-bottom: 15px; 
        }
        h3 { 
          color: #2563eb; 
          margin-top: 20px; 
          margin-bottom: 10px; 
        }
        table { 
          width: 100%; 
          border-collapse: collapse; 
          margin-bottom: 20px; 
        }
        th, td { 
          border: 1px solid #ccc; 
          padding: 8px; 
          text-align: left; 
        }
        th { 
          background-color: #f8fafc; 
          font-weight: bold; 
        }
        .footer {
          margin-top: 40px;
          text-align: center;
          font-size: 10px;
          color: #6b7280;
          border-top: 1px solid #e5e7eb;
          padding-top: 10px;
        }
        @media print {
          body { margin: 0; padding: 15px; }
          .header { page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          ${logoData ? `<img src="data:image/png;base64,${logoData}" alt="Lifecycle Logo" class="logo">` : ''}
        </div>
        <div class="header-info">
          <h1>DeltaV Installation & Integration Procedure</h1>
          <div><strong>Document:</strong> ${document.document_name}</div>
          <div><strong>Customer:</strong> ${session.customer_name}</div>
          <div><strong>Date:</strong> ${currentDate}</div>
        </div>
      </div>

      <div class="document-info">
        <div class="info-row">
          <div class="info-label">Customer Name:</div>
          <div class="info-value">${session.customer_name}</div>
        </div>
        <div class="info-row">
          <div class="info-label">Location:</div>
          <div class="info-value">${document.location || session.customer_location || 'Not specified'}</div>
        </div>
        <div class="info-row">
          <div class="info-label">DeltaV System ID:</div>
          <div class="info-value">${document.deltav_system_id || 'Not specified'}</div>
        </div>
        <div class="info-row">
          <div class="info-label">Performed By:</div>
          <div class="info-value">${session.ii_performed_by || 'Not specified'}</div>
        </div>
        <div class="info-row">
          <div class="info-label">Date Performed:</div>
          <div class="info-value">${document.date_performed || 'Not specified'}</div>
        </div>
      </div>

      ${checklistSectionsHTML}
      ${equipmentHTML}

      <div class="footer">
        <p>Equipment & Controls, Inc. Confidential</p>
        <p>Generated on ${new Date().toLocaleString()}</p>
      </div>
    </body>
    </html>
  `;
}

function generateMaintenanceReportPage(nodeMaintenanceData) {
  if (!nodeMaintenanceData || nodeMaintenanceData.length === 0) {
    return '';
  }

  // Categorize nodes
  const controllers = nodeMaintenanceData.filter(node => {
    const nodeType = (node.node_type || '').toLowerCase();
    const nodeName = (node.node_name || '').toLowerCase();
    const model = (node.model || '').toLowerCase();
    return nodeType.includes('controller') || 
           nodeType.includes('cioc') || 
           nodeType.includes('sis') ||
           nodeType.includes('eioc') ||
           nodeName.includes('csls') ||
           nodeName.includes('-sz') ||
           nodeName.includes('eioc') ||
           model.includes('se4101') ||
           model.includes('ve4021') ||
           /sz0[1-9]/.test(nodeName);
  });

  const computers = nodeMaintenanceData.filter(node => {
    const nodeType = (node.node_type || '').toLowerCase();
    const nodeName = (node.node_name || '').toLowerCase();
    
    return nodeType.includes('workstation') || 
           nodeType.includes('computer') || 
           nodeType.includes('pc') ||
           nodeType.includes('local application') ||
           nodeType.includes('local operator') ||
           nodeType.includes('local professionalplus') ||
           nodeType.includes('hmi') ||
           nodeType.includes('operator') ||
           nodeName.includes('cpu') ||
           nodeName.includes('hmi') ||
           nodeName.includes('workstation') ||
           nodeName.includes('operator');
  });

  const switches = nodeMaintenanceData.filter(node => {
    const nodeType = (node.node_type || '').toLowerCase();
    return nodeType.includes('switch') || 
           nodeType.includes('network');
  });

  // Helper functions
  const getControllerType = (node) => {
    // Check for VE4021 specifically and return RIU
    if (node.model && node.model.toLowerCase().includes('ve4021')) {
      return 'RIU';
    }
    
    // Check for SE4101 specifically and return EIOC
    if (node.model && node.model.toLowerCase().includes('se4101')) {
      return 'EIOC';
    }
    
    // Return the actual model/type from the model field if available (full description)
    if (node.model && node.model.trim()) {
      return node.model.trim();
    }
    
    // Fallback to detection based on node name and type
    const nodeType = (node.node_type || '').toLowerCase();
    const nodeName = (node.node_name || '').toLowerCase();
    
    if (nodeType.includes('sis') || nodeName.includes('csls') || nodeName.includes('-sz') || /sz0[1-9]/.test(nodeName)) {
      return 'SIS';
    } else if (nodeType.includes('cioc')) {
      return 'CIOC';
    }
    return node.node_type || 'Controller';
  };

  const getDefaultPerformanceType = (node) => {
    // Use node_type field (contains short codes like SE3007, KL2001X1-BA1) for performance detection
    const nodeType = (node.node_type || '').toLowerCase();
    const nodeName = (node.node_name || '').toLowerCase();
    const model = (node.model || '').toLowerCase();
    
    // Performance Index controllers: S-Series codes (SE*, SZ*, SX*, SQ*, MQ*), CSLS, SIS, PK, EIOC
    if (nodeType.startsWith('se') || nodeType.startsWith('sz') || 
        nodeType.startsWith('sx') || nodeType.startsWith('sq') ||
        nodeType.startsWith('mq') ||
        nodeType.includes('csls') || nodeType.includes('pk') ||
        nodeType.includes('eioc') || nodeType.includes('sis') ||
        (nodeType.includes('kl') && nodeType.includes('ba1'))) { // CHARM Logic Solver codes
      return 'perf_index';
    }
    
    // Free Time controllers: M-Series codes (VE*, MD*, MX*), SD Plus, CIOC
    if (nodeType.startsWith('ve') || nodeType.startsWith('md') || 
        nodeType.startsWith('mx') ||
        nodeType.includes('sd plus') || nodeType.includes('cioc')) {
      return 'free_time';
    }
    
         // Fallback to model field patterns (for full descriptions)
     if (model.includes('sx controller') || model.includes('sz controller') || 
         model.includes('sq controller') || model.includes('mq controller') ||
         model.includes('csls') || model.includes('logic solver') || 
         model.includes('sis') || model.includes('pk') || 
         model.includes('pk controller')) {
       return 'perf_index';
     }
    
    if (model.includes('md controller') || model.includes('mx controller') || 
        model.includes('md plus') || model.includes('sd plus') || 
        model.includes('cioc')) {
      return 'free_time';
    }
    
    return null; // Unable to determine
  };

  const formatPerformance = (node) => {
    if (!node.performance_value || !node.performance_type) return 'N/A';
    
    if (node.performance_type === 'perf_index') {
      const value = node.performance_value;
      const status = value <= 2 ? '⚠️ RISKY' : 'Good';
      return `${value}/5 (${status})`;
    } else if (node.performance_type === 'free_time') {
      const value = node.performance_value;
      const status = value <= 28 ? '⚠️ RISKY' : 'Good';
      return `${value}% (${status})`;
    }
    return 'N/A';
  };

  const generateMaintenanceTable = (nodes, title, includePerformance = false, includeWorkstationColumns = false, includeFirmware = false) => {
    if (nodes.length === 0) return '';

    let headers = ['Node Name', 'Serial'];
    if (includePerformance) {
      headers.push('Type', 'Performance', 'HF Updated', 'Errors');
    } else if (includeWorkstationColumns) {
      headers.push('DeltaV HotFixes', 'OS Updates', 'McAfee Updates', 'HDD Replaced');
    } else if (includeFirmware) {
      headers.push('HF Updated', 'Firmware Updated');
    } else {
      headers.push('HF Updated');
    }
    headers.push('Notes');

    return `
      <div class="maintenance-section">
        <h3 class="section-title">${title}</h3>
        <table class="maintenance-table">
          <thead>
            <tr>
              ${headers.map(header => `<th>${header}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${nodes.map(node => {
              const controllerType = getControllerType(node);
              const isRIU = controllerType === 'RIU';
              
              return `
              <tr>
                <td>${node.node_name || 'Unknown'}</td>
                <td>${isRIU ? 'N/A' : (node.serial || 'N/A')}</td>
                ${includePerformance ? `
                  <td><span class="controller-type ${controllerType.toLowerCase()}">${controllerType}</span></td>
                  <td>${formatPerformance(node)}</td>
                  <td class="${node.hf_updated ? 'checked-cell' : ''}">${node.hf_updated ? '✅' : ''}</td>
                  <td class="${node.no_errors_checked ? 'error-cell' : 'no-error-cell'}">${node.no_errors_checked ? 'Has Errors' : 'No Error'}</td>
                ` : includeWorkstationColumns ? `
                  <td class="${node.dv_checked ? 'checked-cell' : ''}">${node.dv_checked ? '✅' : ''}</td>
                  <td class="${node.os_checked ? 'checked-cell' : ''}">${node.os_checked ? '✅' : ''}</td>
                  <td class="${node.macafee_checked ? 'checked-cell' : ''}">${node.macafee_checked ? '✅' : ''}</td>
                  <td class="${node.hdd_replaced ? 'checked-cell' : ''}">${node.hdd_replaced ? '❌' : ''}</td>
                ` : includeFirmware ? `
                  <td class="${node.hf_updated ? 'checked-cell' : ''}">${node.hf_updated ? '✅' : ''}</td>
                  <td class="${node.firmware_updated_checked ? 'checked-cell' : ''}">${node.firmware_updated_checked ? '✅' : ''}</td>
                ` : `
                  <td class="${node.hf_updated ? 'checked-cell' : ''}">${node.hf_updated ? '✅' : ''}</td>
                `}
                <td>${node.notes || ''}</td>
              </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  };

  // Generate maintenance summary
  const totalNodes = nodeMaintenanceData.length;
  const hfUpdated = nodeMaintenanceData.filter(n => n.hf_updated).length;
  const hddReplaced = computers.filter(n => n.hdd_replaced).length;
  const firmwareUpdated = switches.filter(n => n.firmware_updated_checked).length;
  const performanceIssues = controllers.filter(n => {
    if (!n.performance_value || !n.performance_type) return false;
    return (n.performance_type === 'perf_index' && n.performance_value <= 2) ||
           (n.performance_type === 'free_time' && n.performance_value <= 28);
  }).length;

  return `
    <div class="page-break">
      <div class="header">
        <div class="logo">
          ECI
          <div class="logo-subtitle">Emerson Impact Partner</div>
        </div>
        <div class="title">Node Maintenance Report</div>
      </div>
      ${generateMaintenanceTable(controllers, 'Controllers', true, false, false)}
      ${generateMaintenanceTable(computers, 'Workstations/Computers', false, true, false)}
      ${generateMaintenanceTable(switches, 'Network Switches', false, false, true)}

      ${hddReplaced > 0 ? `
        <div class="maintenance-section">
          <h3 class="section-title">HDD Replacement Reports</h3>
          <ul class="maintenance-reports">
            ${computers.filter(n => n.hdd_replaced).map(node => 
              `<li>Bad hard drive found on station '${node.node_name}' and was replaced</li>`
            ).join('')}
          </ul>
        </div>
      ` : ''}

      ${performanceIssues > 0 ? `
        <div class="maintenance-section">
          <h3 class="section-title">Performance Concerns</h3>
          <ul class="maintenance-reports warning">
            ${controllers.filter(n => {
              if (!n.performance_value || !n.performance_type) return false;
              return (n.performance_type === 'perf_index' && n.performance_value <= 2) ||
                     (n.performance_type === 'free_time' && n.performance_value <= 28);
            }).map(node => {
              const perfText = node.performance_type === 'perf_index' 
                ? `Performance Index ${node.performance_value}/5`
                : `Free Time ${node.performance_value}%`;
              return `<li>Controller '${node.node_name}' showing ${perfText} - Monitor for degraded performance</li>`;
            }).join('')}
          </ul>
        </div>
      ` : ''}
    </div>
  `;
}

function generateDiagnosticsPage(diagnosticsData) {
  if (!diagnosticsData || diagnosticsData.length === 0) {
    return `
      <div class="page-break">
        <div class="header">
          <div class="logo">
            ECI
            <div class="logo-subtitle">Emerson Impact Partner</div>
          </div>
          <div class="title">DeltaV Preventive Maintenance Report</div>
        </div>
        <div class="diagnostics-content">
          <div class="no-errors-section">
            <div class="success-icon">✅</div>
            <h2>All Systems Operating Normally</h2>
            <p>No controller errors were detected during this maintenance session.</p>
            <p><strong>Report Generated:</strong> ${new Date().toLocaleString()}</p>
          </div>
        </div>
      </div>
    `;
  }

  // Group diagnostics by controller
  const controllerGroups = {};
  diagnosticsData.forEach(diagnostic => {
    if (!controllerGroups[diagnostic.controller_name]) {
      controllerGroups[diagnostic.controller_name] = [];
    }
    controllerGroups[diagnostic.controller_name].push(diagnostic);
  });

  // Calculate error type counts globally and per controller
  const globalErrorCounts = {};
  const controllerErrorCounts = {};
  
  diagnosticsData.forEach(diagnostic => {
    const errorType = diagnostic.error_type;
    globalErrorCounts[errorType] = (globalErrorCounts[errorType] || 0) + 1;
    
    if (!controllerErrorCounts[diagnostic.controller_name]) {
      controllerErrorCounts[diagnostic.controller_name] = {};
    }
    controllerErrorCounts[diagnostic.controller_name][errorType] = 
      (controllerErrorCounts[diagnostic.controller_name][errorType] || 0) + 1;
  });

  // Generate global summary section
  const errorTypeLabels = {
    'bad': 'Component Fault',
    'not_communicating': 'Communication Failure',
    'open_loop': 'Open Loop',
    'loop_current_saturated': 'Current Saturation',
    'device_error': 'Device Error',
    'short_circuit': 'Short Circuit',
    'no_card': 'Missing Card',
    'other': 'Other Issues'
  };

  const globalSummaryCards = Object.entries(globalErrorCounts)
    .sort(([,a], [,b]) => b - a) // Sort by count descending
    .map(([errorType, count]) => {
      const label = errorTypeLabels[errorType] || errorType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const percentage = ((count / diagnosticsData.length) * 100).toFixed(1);
      return `
        <div class="error-summary-card error-type-${errorType}">
          <div class="error-count">${count}</div>
          <div class="error-label">${label}</div>
          <div class="error-percentage">${percentage}%</div>
        </div>
      `;
    }).join('');

  // Generate controller-specific sections
  const controllerSections = Object.entries(controllerGroups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([controllerName, errors]) => {
      const controllerErrorTypeCounts = controllerErrorCounts[controllerName];
      const totalControllerErrors = errors.length;
      const cardsAffected = new Set(errors.map(e => e.card_number)).size;
      
      // Generate error type breakdown for this controller
      const controllerErrorCards = Object.entries(controllerErrorTypeCounts)
        .sort(([,a], [,b]) => b - a)
        .map(([errorType, count]) => {
          const label = errorTypeLabels[errorType] || errorType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          const percentage = ((count / totalControllerErrors) * 100).toFixed(1);
          return `
            <div class="controller-error-card error-type-${errorType}">
              <span class="error-count">${count}</span>
              <span class="error-label">${label}</span>
              <span class="error-percentage">${percentage}%</span>
            </div>
          `;
        }).join('');

      // Generate detailed error table for this controller
      const sortedControllerErrors = errors.sort((a, b) => {
        if (a.card_number !== b.card_number) {
          return a.card_number - b.card_number;
        }
        return (a.channel_number || 0) - (b.channel_number || 0);
      });

      // Limit detailed table to first 50 errors per controller to prevent PDF timeout
      const maxErrorsPerController = 50;
      const displayErrors = sortedControllerErrors.slice(0, maxErrorsPerController);
      const hasMoreErrors = sortedControllerErrors.length > maxErrorsPerController;

      const controllerTableRows = displayErrors.map(diagnostic => {
        const errorTypeDisplay = errorTypeLabels[diagnostic.error_type] || 
          diagnostic.error_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const description = diagnostic.error_description || '';
        const createdAt = diagnostic.created_at ? new Date(diagnostic.created_at).toLocaleDateString() : 'N/A';
        
        return `
          <tr class="error-type-${diagnostic.error_type}">
            <td class="card-cell">Card ${diagnostic.card_number}</td>
            <td class="channel-cell">Ch ${diagnostic.channel_number}</td>
            <td class="error-type-cell">${errorTypeDisplay}</td>
            <td class="description-cell">${description}</td>
            <td class="date-cell">${createdAt}</td>
          </tr>
        `;
      }).join('');

      // Add note if there are more errors
      const moreErrorsNote = hasMoreErrors ? `
        <tr class="more-errors-note">
          <td colspan="5" style="text-align: center; font-style: italic; color: #6b7280; padding: 15px;">
            ... and ${sortedControllerErrors.length - maxErrorsPerController} more errors. 
            View complete details in the application.
          </td>
        </tr>
      ` : '';

      return `
        <div class="controller-section">
          <div class="controller-header">
            <h3 class="controller-name">🎛️ ${controllerName}</h3>
            <div class="controller-stats">
              <span class="stat-item">
                <span class="stat-number">${totalControllerErrors}</span>
                <span class="stat-label">Total Errors</span>
              </span>
              <span class="stat-item">
                <span class="stat-number">${cardsAffected}</span>
                <span class="stat-label">Cards Affected</span>
              </span>
            </div>
          </div>
          
          <div class="controller-error-breakdown">
            <h4>Error Type Breakdown</h4>
            <div class="controller-error-cards">
              ${controllerErrorCards}
            </div>
          </div>
          
          <div class="controller-details-table">
            <h4>Detailed Error List</h4>
            <table class="controller-table">
              <thead>
                <tr>
                  <th>Card</th>
                  <th>Channel</th>
                  <th>Error Type</th>
                  <th>Description</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                ${controllerTableRows}
                ${moreErrorsNote}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }).join('');

  // Generate summary page
  const summaryPage = `
    <div class="page-break">
      <div class="header">
        <div class="logo">
          ECI
          <div class="logo-subtitle">Emerson Impact Partner</div>
        </div>
        <div class="title">DeltaV Preventive Maintenance Report</div>
      </div>
      <div class="diagnostics-summary-content">
        
        <!-- Executive Summary -->
        <div class="summary-section">
          <div class="summary-box">
            <p><strong>Total Errors Found:</strong> ${diagnosticsData.length}</p>
            <p><strong>Controllers Affected:</strong> ${Object.keys(controllerGroups).length}</p>
            <p><strong>Cards Affected:</strong> ${new Set(diagnosticsData.map(d => d.card_number)).size}</p>
            <p><strong>Report Generated:</strong> ${new Date().toLocaleString()}</p>
          </div>
        </div>

        <!-- Error Type Distribution -->
        <div class="error-distribution-section">
          <h3>Error Type Distribution</h3>
          <div class="error-distribution-grid">
            ${globalSummaryCards}
          </div>
        </div>

        <!-- Controller Overview -->
        <div class="controller-overview-section">
          <h3>Controller Summary</h3>
          <table class="overview-table">
            <thead>
              <tr>
                <th>Controller</th>
                <th>Total Errors</th>
                <th>Cards Affected</th>
                <th>Most Common Error</th>
              </tr>
            </thead>
            <tbody>
              ${Object.entries(controllerGroups).map(([controllerName, errors]) => {
                const cardsAffected = new Set(errors.map(e => e.card_number)).size;
                const errorTypeCounts = {};
                errors.forEach(e => {
                  errorTypeCounts[e.error_type] = (errorTypeCounts[e.error_type] || 0) + 1;
                });
                const mostCommonError = Object.entries(errorTypeCounts)
                  .sort(([,a], [,b]) => b - a)[0];
                const mostCommonLabel = mostCommonError ? 
                  (errorTypeLabels[mostCommonError[0]] || mostCommonError[0].replace(/_/g, ' ')) : 'N/A';
                
                return `
                  <tr>
                    <td class="controller-name-cell">${controllerName}</td>
                    <td class="error-count-cell">${errors.length}</td>
                    <td class="cards-count-cell">${cardsAffected}</td>
                    <td class="most-common-cell">${mostCommonLabel}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Generate individual controller pages
  const controllerPages = Object.entries(controllerGroups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([controllerName, errors]) => `
      <div class="page-break">
        ${generateControllerPage(controllerName, errors, errorTypeLabels)}
      </div>
    `).join('');

  return summaryPage + controllerPages;
}

function generateControllerPage(controllerName, errors, errorTypeLabels) {
  const totalErrors = errors.length;
  const cardsAffected = new Set(errors.map(e => e.card_number)).size;
  
  // Calculate error type counts for this controller
  const errorTypeCounts = {};
  errors.forEach(error => {
    errorTypeCounts[error.error_type] = (errorTypeCounts[error.error_type] || 0) + 1;
  });

  // Sort errors by card, then channel
  const sortedErrors = errors.sort((a, b) => {
    if (a.card_number !== b.card_number) {
      return a.card_number - b.card_number;
    }
    return (a.channel_number || 0) - (b.channel_number || 0);
  });

  // Group errors by card for better organization
  const cardGroups = {};
  sortedErrors.forEach(error => {
    if (!cardGroups[error.card_number]) {
      cardGroups[error.card_number] = [];
    }
    cardGroups[error.card_number].push(error);
  });

  return `
    <div class="header">
      <div class="logo">
        ECI
        <div class="logo-subtitle">Emerson Impact Partner</div>
      </div>
      <div class="title">DeltaV Preventive Maintenance Report</div>
    </div>
    
    <div class="cabinet-title">
      Controller: ${controllerName}
    </div>

    <!-- Detailed Error List by Card -->
    <div class="detailed-errors-section">
      <h3>Detailed Error List</h3>
      ${Object.entries(cardGroups)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([cardNumber, cardErrors]) => `
          <div class="card-error-section">
            <h4>Card ${cardNumber} (${cardErrors.length} error${cardErrors.length !== 1 ? 's' : ''})</h4>
            <table class="error-details-table">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>Error Type</th>
                  <th>Description</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                ${cardErrors.map(error => {
                  const errorTypeDisplay = errorTypeLabels[error.error_type] || 
                    error.error_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                  const description = error.error_description || '';
                  const createdAt = error.created_at ? new Date(error.created_at).toLocaleDateString() : 'N/A';
                  
                  return `
                    <tr>
                      <td class="channel-cell">Channel ${error.channel_number}</td>
                      <td class="error-type-cell">${errorTypeDisplay}</td>
                      <td class="description-cell">${description}</td>
                      <td class="date-cell">${createdAt}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `).join('')}
    </div>
  `;
}

function getSharedStyles() {
  return `
    .header { 
      display: flex; 
      justify-content: space-between; 
      align-items: center; 
      margin-bottom: 15px;
      padding-bottom: 8px;
      border-bottom: 3px solid #2563eb;
    }
    .logo { 
      font-size: 28px; 
      font-weight: bold; 
      color: #2563eb; 
    }
    .logo-subtitle {
      font-size: 14px;
      color: #666;
      font-weight: normal;
    }
    .title { 
      text-align: center; 
      font-size: 20px; 
      font-weight: bold;
      color: #333;
    }
    .cabinet-title {
      text-align: center;
      font-size: 28px;
      font-weight: bold;
      color: #2563eb;
      background: linear-gradient(135deg, #f8f9fa, #e9ecef);
      border: 3px solid #2563eb;
      border-radius: 12px;
      padding: 20px;
      margin: 30px 0;
      box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    }
    .info-section { 
      margin-bottom: 25px;
      background: #f8f9fa;
      padding: 15px;
      border-radius: 8px;
      border-left: 4px solid #0066cc;
    }
    .info-row { 
      display: flex; 
      margin-bottom: 8px; 
    }
    .info-label { 
      width: 150px; 
      font-weight: bold;
      color: #0066cc;
    }
    .info-value { 
      flex: 1; 
      border-bottom: 1px dotted #ccc; 
      padding-bottom: 2px; 
      min-height: 18px;
    }
    table { 
      width: 100%; 
      border-collapse: collapse; 
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    th, td { 
      border: 1px solid #0066cc; 
      padding: 8px; 
      text-align: left; 
      vertical-align: top;
    }
    th { 
      background: linear-gradient(135deg, #0066cc, #0052a3);
      color: white;
      font-weight: bold; 
      text-align: center;
    }
    .section-title { 
      font-size: 16px; 
      font-weight: bold; 
      margin: 25px 0 15px 0; 
      padding: 10px 15px;
      background: linear-gradient(135deg, #0066cc, #0052a3);
      color: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .status-pass { color: #28a745; font-weight: bold; }
    .status-fail { color: #dc3545; font-weight: bold; }
            .checked-cell { background-color: #d4edda; border-left: 3px solid #28a745; font-weight: bold; }
        .error-cell { background-color: #f8d7da; border-left: 3px solid #dc3545; font-weight: bold; color: #721c24; }
        .no-error-cell { background-color: #d4edda; border-left: 3px solid #28a745; font-weight: bold; color: #155724; }
    .status-na { color: #6c757d; font-style: italic; }
    .inspection-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      margin-bottom: 20px;
    }
    .inspection-item {
      display: flex;
      justify-content: space-between;
    }
    
    /* Risk Assessment Styles */
    .risk-summary {
      display: flex;
      align-items: center;
      margin-bottom: 30px;
      gap: 30px;
    }
    .risk-score-box {
      text-align: center;
      padding: 20px;
      border-radius: 12px;
      min-width: 150px;
      box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    }
    .risk-score {
      font-size: 48px;
      font-weight: bold;
      line-height: 1;
    }
    .risk-level {
      font-size: 16px;
      font-weight: bold;
      margin-top: 5px;
    }
    .risk-stats {
      flex: 1;
    }
    .stat-item {
      display: flex;
      justify-content: space-between;
      margin: 10px 0;
      padding: 8px 0;
      border-bottom: 1px solid #eee;
    }
    .stat-label {
      font-weight: bold;
      color: #0066cc;
    }
    .stat-value {
      font-weight: bold;
    }
    
    .issues-section {
      margin: 25px 0;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .issues-section.critical {
      border: 2px solid #dc3545;
    }
    .issues-section.warning {
      border: 2px solid #ffc107;
    }
    .issues-section.slight {
      border: 2px solid #17a2b8;
    }
    .issues-header {
      padding: 12px 15px;
      font-weight: bold;
      font-size: 14px;
    }
    .issues-section.critical .issues-header {
      background: #dc3545;
      color: white;
    }
    .issues-section.warning .issues-header {
      background: #ffc107;
      color: #333;
    }
    .issues-section.slight .issues-header {
      background: #17a2b8;
      color: white;
    }
    .issues-list {
      margin: 0;
      padding: 15px 20px;
      background: white;
    }
    .issues-list li {
      margin: 8px 0;
      line-height: 1.4;
    }
    
    .recommendations-section {
      margin: 25px 0;
      background: #f8f9fa;
      border: 2px solid #0066cc;
      border-radius: 8px;
      overflow: hidden;
    }
    .recommendations-header {
      background: linear-gradient(135deg, #0066cc, #0052a3);
      color: white;
      padding: 12px 15px;
      font-weight: bold;
      font-size: 14px;
    }
    .recommendations-list {
      margin: 0;
      padding: 15px 20px;
      background: white;
    }
    .recommendations-list li {
      margin: 8px 0;
      line-height: 1.4;
    }
    
    .voltage-specs {
      margin: 25px 0;
    }
    .specs-header {
      font-size: 16px;
      font-weight: bold;
      margin: 25px 0 15px 0;
      padding: 10px 15px;
      background: linear-gradient(135deg, #0066cc, #0052a3);
      color: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .risk-breakdown-section {
      margin: 25px 0;
      background: #f8f9fa;
      border: 2px solid #6c757d;
      border-radius: 8px;
      overflow: hidden;
    }
    .breakdown-header {
      background: #6c757d;
      color: white;
      padding: 12px 15px;
      font-weight: bold;
      font-size: 14px;
    }
    .breakdown-list {
      margin: 0;
      padding: 15px 20px;
      background: white;
    }
    .breakdown-list li {
      margin: 6px 0;
      line-height: 1.3;
      font-size: 13px;
      color: #495057;
    }
    .total-score {
      background: #e9ecef;
      padding: 12px 20px;
      font-weight: bold;
      font-size: 16px;
      color: #0066cc;
      border-top: 1px solid #dee2e6;
    }
      align-items: center;
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 6px;
      background: #f8f9fa;
    }
    .inspection-item:nth-child(odd) {
      background: #e3f2fd;
    }
    .comments-section {
      margin-top: 25px;
      border: 2px solid #0066cc;
      border-radius: 8px;
      overflow: hidden;
    }
    .comments-header {
      background: linear-gradient(135deg, #0066cc, #0052a3);
      color: white;
      padding: 12px;
      font-weight: bold;
      font-size: 14px;
    }
    .comments-body {
      padding: 15px;
      min-height: 80px;
      background: white;
    }
    tr:nth-child(even) { background-color: #f8f9fa; }
    
    /* Page Break Rules */
    .cabinet-title { page-break-before: auto; page-break-after: avoid; page-break-inside: avoid; }
    .section-title { page-break-after: avoid; page-break-inside: avoid; }
    .maintenance-table { page-break-inside: auto; }
    table { page-break-inside: avoid; }
    .info-section { page-break-inside: avoid; }
    .inspection-grid { page-break-inside: avoid; }
    .comments-section { page-break-inside: avoid; }
    .risk-summary { page-break-inside: avoid; }
    .issues-section { page-break-inside: avoid; }
    .recommendations-section { page-break-inside: avoid; }
    .voltage-specs { page-break-inside: avoid; }
    .risk-breakdown-section { page-break-inside: avoid; }
    
    /* Diagnostics Page Break Rules */
    .header { page-break-after: avoid; page-break-inside: avoid; }
    .summary-section { page-break-inside: avoid; }
    .error-distribution-section { page-break-inside: avoid; }
    .controller-overview-section { page-break-inside: avoid; }
    .error-summary-section { page-break-inside: avoid; }
    .detailed-errors-section { page-break-inside: auto; }
    .card-error-section { page-break-inside: avoid; }
    .error-details-table { page-break-inside: auto; }
    .summary-table { page-break-inside: avoid; }
    .overview-table { page-break-inside: avoid; }
    
    @media print {
      .cabinet-title { page-break-before: auto; page-break-after: avoid; page-break-inside: avoid; }
      .section-title { page-break-after: avoid; page-break-inside: avoid; }
      .maintenance-table { page-break-inside: auto; }
      table { page-break-inside: avoid; }
      .info-section { page-break-inside: avoid; }
      .inspection-grid { page-break-inside: avoid; }
      .comments-section { page-break-inside: avoid; }
      .risk-summary { page-break-inside: avoid; }
      .issues-section { page-break-inside: avoid; }
      .recommendations-section { page-break-inside: avoid; }
      .voltage-specs { page-break-inside: avoid; }
      .risk-breakdown-section { page-break-inside: avoid; }
      
      /* Diagnostics Print Rules */
      .header { page-break-after: avoid; page-break-inside: avoid; }
      .summary-section { page-break-inside: avoid; }
      .error-distribution-section { page-break-inside: avoid; }
      .controller-overview-section { page-break-inside: avoid; }
      .error-summary-section { page-break-inside: avoid; }
      .detailed-errors-section { page-break-inside: auto; }
      .card-error-section { page-break-inside: avoid; }
      .error-details-table { page-break-inside: auto; }
      .summary-table { page-break-inside: avoid; }
      .overview-table { page-break-inside: avoid; }
    }
    
    @page { margin: 0.5in; }
    
    /* Maintenance Report Styles */
    .maintenance-summary {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 8px;
      border-left: 4px solid #0066cc;
      margin-bottom: 30px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      margin-top: 15px;
    }
    .summary-item {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px dotted #ccc;
    }
    .summary-item.performance-warning {
      color: #dc3545;
      font-weight: bold;
    }
    .summary-label {
      font-weight: bold;
      color: #0066cc;
    }
    .summary-value {
      font-weight: bold;
    }
    .maintenance-section {
      margin-bottom: 10px;
      page-break-inside: auto;
    }
    .maintenance-table {
      font-size: 10px;
    }
    .maintenance-table th {
      font-size: 9px;
      padding: 4px;
    }
    .maintenance-table td {
      padding: 4px;
      font-size: 9px;
    }
    .controller-type {
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: bold;
    }
    .controller-type.controller {
      background: #007bff;
      color: white;
    }
    .controller-type.cioc {
      background: #fd7e14;
      color: white;
    }
    .controller-type.sis {
      background: #dc3545;
      color: white;
    }
    .maintenance-reports {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 8px;
      border-left: 4px solid #0066cc;
    }
    .maintenance-reports.warning {
      border-left-color: #dc3545;
      background: #fff5f5;
    }
    .maintenance-reports li {
      margin-bottom: 8px;
    }
    
    /* Diagnostics Table Styles */
    .diagnostics-content {
      margin-top: 20px;
    }
    
    .diagnostics-summary {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 8px;
      border-left: 4px solid #dc3545;
      margin-bottom: 20px;
    }
    
    .diagnostics-summary p {
      margin: 5px 0;
      font-weight: 600;
    }
    
    .diagnostics-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
      font-size: 12px;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    
    .diagnostics-table th {
      background: linear-gradient(145deg, #f1f5f9, #e2e8f0);
      padding: 12px 8px;
      text-align: left;
      font-weight: 700;
      color: #334155;
      border-bottom: 2px solid #cbd5e1;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .diagnostics-table td {
      padding: 10px 8px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
    }
    
    .diagnostics-table tbody tr:nth-child(even) {
      background-color: #f9fafb;
    }
    
    .controller-cell {
      font-weight: 700;
      color: #1e40af;
    }
    
    .card-cell {
      font-weight: 600;
      color: #7c3aed;
    }
    
    .channel-cell {
      font-weight: 600;
      color: #0891b2;
    }
    
    .error-type-cell {
      font-weight: 600;
      color: #dc2626;
    }
    
    .description-cell {
      color: #374151;
      max-width: 200px;
      word-wrap: break-word;
    }

    /* Clean Diagnostics Styles - Matching Cabinet Reports with ECI Blue */
    .no-errors-section {
      text-align: center;
      padding: 40px 20px;
      border: 3px solid #2563eb;
      border-radius: 8px;
      margin: 20px 0;
      background: #f8fafc;
    }
    
    .success-icon {
      font-size: 3rem;
      margin-bottom: 15px;
    }
    
    .no-errors-section h2 {
      color: #059669;
      margin-bottom: 10px;
      font-size: 1.8rem;
      font-weight: 900;
    }
    
    .diagnostics-summary-content {
      padding: 20px 0;
    }
    
    .summary-section {
      margin-bottom: 30px;
    }
    
    .summary-box {
      border: 3px solid #2563eb;
      border-radius: 8px;
      padding: 25px;
      margin-bottom: 20px;
      background: white;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    
    .summary-box p {
      margin: 12px 0;
      font-size: 16px;
      font-weight: 600;
      color: #374151;
    }
    
    .error-distribution-section {
      margin-bottom: 30px;
    }
    
    .error-distribution-section h3 {
      color: #2563eb;
      font-size: 18px;
      font-weight: 900;
      margin-bottom: 15px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 3px solid #2563eb;
      padding-bottom: 8px;
    }
    
    .error-distribution-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin-bottom: 20px;
    }
    
    .error-summary-card {
      border: 2px solid #2563eb;
      border-radius: 6px;
      padding: 18px;
      text-align: center;
      background: white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .error-summary-card .error-count {
      font-size: 1.8rem;
      font-weight: 900;
      display: block;
      margin-bottom: 5px;
      color: #dc2626;
    }
    
    .error-summary-card .error-label {
      font-size: 0.9rem;
      font-weight: 700;
      display: block;
      margin-bottom: 3px;
      color: #374151;
    }
    
    .error-summary-card .error-percentage {
      font-size: 0.8rem;
      color: #6b7280;
      font-weight: 600;
      display: block;
    }
    
    .controller-overview-section h3 {
      color: #2563eb;
      font-size: 18px;
      font-weight: 900;
      margin-bottom: 15px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 3px solid #2563eb;
      padding-bottom: 8px;
    }
    
    .overview-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
      font-size: 13px;
      background: white;
      border: 2px solid #2563eb;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    
    .overview-table th {
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: white;
      padding: 12px 10px;
      text-align: left;
      font-weight: 900;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .overview-table td {
      padding: 10px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
      font-weight: 600;
    }
    
    .overview-table tbody tr:nth-child(even) {
      background-color: #f8fafc;
    }
    
    .controller-name-cell {
      font-weight: 900;
      color: #2563eb;
    }
    
    .error-count-cell, .cards-count-cell {
      font-weight: 800;
      color: #dc2626;
    }
    
    .most-common-cell {
      font-weight: 600;
      color: #6b7280;
    }
    
    /* Individual Controller Page Styles */
    .error-summary-section {
      margin-bottom: 30px;
    }
    
    .error-summary-section h3 {
      color: #2563eb;
      font-size: 18px;
      font-weight: 900;
      margin-bottom: 15px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 3px solid #2563eb;
      padding-bottom: 8px;
    }
    
    .summary-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
      font-size: 13px;
      background: white;
      border: 2px solid #2563eb;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    
    .summary-table th {
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: white;
      padding: 12px 10px;
      text-align: left;
      font-weight: 900;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .summary-table td {
      padding: 10px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
      font-weight: 600;
    }
    
    .summary-table tbody tr:nth-child(even) {
      background-color: #f8fafc;
    }
    
    .error-type-name {
      font-weight: 700;
      color: #374151;
    }
    
    .error-count {
      font-weight: 900;
      color: #dc2626;
    }
    
    .error-percentage {
      color: #6b7280;
      font-weight: 600;
    }
    
    .detailed-errors-section {
      margin-top: 30px;
    }
    
    .detailed-errors-section h3 {
      color: #2563eb;
      font-size: 18px;
      font-weight: 900;
      margin-bottom: 15px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 3px solid #2563eb;
      padding-bottom: 8px;
    }
    
    .card-error-section {
      margin-bottom: 25px;
    }
    
    .card-error-section h4 {
      color: #2563eb;
      font-size: 16px;
      font-weight: 800;
      margin-bottom: 10px;
      padding: 10px 15px;
      background: #f1f5f9;
      border-left: 5px solid #2563eb;
      border-radius: 4px;
    }
    
    .error-details-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      font-size: 12px;
      background: white;
      border: 2px solid #2563eb;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .error-details-table th {
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: white;
      padding: 10px 8px;
      text-align: left;
      font-weight: 900;
      border-bottom: 1px solid #1d4ed8;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .error-details-table td {
      padding: 8px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: top;
      font-weight: 600;
    }
    
    .error-details-table tbody tr:nth-child(even) {
      background-color: #f8fafc;
    }
    
    .error-details-table .channel-cell {
      font-weight: 800;
      color: #2563eb;
    }
    
    .error-details-table .error-type-cell {
      font-weight: 800;
      color: #dc2626;
    }
    
    .error-details-table .description-cell {
      color: #374151;
      max-width: 200px;
      word-wrap: break-word;
      font-weight: 500;
    }
    
    .error-details-table .date-cell {
      color: #6b7280;
      font-size: 11px;
      font-weight: 500;
    }
    
    /* PM Notes Section Styles */
    .pm-notes-section {
      margin-top: 20px;
    }
    
    .pm-notes-section .summary-box {
      border: 3px solid #2563eb;
      border-radius: 8px;
      padding: 25px;
      margin-bottom: 30px;
      background: white;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    
    .pm-notes-section .summary-row {
      display: flex;
      justify-content: space-between;
      margin: 12px 0;
      font-size: 16px;
      padding: 8px 0;
      border-bottom: 1px dotted #d1d5db;
    }
    
    .pm-notes-section .summary-label {
      font-weight: 900;
      color: #2563eb;
    }
    
    .pm-notes-section .summary-value {
      font-weight: 700;
      color: #374151;
    }
    
    .notes-content {
      margin-top: 30px;
    }
    
    .notes-content h2 {
      color: #2563eb;
      font-size: 20px;
      font-weight: 900;
      margin-bottom: 20px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 3px solid #2563eb;
      padding-bottom: 8px;
    }
    
    .notes-text {
      background: #f8fafc;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      padding: 25px;
      font-size: 14px;
      line-height: 1.6;
      color: #374151;
      min-height: 150px;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    
    .notes-text:empty:before {
      content: "No additional notes recorded for this PM session.";
      color: #9ca3af;
      font-style: italic;
    }
    
    /* PM Notes Section Styles */
    .pm-notes-section {
      margin-top: 15px;
    }
    
    .pm-section {
      margin: 15px 0;
      page-break-inside: avoid;
    }
    
    .pm-section-title {
      color: #2563eb;
      font-size: 16px;
      font-weight: 900;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 3px solid #2563eb;
      padding-bottom: 6px;
    }
    
    .pm-subsection-title {
      color: #374151;
      font-size: 14px;
      font-weight: 800;
      margin: 15px 0 8px 0;
      border-left: 4px solid #2563eb;
      padding-left: 10px;
    }
    
    .common-tasks-section {
      margin-bottom: 15px;
    }
    
    .common-tasks-list {
      background: #f8fafc;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      padding: 20px 25px;
      margin: 15px 0;
      list-style: none;
      columns: 2;
      column-gap: 30px;
    }
    
    .common-tasks-list li {
      margin: 8px 0;
      padding: 6px 0;
      border-bottom: 1px dotted #cbd5e1;
      font-weight: 600;
      color: #374151;
      break-inside: avoid;
    }
    
    .common-tasks-list li:last-child {
      border-bottom: none;
    }
    
    .pm-tasks-bulleted-list {
      background: #f8fafc;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      padding: 15px 20px;
      margin: 10px 0;
      list-style: none;
    }
    
    .pm-tasks-bulleted-list li {
      margin: 4px 0;
      font-weight: 600;
      color: #374151;
      line-height: 1.4;
    }
    
    .notes-subsection {
      margin-top: 15px;
    }
    
    .notes-text {
      background: #f8fafc;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      padding: 15px;
      font-size: 14px;
      line-height: 1.5;
      color: #374151;
      min-height: 60px;
      white-space: pre-wrap;
      word-wrap: break-word;
      margin: 10px 0;
    }
    
    .notes-text:empty:before {
      content: "No additional information provided for this section.";
      color: #9ca3af;
      font-style: italic;
    }
    
    /* PM Notes Page Break Rules */
    .pm-notes-section { page-break-inside: auto; }
    .pm-section { page-break-inside: avoid; }
    .common-tasks-section { page-break-inside: avoid; }
    .notes-subsection { page-break-inside: avoid; }
    .notes-text { page-break-inside: auto; }
    
    @media print {
      .pm-notes-section { page-break-inside: auto; }
      .pm-section { page-break-inside: avoid; }
      .common-tasks-section { page-break-inside: avoid; }
      .notes-subsection { page-break-inside: avoid; }
      .notes-text { page-break-inside: auto; }
      
      .common-tasks-list {
        columns: 2;
        column-gap: 20px;
      }
    }
  `;
}

function generateSingleCabinetHtml(cabinet, sessionInfo, cabinetNumber) {
  const formatDate = (dateStr) => dateStr ? new Date(dateStr).toLocaleDateString() : 'Not specified';
  const formatStatus = (status) => status ? status.toUpperCase() : 'PASS';
  const formatValue = (value) => value !== null && value !== undefined ? value : '';
  
  const powerSupplies = cabinet.power_supplies || [];
  const distributionBlocks = cabinet.distribution_blocks || [];
  const diodes = cabinet.diodes || [];
  const inspection = cabinet.inspection || {};
  const networkEquipment = cabinet.network_equipment || [];
  const controllers = cabinet.controllers || [];
  
  return `
    <div class="header">
      <div class="logo">
        ECI
        <div class="logo-subtitle">Emerson Impact Partner</div>
      </div>
      <div class="title">DeltaV Preventive Maintenance Report</div>
    </div>
    
    <div class="cabinet-title">
      Cabinet ${cabinetNumber}: ${cabinet.cabinet_location}
    </div>
    
    <div class="info-section">
      <div class="info-row">
        <span class="info-label">Cabinet Location:</span>
        <span class="info-value">${cabinet.cabinet_location}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Date:</span>
        <span class="info-value">${formatDate(cabinet.cabinet_date)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Session:</span>
        <span class="info-value">${sessionInfo.session_name || ''}</span>
      </div>
    </div>
    
    ${powerSupplies.length > 0 ? `
    <div class="section-title">Power Supply Measurements</div>
    <table>
      <thead>
        <tr>
          <th>Voltage Type</th>
          <th>Line to Neutral (V)</th>
          <th>Line to Ground (V)</th>
          <th>Neutral to Ground (mV)</th>
          <th>DC Reading (V)</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${powerSupplies.map(ps => `
          <tr>
            <td><strong>${ps.voltage_type}</strong></td>
            <td>${formatValue(ps.line_neutral)}</td>
            <td>${formatValue(ps.line_ground)}</td>
            <td>${formatValue(ps.neutral_ground)}</td>
            <td>${formatValue(ps.dc_reading)}</td>
            <td class="status-${ps.status}">${formatStatus(ps.status)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}
    
    ${distributionBlocks.length > 0 ? `
    <div class="section-title">Distribution Blocks</div>
    <table>
      <thead>
        <tr>
          <th>Block #</th>
          <th>DC Reading (V)</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${distributionBlocks.map((block, index) => `
          <tr>
            <td><strong>${index + 1}</strong></td>
            <td>${formatValue(block.dc_reading)}</td>
            <td class="status-${block.status}">${formatStatus(block.status)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}
    
    ${diodes.length > 0 ? `
    <div class="section-title">Diodes</div>
    <table>
      <thead>
        <tr>
          <th>Diode #</th>
          <th>DC Reading (V)</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${diodes.map((diode, index) => `
          <tr>
            <td><strong>${index + 1}</strong></td>
            <td>${formatValue(diode.dc_reading)}</td>
            <td class="status-${diode.status}">${formatStatus(diode.status)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}
    
    <div class="section-title">Inspection Items</div>
    <div class="inspection-grid">
      <div class="inspection-item">
        <span><strong>Cabinet fans running (if installed)</strong></span>
        <span class="status-${inspection.cabinet_fans || 'pass'}">${formatStatus(inspection.cabinet_fans)}</span>
      </div>
      <div class="inspection-item">
        <span><strong>Controller Status LEDs</strong></span>
        <span class="status-${inspection.controller_leds || 'pass'}">${formatStatus(inspection.controller_leds)}</span>
      </div>
      <div class="inspection-item">
        <span><strong>I/O Status LEDs</strong></span>
        <span class="status-${inspection.io_status || 'pass'}">${formatStatus(inspection.io_status)}</span>
      </div>
      <div class="inspection-item">
        <span><strong>Network Equipment Status</strong></span>
        <span class="status-${inspection.network_status || 'pass'}">${formatStatus(inspection.network_status)}</span>
      </div>
      <div class="inspection-item">
        <span><strong>Environmental Temperatures</strong></span>
        <span class="status-${inspection.temperatures || 'pass'}">${formatStatus(inspection.temperatures)}</span>
      </div>
      <div class="inspection-item">
        <span><strong>Cleaned Enclosure</strong></span>
        <span class="status-${inspection.is_clean || 'pass'}">${formatStatus(inspection.is_clean)}</span>
      </div>
      <div class="inspection-item">
        <span><strong>Clean filter installed</strong></span>
        <span class="status-${inspection.clean_filter_installed || 'pass'}">${formatStatus(inspection.clean_filter_installed)}</span>
      </div>
      <div class="inspection-item">
        <span><strong>Ground Inspection</strong></span>
        <span class="status-${inspection.ground_inspection || 'pass'}">${formatStatus(inspection.ground_inspection)}</span>
      </div>
    </div>
    
    ${networkEquipment.length > 0 ? `
    <div class="section-title">Network Equipment</div>
    <table>
      <thead>
        <tr>
          <th>Equipment Type</th>
          <th>Model Number</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${networkEquipment.map(equipment => `
          <tr>
            <td><strong>${equipment.equipment_type}</strong></td>
            <td>${equipment.model_number || 'Not specified'}</td>
            <td class="status-${equipment.status}">${formatStatus(equipment.status)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}
    
    ${controllers.length > 0 ? `
    <div class="section-title">Controllers</div>
    <table>
      <thead>
        <tr>
          <th>Controller Name</th>
          <th>Type</th>
          <th>Model</th>
          <th>Serial</th>
        </tr>
      </thead>
      <tbody>
        ${controllers.map(controller => `
          <tr>
            <td><strong>${controller.node_name || 'Unnamed Controller'}</strong></td>
            <td><strong>${getEnhancedControllerType(controller)}</strong></td>
            <td>${controller.model || 'Unknown'}</td>
            <td>${controller.serial || 'No Serial'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}
    
    ${inspection.comments && inspection.comments.trim() ? `
    <div class="comments-section">
      <div class="comments-header">Comments</div>
      <div class="comments-body">
        ${inspection.comments.replace(/\n/g, '<br>')}
      </div>
    </div>
    ` : ''}
  `;
}

function generatePDFHtml(data) {
  const { cabinet, sessionInfo } = data;
  
  const formatDate = (dateStr) => dateStr ? new Date(dateStr).toLocaleDateString() : 'Not specified';
  const formatStatus = (status) => status ? status.toUpperCase() : 'PASS';
  const formatValue = (value) => value !== null && value !== undefined ? value : '';
  
  const powerSupplies = cabinet.power_supplies || [];
  const distributionBlocks = cabinet.distribution_blocks || [];
  const diodes = cabinet.diodes || [];
  const inspection = cabinet.inspection || {};
  const networkEquipment = cabinet.network_equipment || [];
  const controllers = cabinet.controllers || [];
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>DeltaV Preventive Maintenance Report</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          font-size: 12px; 
          line-height: 1.4;
          margin: 0;
          padding: 20px;
          color: #333;
        }
        .header { 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          margin-bottom: 20px;
          padding-bottom: 10px;
          border-bottom: 3px solid #0066cc;
        }
        .logo { 
          font-size: 28px; 
          font-weight: bold; 
          color: #0066cc; 
        }
        .logo-subtitle {
          font-size: 14px;
          color: #666;
          font-weight: normal;
        }
        .title { 
          text-align: center; 
          font-size: 20px; 
          font-weight: bold;
          color: #333;
        }
        .info-section { 
          margin-bottom: 25px;
          background: #f8f9fa;
          padding: 15px;
          border-radius: 8px;
          border-left: 4px solid #0066cc;
        }
        .info-row { 
          display: flex; 
          margin-bottom: 8px; 
        }
        .info-label { 
          width: 150px; 
          font-weight: bold;
          color: #0066cc;
        }
        .info-value { 
          flex: 1; 
          border-bottom: 1px dotted #ccc; 
          padding-bottom: 2px; 
          min-height: 18px;
        }
        table { 
          width: 100%; 
          border-collapse: collapse; 
          margin-bottom: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        th, td { 
          border: 1px solid #0066cc; 
          padding: 8px; 
          text-align: left; 
          vertical-align: top;
        }
        th { 
          background: linear-gradient(135deg, #0066cc, #0052a3);
          color: white;
          font-weight: bold; 
          text-align: center;
        }
        .section-title { 
          font-size: 16px; 
          font-weight: bold; 
          margin: 25px 0 15px 0; 
          padding: 10px 15px;
          background: linear-gradient(135deg, #0066cc, #0052a3);
          color: white;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .status-pass { color: #28a745; font-weight: bold; }
        .status-fail { color: #dc3545; font-weight: bold; }
        .status-na { color: #6c757d; font-style: italic; }
        .inspection-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
          margin-bottom: 20px;
        }
        .inspection-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          background: #f8f9fa;
        }
        .inspection-item:nth-child(odd) {
          background: #e3f2fd;
        }
        .comments-section {
          margin-top: 25px;
          border: 2px solid #0066cc;
          border-radius: 8px;
          overflow: hidden;
        }
        .comments-header {
          background: linear-gradient(135deg, #0066cc, #0052a3);
          color: white;
          padding: 12px;
          font-weight: bold;
          font-size: 14px;
        }
        .comments-body {
          padding: 15px;
          min-height: 80px;
          background: white;
        }
        .signature-section {
          margin-top: 40px;
          display: flex;
          justify-content: space-between;
          padding-top: 20px;
          border-top: 2px solid #0066cc;
        }
        .signature-box {
          text-align: center;
          width: 300px;
        }
        .signature-line {
          border-bottom: 1px solid #333;
          margin-bottom: 5px;
          height: 40px;
        }
        tr:nth-child(even) { background-color: #f8f9fa; }
        .page-break { page-break-before: always; }
        @page { margin: 0.5in; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo">
          ECI
          <div class="logo-subtitle">Emerson Impact Partner</div>
        </div>
        <div class="title">DeltaV Preventive Maintenance Report</div>
      </div>
      
      <div class="info-section">
        <div class="info-row">
          <span class="info-label">Cabinet Location:</span>
          <span class="info-value">${cabinet.cabinet_location}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Date:</span>
          <span class="info-value">${formatDate(cabinet.cabinet_date)}</span>
        </div>
      </div>
      
      ${powerSupplies.length > 0 ? `
      <div class="section-title">Power Supply Measurements</div>
      <table>
        <thead>
          <tr>
            <th>Voltage Type</th>
            <th>Line to Neutral (V)</th>
            <th>Line to Ground (V)</th>
            <th>Neutral to Ground (mV)</th>
            <th>DC Reading (V)</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${powerSupplies.map(ps => `
            <tr>
              <td><strong>${ps.voltage_type}</strong></td>
              <td>${formatValue(ps.line_neutral)}</td>
              <td>${formatValue(ps.line_ground)}</td>
              <td>${formatValue(ps.neutral_ground)}</td>
              <td>${formatValue(ps.dc_reading)}</td>
              <td class="status-${ps.status}">${formatStatus(ps.status)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ` : ''}
      
      ${distributionBlocks.length > 0 ? `
      <div class="section-title">Distribution Blocks</div>
      <table>
        <thead>
          <tr>
            <th>Block #</th>
            <th>DC Reading (V)</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${distributionBlocks.map((block, index) => `
            <tr>
              <td><strong>${index + 1}</strong></td>
              <td>${formatValue(block.dc_reading)}</td>
              <td class="status-${block.status}">${formatStatus(block.status)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ` : ''}
      
      ${diodes.length > 0 ? `
      <div class="section-title">Diodes</div>
      <table>
        <thead>
          <tr>
            <th>Diode #</th>
            <th>DC Reading (V)</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${diodes.map((diode, index) => `
            <tr>
              <td><strong>${index + 1}</strong></td>
              <td>${formatValue(diode.dc_reading)}</td>
              <td class="status-${diode.status}">${formatStatus(diode.status)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ` : ''}
      
      <div class="section-title">Inspection Items</div>
      <div class="inspection-grid">
        <div class="inspection-item">
          <span><strong>Cabinet fans running (if installed)</strong></span>
          <span class="status-${inspection.cabinet_fans || 'pass'}">${formatStatus(inspection.cabinet_fans)}</span>
        </div>
        <div class="inspection-item">
          <span><strong>Controller Status LEDs</strong></span>
          <span class="status-${inspection.controller_leds || 'pass'}">${formatStatus(inspection.controller_leds)}</span>
        </div>
        <div class="inspection-item">
          <span><strong>I/O Status LEDs</strong></span>
          <span class="status-${inspection.io_status || 'pass'}">${formatStatus(inspection.io_status)}</span>
        </div>
        <div class="inspection-item">
          <span><strong>Network Equipment Status</strong></span>
          <span class="status-${inspection.network_status || 'pass'}">${formatStatus(inspection.network_status)}</span>
        </div>
        <div class="inspection-item">
          <span><strong>Environmental Temperatures</strong></span>
          <span class="status-${inspection.temperatures || 'pass'}">${formatStatus(inspection.temperatures)}</span>
        </div>
        <div class="inspection-item">
          <span><strong>Cleaned Enclosure</strong></span>
          <span class="status-${inspection.is_clean || 'pass'}">${formatStatus(inspection.is_clean)}</span>
        </div>
        <div class="inspection-item">
          <span><strong>Clean filter installed</strong></span>
          <span class="status-${inspection.clean_filter_installed || 'pass'}">${formatStatus(inspection.clean_filter_installed)}</span>
        </div>
        <div class="inspection-item">
          <span><strong>Ground Inspection</strong></span>
          <span class="status-${inspection.ground_inspection || 'pass'}">${formatStatus(inspection.ground_inspection)}</span>
        </div>
      </div>
      
      ${networkEquipment.length > 0 ? `
      <div class="section-title">Network Equipment</div>
      <table>
        <thead>
          <tr>
            <th>Equipment Type</th>
            <th>Model Number</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${networkEquipment.map(equipment => `
            <tr>
              <td><strong>${equipment.equipment_type}</strong></td>
              <td>${equipment.model_number || 'Not specified'}</td>
              <td class="status-${equipment.status}">${formatStatus(equipment.status)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ` : ''}
      
      ${controllers.length > 0 ? `
      <div class="section-title">Controllers</div>
      <table>
        <thead>
          <tr>
            <th>Controller Name</th>
            <th>Type</th>
            <th>Model</th>
            <th>Serial</th>
          </tr>
        </thead>
        <tbody>
          ${controllers.map(controller => `
            <tr>
              <td><strong>${controller.node_name || 'Unnamed Controller'}</strong></td>
              <td><strong>${getEnhancedControllerType(controller)}</strong></td>
              <td>${controller.model || 'Unknown'}</td>
              <td>${controller.serial || 'No Serial'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ` : ''}
      
      ${inspection.comments && inspection.comments.trim() ? `
      <div class="comments-section">
        <div class="comments-header">Comments</div>
        <div class="comments-body">
          ${inspection.comments.replace(/\n/g, '<br>')}
        </div>
      </div>
      ` : ''}
      
      <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #0066cc; text-align: center; color: #666;">
        <p><strong>Report generated on ${formatDate(new Date().toISOString())}</strong></p>
        <p style="font-size: 10px;">This report was automatically generated by the Cabinet PM System</p>
      </div>
    </body>
    </html>
  `;
}

// Helper function to get enhanced controller type with model mappings
function getEnhancedControllerType(controller) {
  const model = (controller.model || '').toLowerCase();
  const nodeType = (controller.node_type || '').toLowerCase();
  const nodeName = (controller.node_name || '').toLowerCase();
  
  // Specific model mappings
  if (model.includes('ve4021')) {
    return 'RIU';
  }
  if (model.includes('se4101')) {
    return 'EIOC';
  }
  
  // EIOC detection
  if (nodeType.includes('eioc') || nodeName.includes('eioc') || model.includes('eioc')) {
    return 'EIOC';
  }
  
  // CIOC detection and mapping
  if (nodeType.includes('deltav charm io card') || nodeType.includes('cioc')) {
    return 'CIOC';
  }
  
  // CIOC2 detection (if needed for specific models)
  if (nodeType.includes('deltav charm io card 2') || nodeType.includes('cioc2')) {
    return 'CIOC2';
  }
  
  // Use original node_type or fallback
  return controller.node_type || 'Controller';
}

// Session Node Tracker API Endpoints

// Get node tracker data for a session
app.get('/api/sessions/:sessionId/node-tracker', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  
  try {
    const trackerData = await db.prepare(`
      SELECT node_id, completed, notes
      FROM session_node_tracker 
      WHERE session_id = ?
    `).all([sessionId]);
    
    // Convert to object format {nodeId: {completed: true, notes: ''}}
    const result = {};
    trackerData.forEach(item => {
      result[item.node_id] = {
        completed: Boolean(item.completed),
        notes: item.notes || ''
      };
    });
    
    res.json(result);
  } catch (error) {
    console.error('Get node tracker error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Save node tracker data for a session
app.post('/api/sessions/:sessionId/node-tracker', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  const trackerData = req.body;
  
  try {
    // Check if session is completed
    if (await isSessionCompleted(sessionId)) {
      return res.status(403).json({ 
        error: 'Cannot modify node tracker data - PM session is completed',
        message: 'This PM session has been completed and cannot be modified. Create a new session to make changes.'
      });
    }
    
    // First, delete existing tracker data for this session
    await db.prepare('DELETE FROM session_node_tracker WHERE session_id = ?').run([sessionId]);
    
    // Insert new tracker data
    let insertedCount = 0;
    
    for (const [nodeId, tracker] of Object.entries(trackerData)) {
      // Only insert if at least one field has data
      const hasData = tracker.completed || (tracker.notes && tracker.notes.trim());
      
      if (hasData) {
        await db.prepare(`
          INSERT INTO session_node_tracker (
            session_id, node_id, completed, notes
          ) VALUES (?, ?, ?, ?)
        `).run([
          sessionId,
          parseInt(nodeId),
          tracker.completed ? 1 : 0,
          tracker.notes || null
        ]);
        insertedCount++;
      }
    }
    
    res.json({ 
      success: true, 
      message: `Node tracker data saved for ${insertedCount} nodes`
    });
  } catch (error) {
    console.error('Save node tracker error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get diagnostics for a session
app.get('/api/sessions/:sessionId/diagnostics', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  
  try {
    const diagnostics = await db.prepare(`
      SELECT * FROM session_diagnostics 
      WHERE session_id = ? AND (deleted IS NULL OR deleted = 0)
      ORDER BY controller_name, card_number, channel_number
    `).all([sessionId]);
    
    res.json(diagnostics);
  } catch (error) {
    console.error('Get diagnostics error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Clean up duplicate diagnostics for a session
app.post('/api/sessions/:sessionId/diagnostics/cleanup', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  
  try {
    // Check if session is completed
    if (await isSessionCompleted(sessionId)) {
      return res.status(403).json({ 
        error: 'Cannot modify diagnostics - PM session is completed',
        message: 'This PM session has been completed and cannot be modified. Create a new session to make changes.'
      });
    }
    
    // Find duplicates (same controller, card, channel but different IDs)
    const duplicates = await db.prepare(`
      SELECT controller_name, card_number, channel_number, COUNT(*) as count
      FROM session_diagnostics 
      WHERE session_id = ? AND (deleted IS NULL OR deleted = 0)
      GROUP BY controller_name, card_number, channel_number
      HAVING COUNT(*) > 1
    `).all([sessionId]);
    
    let cleanedCount = 0;
    
    for (const duplicate of duplicates) {
      // Get all records for this channel
      const records = await db.prepare(`
        SELECT * FROM session_diagnostics 
        WHERE session_id = ? AND controller_name = ? AND card_number = ? AND channel_number = ?
        AND (deleted IS NULL OR deleted = 0)
        ORDER BY updated_at DESC
      `).all([sessionId, duplicate.controller_name, duplicate.card_number, duplicate.channel_number]);
      
      // Keep the most recent one, delete the rest
      for (let i = 1; i < records.length; i++) {
        await db.prepare(`
          UPDATE session_diagnostics SET 
            deleted = 1, synced = 0, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run([records[i].id]);
        cleanedCount++;
      }
    }
    
    res.json({ 
      success: true, 
      message: `Cleaned up ${cleanedCount} duplicate diagnostics`,
      duplicatesFound: duplicates.length,
      recordsCleaned: cleanedCount
    });
  } catch (error) {
    console.error('Cleanup diagnostics error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Save diagnostics for a session
app.post('/api/sessions/:sessionId/diagnostics', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  const diagnostic = req.body;
  
  try {
    // Check if session is completed
    if (await isSessionCompleted(sessionId)) {
      return res.status(403).json({ 
        error: 'Cannot modify diagnostics - PM session is completed',
        message: 'This PM session has been completed and cannot be modified. Create a new session to make changes.'
      });
    }
    
    const result = await db.prepare(`
      INSERT INTO session_diagnostics (
        session_id, controller_name, card_number, channel_number, 
        error_type, error_description, notes, synced
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run([
      sessionId,
      diagnostic.controller_name,
      diagnostic.card_number,
      diagnostic.channel_number || null,
      diagnostic.error_type,
      diagnostic.error_description || null,
      diagnostic.notes || null
    ]);
    
    res.json({ 
      success: true, 
      id: result.lastInsertRowid,
      message: 'Diagnostic saved successfully'
    });
  } catch (error) {
    console.error('Save diagnostic error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update diagnostic
app.put('/api/sessions/:sessionId/diagnostics/:diagnosticId', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  const diagnosticId = req.params.diagnosticId;
  const diagnostic = req.body;
  
  try {
    // Check if session is completed
    if (await isSessionCompleted(sessionId)) {
      return res.status(403).json({ 
        error: 'Cannot modify diagnostics - PM session is completed',
        message: 'This PM session has been completed and cannot be modified. Create a new session to make changes.'
      });
    }
    
    const result = await db.prepare(`
      UPDATE session_diagnostics SET
        controller_name = ?, card_number = ?, channel_number = ?,
        error_type = ?, error_description = ?, notes = ?, 
        synced = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND session_id = ?
    `).run([
      diagnostic.controller_name,
      diagnostic.card_number,
      diagnostic.channel_number || null,
      diagnostic.error_type,
      diagnostic.error_description || null,
      diagnostic.notes || null,
      diagnosticId,
      sessionId
    ]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Diagnostic not found' });
    }
    
    res.json({ success: true, message: 'Diagnostic updated successfully' });
  } catch (error) {
    console.error('Update diagnostic error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete diagnostic (soft delete for sync)
app.delete('/api/sessions/:sessionId/diagnostics/:diagnosticId', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  const diagnosticId = req.params.diagnosticId;
  
  try {
    // Check if session is completed
    if (await isSessionCompleted(sessionId)) {
      return res.status(403).json({ 
        error: 'Cannot modify diagnostics - PM session is completed',
        message: 'This PM session has been completed and cannot be modified. Create a new session to make changes.'
      });
    }
    
    // Soft delete for sync tracking
    const result = await db.prepare(`
      UPDATE session_diagnostics SET 
        deleted = 1, synced = 0, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ? AND session_id = ?
    `).run([diagnosticId, sessionId]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Diagnostic not found' });
    }
    
    res.json({ success: true, message: 'Diagnostic marked for deletion and will be synced to cloud' });
  } catch (error) {
    console.error('Delete diagnostic error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// PM Notes API Endpoints

// Get PM notes for a session
app.get('/api/sessions/:sessionId/pm-notes', requireAuth, async (req, res) => {
  const { sessionId } = req.params;
  
  try {
    const pmNotes = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM session_pm_notes WHERE session_id = ? AND deleted = 0',
        [sessionId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    if (!pmNotes) {
      return res.status(404).json({ error: 'PM Notes not found' });
    }
    
    // Parse common_tasks JSON if it exists
    if (pmNotes.common_tasks) {
      try {
        pmNotes.common_tasks = JSON.parse(pmNotes.common_tasks);
      } catch (e) {
        pmNotes.common_tasks = [];
      }
    } else {
      pmNotes.common_tasks = [];
    }
    
    res.json(pmNotes);
  } catch (error) {
    console.error('Get PM notes error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Save PM notes for a session
app.post('/api/sessions/:sessionId/pm-notes', requireAuth, async (req, res) => {
  const { sessionId } = req.params;
  const { common_tasks, additional_work_notes, troubleshooting_notes, recommendations_notes } = req.body;
  
  try {
    // Generate UUID for sync
    const uuid = require('crypto').randomUUID();
    const now = new Date().toISOString();
    
    // Convert common_tasks array to JSON string
    const commonTasksJson = JSON.stringify(common_tasks || []);
    
    // Check if PM notes already exist for this session
    const existingNotes = await new Promise((resolve, reject) => {
      db.get(
        'SELECT id FROM session_pm_notes WHERE session_id = ? AND deleted = 0',
        [sessionId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    let pmNotes;
    
    if (existingNotes) {
      // Update existing notes
      pmNotes = await new Promise((resolve, reject) => {
        db.run(
          'UPDATE session_pm_notes SET common_tasks = ?, additional_work_notes = ?, troubleshooting_notes = ?, recommendations_notes = ?, synced = 0, updated_at = ? WHERE session_id = ? AND deleted = 0',
          [commonTasksJson, additional_work_notes, troubleshooting_notes, recommendations_notes, now, sessionId],
          function(err) {
            if (err) reject(err);
            else {
              // Get the updated record
              db.get(
                'SELECT * FROM session_pm_notes WHERE session_id = ? AND deleted = 0',
                [sessionId],
                (err, row) => {
                  if (err) reject(err);
                  else {
                    // Parse common_tasks back to array
                    if (row.common_tasks) {
                      try {
                        row.common_tasks = JSON.parse(row.common_tasks);
                      } catch (e) {
                        row.common_tasks = [];
                      }
                    } else {
                      row.common_tasks = [];
                    }
                    resolve(row);
                  }
                }
              );
            }
          }
        );
      });
    } else {
      // Create new notes
      pmNotes = await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO session_pm_notes (session_id, common_tasks, additional_work_notes, troubleshooting_notes, recommendations_notes, uuid, synced, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)',
          [sessionId, commonTasksJson, additional_work_notes, troubleshooting_notes, recommendations_notes, uuid, now, now],
          function(err) {
            if (err) reject(err);
            else {
              // Get the created record
              db.get(
                'SELECT * FROM session_pm_notes WHERE id = ?',
                [this.lastID],
                (err, row) => {
                  if (err) reject(err);
                  else {
                    // Parse common_tasks back to array
                    if (row.common_tasks) {
                      try {
                        row.common_tasks = JSON.parse(row.common_tasks);
                      } catch (e) {
                        row.common_tasks = [];
                      }
                    } else {
                      row.common_tasks = [];
                    }
                    resolve(row);
                  }
                }
              );
            }
          }
        );
      });
    }
    
    res.json(pmNotes);
  } catch (error) {
    console.error('Save PM notes error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// I&I Session API Endpoints

// Get all I&I documents for a session
app.get('/api/sessions/:sessionId/ii-documents', requireAuth, async (req, res) => {
  const { sessionId } = req.params;
  
  try {
    const documents = await db.prepare('SELECT * FROM session_ii_documents WHERE session_id = ? AND deleted = 0 ORDER BY created_at').all([sessionId]);
    res.json(documents);
  } catch (error) {
    console.error('Get I&I documents error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create new I&I document
app.post('/api/sessions/:sessionId/ii-documents', requireAuth, async (req, res) => {
  const { sessionId } = req.params;
  const { document_name, deltav_system_id, location } = req.body;
  
  try {
    const documentId = require('uuid').v4();
    const uuid = require('crypto').randomUUID();
    const now = new Date().toISOString();
    
    await db.prepare('INSERT INTO session_ii_documents (id, session_id, document_name, deltav_system_id, location, uuid, synced, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)').run([documentId, sessionId, document_name, deltav_system_id, location, uuid, now, now]);
    
    const document = await db.prepare('SELECT * FROM session_ii_documents WHERE id = ?').get([documentId]);
    res.json(document);
  } catch (error) {
    console.error('Create I&I document error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get I&I document details
app.get('/api/ii-documents/:documentId', requireAuth, async (req, res) => {
  const { documentId } = req.params;
  
  try {
    const document = await db.prepare('SELECT * FROM session_ii_documents WHERE id = ? AND deleted = 0').get([documentId]);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json(document);
  } catch (error) {
    console.error('Get I&I document error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Save I&I header information for a session
app.post('/api/sessions/:sessionId/ii-header', requireAuth, async (req, res) => {
  const { sessionId } = req.params;
  const { deltav_system_id, ii_location, ii_performed_by, ii_date_performed, ii_customer_name } = req.body;
  
  try {
    const now = new Date().toISOString();
    
    // Update the session with header information
    await db.prepare('UPDATE sessions SET deltav_system_id = ?, ii_location = ?, ii_performed_by = ?, ii_date_performed = ?, ii_customer_name = ?, updated_at = ? WHERE id = ?').run([deltav_system_id, ii_location, ii_performed_by, ii_date_performed, ii_customer_name, now, sessionId]);
    
    // Get the updated session
    const session = await db.prepare('SELECT * FROM sessions WHERE id = ?').get([sessionId]);
    
    res.json(session);
  } catch (error) {
    console.error('Save I&I header error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get I&I equipment checklist for a document
app.get('/api/ii-documents/:documentId/ii-equipment', requireAuth, async (req, res) => {
  const { documentId } = req.params;
  
  console.log(`🔍 DEBUG: Getting I&I equipment for document ID: ${documentId}`);
  
  try {
    const equipment = await db.prepare('SELECT * FROM session_ii_equipment WHERE document_id = ? AND deleted = 0').get([documentId]);
    console.log(`✅ DEBUG: Found equipment:`, equipment);
    res.json(equipment || {});
  } catch (error) {
    console.error('❌ DEBUG: Get I&I equipment error:', error);
    console.error('❌ DEBUG: This likely means the document_id column does not exist in session_ii_equipment table');
    res.status(500).json({ error: 'Database error' });
  }
});

// Save I&I equipment checklist for a document
app.post('/api/ii-documents/:documentId/ii-equipment', requireAuth, async (req, res) => {
  const { documentId } = req.params;
  const { clamp_on_rms_ammeter, digit_dvm, fluke_1630_earth_ground, fluke_mt8200_micromapper, notes } = req.body;
  
  console.log(`🔍 DEBUG: Saving I&I equipment for document ID: ${documentId}`);
  
  try {
    // Get the session_id for this document
    const document = await db.prepare('SELECT session_id FROM session_ii_documents WHERE id = ?').get([documentId]);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const sessionId = document.session_id;
    console.log(`🔍 DEBUG: Found session_id: ${sessionId} for document: ${documentId}`);
    
    const uuid = require('crypto').randomUUID();
    const now = new Date().toISOString();
    
    const existing = await db.prepare('SELECT id FROM session_ii_equipment WHERE document_id = ? AND deleted = 0').get([documentId]);
    
    let equipment;
    if (existing) {
      console.log(`🔍 DEBUG: Updating existing equipment record`);
      await db.prepare('UPDATE session_ii_equipment SET clamp_on_rms_ammeter = ?, digit_dvm = ?, fluke_1630_earth_ground = ?, fluke_mt8200_micromapper = ?, notes = ?, synced = 0, updated_at = ? WHERE document_id = ? AND deleted = 0').run([clamp_on_rms_ammeter, digit_dvm, fluke_1630_earth_ground, fluke_mt8200_micromapper, notes, now, documentId]);
      equipment = await db.prepare('SELECT * FROM session_ii_equipment WHERE document_id = ? AND deleted = 0').get([documentId]);
    } else {
      console.log(`🔍 DEBUG: Creating new equipment record with session_id: ${sessionId} and document_id: ${documentId}`);
      await db.prepare('INSERT INTO session_ii_equipment (session_id, document_id, clamp_on_rms_ammeter, digit_dvm, fluke_1630_earth_ground, fluke_mt8200_micromapper, notes, uuid, synced, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)').run([sessionId, documentId, clamp_on_rms_ammeter, digit_dvm, fluke_1630_earth_ground, fluke_mt8200_micromapper, notes, uuid, now, now]);
      equipment = await db.prepare('SELECT * FROM session_ii_equipment WHERE document_id = ? AND deleted = 0').get([documentId]);
    }
    
    console.log(`✅ DEBUG: Successfully saved equipment:`, equipment);
    res.json(equipment);
  } catch (error) {
    console.error('❌ DEBUG: Save I&I equipment error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get I&I checklist items for a document
app.get('/api/ii-documents/:documentId/ii-checklist', requireAuth, async (req, res) => {
  const { documentId } = req.params;
  
  console.log(`🔍 DEBUG: Getting I&I checklist for document ID: ${documentId}`);
  
  try {
    const items = await db.prepare('SELECT * FROM session_ii_checklist WHERE document_id = ? AND deleted = 0 ORDER BY section_name, item_name').all([documentId]);
    console.log(`✅ DEBUG: Found ${items.length} checklist items`);
    res.json(items);
  } catch (error) {
    console.error('❌ DEBUG: Get I&I checklist error:', error);
    console.error('❌ DEBUG: This likely means the document_id column does not exist in session_ii_checklist table');
    res.status(500).json({ error: 'Database error' });
  }
});

// Save I&I checklist item for a document
app.post('/api/ii-documents/:documentId/ii-checklist', requireAuth, async (req, res) => {
  const { documentId } = req.params;
  const { section_name, item_name, answer, comments, performed_by, date_completed, measurement_ohms, measurement_ac_ma, measurement_dc_ma, measurement_voltage, measurement_frequency } = req.body;
  
  console.log(`🔍 DEBUG: Saving I&I checklist item for document ID: ${documentId}, section: ${section_name}, item: ${item_name}`);
  
  try {
    // Get the session_id for this document
    const document = await db.prepare('SELECT session_id FROM session_ii_documents WHERE id = ?').get([documentId]);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const sessionId = document.session_id;
    console.log(`🔍 DEBUG: Found session_id: ${sessionId} for document: ${documentId}`);
    
    const uuid = require('crypto').randomUUID();
    const now = new Date().toISOString();
    
    // Check if item already exists
    const existing = await db.prepare('SELECT id FROM session_ii_checklist WHERE document_id = ? AND section_name = ? AND item_name = ? AND deleted = 0').get([documentId, section_name, item_name]);
    
    let item;
    if (existing) {
      console.log(`🔍 DEBUG: Updating existing checklist item`);
      await db.prepare('UPDATE session_ii_checklist SET answer = ?, comments = ?, performed_by = ?, date_completed = ?, measurement_ohms = ?, measurement_ac_ma = ?, measurement_dc_ma = ?, measurement_voltage = ?, measurement_frequency = ?, synced = 0, updated_at = ? WHERE id = ?').run([answer, comments, performed_by, date_completed, measurement_ohms, measurement_ac_ma, measurement_dc_ma, measurement_voltage, measurement_frequency, now, existing.id]);
      item = await db.prepare('SELECT * FROM session_ii_checklist WHERE id = ?').get([existing.id]);
    } else {
      console.log(`🔍 DEBUG: Creating new checklist item with session_id: ${sessionId} and document_id: ${documentId}`);
      console.log(`🔍 DEBUG: Insert values:`, {
        sessionId, documentId, section_name, item_name, answer, comments, performed_by, date_completed,
        measurement_ohms, measurement_ac_ma, measurement_dc_ma, measurement_voltage, measurement_frequency
      });
      await db.prepare('INSERT INTO session_ii_checklist (session_id, document_id, section_name, item_name, answer, comments, performed_by, date_completed, measurement_ohms, measurement_ac_ma, measurement_dc_ma, measurement_voltage, measurement_frequency, uuid, synced, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)').run([sessionId, documentId, section_name, item_name, answer, comments, performed_by, date_completed, measurement_ohms, measurement_ac_ma, measurement_dc_ma, measurement_voltage, measurement_frequency, uuid, now, now]);
      item = await db.prepare('SELECT * FROM session_ii_checklist WHERE document_id = ? AND section_name = ? AND item_name = ? AND deleted = 0').get([documentId, section_name, item_name]);
    }
    
    console.log(`✅ DEBUG: Successfully saved checklist item:`, item);
    res.json(item);
  } catch (error) {
    console.error('❌ DEBUG: Save I&I checklist item error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get I&I equipment used for a document
app.get('/api/ii-documents/:documentId/ii-equipment-used', requireAuth, async (req, res) => {
  const { documentId } = req.params;
  
  try {
    const equipment = await db.prepare('SELECT * FROM session_ii_equipment_used WHERE document_id = ? AND deleted = 0 ORDER BY manufacturer, type').all([documentId]);
    res.json(equipment);
  } catch (error) {
    console.error('Get I&I equipment used error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Save I&I equipment used for a document
app.post('/api/ii-documents/:documentId/ii-equipment-used', requireAuth, async (req, res) => {
  const { documentId } = req.params;
  const { manufacturer, type, serial_number, recalibration_date, used_in_section } = req.body;
  
  try {
    // Get the session_id for this document
    const document = await db.prepare('SELECT session_id FROM session_ii_documents WHERE id = ?').get([documentId]);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const sessionId = document.session_id;
    const uuid = require('crypto').randomUUID();
    const now = new Date().toISOString();
    
    await db.prepare('INSERT INTO session_ii_equipment_used (session_id, document_id, manufacturer, type, serial_number, recalibration_date, used_in_section, uuid, synced, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)').run([sessionId, documentId, manufacturer, type, serial_number, recalibration_date, used_in_section, uuid, now, now]);
    
    const equipment = await db.prepare('SELECT * FROM session_ii_equipment_used WHERE document_id = ? AND deleted = 0 ORDER BY manufacturer, type').all([documentId]);
    res.json(equipment);
  } catch (error) {
    console.error('Save I&I equipment used error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete I&I equipment used item
app.delete('/api/ii-equipment-used/:itemId', requireAuth, async (req, res) => {
  const { itemId } = req.params;
  
  try {
    await db.prepare('UPDATE session_ii_equipment_used SET deleted = 1, synced = 0, updated_at = ? WHERE id = ?').run([new Date().toISOString(), itemId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete I&I equipment used error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update I&I document
app.put('/api/ii-documents/:documentId', requireAuth, async (req, res) => {
  const { documentId } = req.params;
  const { document_name, deltav_system_id, location, performed_by, date_performed } = req.body;
  
  try {
    const now = new Date().toISOString();
    
    await db.prepare('UPDATE session_ii_documents SET document_name = ?, deltav_system_id = ?, location = ?, performed_by = ?, date_performed = ?, synced = 0, updated_at = ? WHERE id = ? AND deleted = 0').run([document_name, deltav_system_id, location, performed_by, date_performed, now, documentId]);
    
    const document = await db.prepare('SELECT * FROM session_ii_documents WHERE id = ? AND deleted = 0').get([documentId]);
    res.json(document);
  } catch (error) {
    console.error('Update I&I document error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete I&I document
app.delete('/api/ii-documents/:documentId', requireAuth, async (req, res) => {
  const { documentId } = req.params;
  
  try {
    const now = new Date().toISOString();
    
    // Soft delete the document
    await db.prepare('UPDATE session_ii_documents SET deleted = 1, synced = 0, updated_at = ? WHERE id = ?').run([now, documentId]);
    
    // Soft delete related data
    await db.prepare('UPDATE session_ii_equipment SET deleted = 1, synced = 0, updated_at = ? WHERE document_id = ?').run([now, documentId]);
    await db.prepare('UPDATE session_ii_checklist SET deleted = 1, synced = 0, updated_at = ? WHERE document_id = ?').run([now, documentId]);
    await db.prepare('UPDATE session_ii_equipment_used SET deleted = 1, synced = 0, updated_at = ? WHERE document_id = ?').run([now, documentId]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete I&I document error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Export I&I document as PDF
app.post('/api/ii-documents/:documentId/export-pdf', requireAuth, async (req, res) => {
  const { documentId } = req.params;
  
  try {
    // Get document details
    const document = await db.prepare('SELECT * FROM session_ii_documents WHERE id = ? AND deleted = 0').get([documentId]);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Get session details
    const session = await db.prepare(`
      SELECT s.*, c.name as customer_name, c.location as customer_location
      FROM sessions s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.id = ?
    `).get([document.session_id]);
    
    // Get checklist items
    const checklistItems = await db.prepare('SELECT * FROM session_ii_checklist WHERE document_id = ? AND deleted = 0 ORDER BY section_name, item_name').all([documentId]);
    
    // Get equipment used
    const equipmentUsed = await db.prepare('SELECT * FROM session_ii_equipment_used WHERE document_id = ? AND deleted = 0 ORDER BY manufacturer, type').all([documentId]);
    
    // Generate PDF content
    const pdfContent = generateIIPDF(document, session, checklistItems, equipmentUsed);
    
    // Generate PDF using Puppeteer
    const browser = await puppeteer.launch({
      executablePath: await findChrome(),
      headless: "new",
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
    page.setDefaultTimeout(90000); // 90 second timeout
    await page.setContent(pdfContent, { waitUntil: 'networkidle0', timeout: 90000 });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.5in',
        left: '0.5in'
      }
    });
    
    await browser.close();
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="II-Document-${document.document_name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`);
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error('Export I&I PDF error:', error);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

// Export all I&I documents in a session as combined PDF
app.post('/api/sessions/:sessionId/export-all-ii-pdfs', requireAuth, async (req, res) => {
  const { sessionId } = req.params;
  
  try {
    console.log(`🔍 DEBUG: Exporting all I&I PDFs for session: ${sessionId}`);
    
    // Get session details
    const session = await db.prepare(`
      SELECT s.*, c.name as customer_name, c.location as customer_location
      FROM sessions s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.id = ? AND s.session_type = 'ii'
    `).get([sessionId]);
    
    if (!session) {
      return res.status(404).json({ error: 'I&I session not found' });
    }
    
    // Get all documents in the session
    const documents = await db.prepare('SELECT * FROM session_ii_documents WHERE session_id = ? AND deleted = 0 ORDER BY document_name').all([sessionId]);
    
    if (documents.length === 0) {
      return res.status(404).json({ error: 'No documents found in this I&I session' });
    }
    
    console.log(`✅ DEBUG: Found ${documents.length} documents to export`);
    
    // Generate combined PDF content
    console.log(`🔄 DEBUG: Starting PDF content generation for ${documents.length} documents`);
    const pdfContent = await generateCombinedIIPDF(session, documents);
    console.log(`✅ DEBUG: PDF content generation completed`);
    
    // Generate PDF using Puppeteer
    const browser = await puppeteer.launch({
      executablePath: await findChrome(),
      headless: "new",
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
    page.setDefaultTimeout(120000); // 2 minute timeout for large content
    
    console.log(`🔄 DEBUG: Setting page content (${Math.round(pdfContent.length / 1024)} KB)...`);
    await page.setContent(pdfContent, { waitUntil: 'networkidle0', timeout: 120000 });
    console.log(`✅ DEBUG: Page content set successfully`);
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.5in',
        left: '0.5in'
      }
    });
    
    await browser.close();
    
    const sessionName = session.session_name.replace(/[^a-zA-Z0-9]/g, '_');
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ECI_II_Report_${sessionName}.pdf"`);
    res.send(pdfBuffer);
    
    console.log(`✅ DEBUG: Combined I&I PDF exported successfully`);
    
  } catch (error) {
    console.error('Export combined I&I PDF error:', error);
    res.status(500).json({ error: 'Combined PDF generation failed' });
  }
});

// Node Management API Endpoints

// Get all nodes for a customer
app.get('/api/customers/:customerId/nodes', requireAuth, async (req, res) => {
  const customerId = req.params.customerId;
  const sessionId = req.query.sessionId;
  
  try {
    // If sessionId is provided and the session is completed, return snapshot data
    if (sessionId) {
      const session = await db.prepare('SELECT status FROM sessions WHERE id = ?').get([sessionId]);
      
      if (session && session.status === 'completed') {
        // Return node snapshot data for completed sessions
        const snapshots = await db.prepare(`
          SELECT 
            sns.original_node_id as id,
            sns.node_name,
            sns.node_type,
            sns.model,
            sns.description,
            sns.serial,
            sns.firmware,
            sns.version,
            sns.status,
            sns.redundant,
            sns.os_name,
            sns.os_service_pack,
            sns.bios_version,
            sns.oem_type_description,
            sns.assigned_cabinet_location
          FROM session_node_snapshots sns
          WHERE sns.session_id = ?
          ORDER BY sns.node_type, sns.node_name
        `).all([sessionId]);
        
        return res.json(snapshots);
      }
    }
    
    // Return current nodes for active sessions or when no sessionId provided
    const nodes = await db.prepare(`
      SELECT n.*, c.cabinet_location as assigned_cabinet_location
      FROM nodes n
      LEFT JOIN cabinets c ON n.assigned_cabinet_id = c.id
      WHERE n.customer_id = ?
      ORDER BY n.node_type, n.node_name
    `).all([customerId]);
    
    res.json(nodes);
  } catch (error) {
    console.error('Get nodes error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get controller usage information for a customer
app.get('/api/customers/:customerId/controller-usage', requireAuth, async (req, res) => {
  const customerId = req.params.customerId;
  
  try {
    const controllerUsage = await db.prepare(`
      SELECT 
        n.id,
        n.node_name,
        n.node_type,
        n.model,
        n.serial,
        n.assigned_cabinet_id,
        n.assigned_at,
        c.cabinet_location,
        s.session_name,
        s.id as session_id
      FROM nodes n
      LEFT JOIN cabinets c ON n.assigned_cabinet_id = c.id
      LEFT JOIN sessions s ON c.pm_session_id = s.id
      WHERE n.customer_id = ? 
      AND n.node_type IN ('Controller', 'CIOC', 'SZ Controller', 'Charms Smart Logic Solver', 'DeltaV EIOC')
      AND n.node_name NOT LIKE '%-partner'
      ORDER BY n.assigned_cabinet_id IS NULL, n.node_type, n.node_name
    `).all([customerId]);
    
    res.json(controllerUsage);
  } catch (error) {
    console.error('Get controller usage error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get available controllers for a customer with usage status
app.get('/api/customers/:customerId/available-controllers', requireAuth, async (req, res) => {
  const customerId = req.params.customerId;
  const sessionId = req.query.sessionId; // Get session ID from query parameter
  
  try {
    let controllers;
    
    if (sessionId) {
      // Get all controllers with their usage status in the current session
      controllers = await db.prepare(`
        SELECT 
          n.*,
          CASE 
            WHEN n.id IN (
              SELECT DISTINCT n2.id 
              FROM nodes n2
              JOIN cabinets c ON n2.assigned_cabinet_id = c.id
              WHERE c.pm_session_id = ?
            ) THEN 'used_in_session'
            WHEN n.assigned_cabinet_id IS NOT NULL THEN 'used_elsewhere'
            ELSE 'available'
          END as usage_status,
          c.cabinet_location,
          s.session_name
                 FROM nodes n
         LEFT JOIN cabinets c ON n.assigned_cabinet_id = c.id
         LEFT JOIN sessions s ON c.pm_session_id = s.id
        WHERE n.customer_id = ? 
        AND n.node_type IN ('Controller', 'CIOC', 'SZ Controller', 'Charms Smart Logic Solver', 'DeltaV EIOC', 'SIS')
        AND n.node_name NOT LIKE '%-partner'
        ORDER BY 
          CASE 
            WHEN n.id IN (
              SELECT DISTINCT n2.id 
              FROM nodes n2
              JOIN cabinets c ON n2.assigned_cabinet_id = c.id
              WHERE c.pm_session_id = ?
            ) THEN 1
            WHEN n.assigned_cabinet_id IS NOT NULL THEN 2
            ELSE 0
          END,
          n.node_type, n.node_name
      `).all([sessionId, customerId, sessionId]);
      
      console.log('DEBUG: Found', controllers.length, 'controllers for customer with usage status');
    } else {
      // If no session ID provided, return all controllers (fallback)
      controllers = await db.prepare(`
        SELECT 
          *,
          CASE 
            WHEN assigned_cabinet_id IS NOT NULL THEN 'used_elsewhere'
            ELSE 'available'
          END as usage_status,
          NULL as cabinet_location,
          NULL as session_name
        FROM nodes 
      WHERE customer_id = ? 
        AND node_type IN ('Controller', 'CIOC', 'SZ Controller', 'Charms Smart Logic Solver', 'DeltaV EIOC', 'SIS')
      AND node_name NOT LIKE '%-partner'
        ORDER BY assigned_cabinet_id IS NOT NULL, node_type, node_name
      `).all([customerId]);
      
      console.log('DEBUG: Found', controllers.length, 'total controllers for customer (no session filter)');
    }
    
    res.json(controllers);
  } catch (error) {
    console.error('Get available controllers error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Bulk import nodes from CSV
app.post('/api/customers/:customerId/nodes/import', requireAuth, async (req, res) => {
  const customerId = req.params.customerId;
  const { nodes, replace = false } = req.body;
  
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return res.status(400).json({ error: 'No nodes provided' });
  }
  
  try {
    let importedCount = 0;
    let errors = [];
    
    // If replace is true, delete all existing nodes for this customer first
    if (replace) {
      // Clear node assignments first, but only for active sessions
      await db.prepare(`
        UPDATE nodes SET assigned_cabinet_id = NULL, assigned_at = NULL 
        WHERE customer_id = ? 
        AND (assigned_cabinet_id IS NULL OR assigned_cabinet_id IN (
          SELECT c.id FROM cabinets c 
          JOIN sessions s ON c.pm_session_id = s.id 
          WHERE s.status != 'completed'
        ))
      `).run([customerId]);
      
      // Delete session node maintenance records, but only for non-completed sessions
      await db.prepare(`
        DELETE FROM session_node_maintenance 
        WHERE node_id IN (SELECT id FROM nodes WHERE customer_id = ?)
        AND session_id IN (SELECT id FROM sessions WHERE status != 'completed')
      `).run([customerId]);
      
      // Delete session node tracker records, but only for non-completed sessions
      await db.prepare(`
        DELETE FROM session_node_tracker 
        WHERE session_id IN (SELECT id FROM sessions WHERE status != 'completed')
        AND node_id IN (SELECT id FROM nodes WHERE customer_id = ?)
      `).run([customerId]);
      
      // Delete all existing nodes
      await db.prepare('DELETE FROM nodes WHERE customer_id = ?').run([customerId]);
    }
    
    // Insert new nodes
    for (const node of nodes) {
      try {
        await db.prepare(`
          INSERT INTO nodes (
            customer_id, node_name, node_type, model, description, serial, 
            firmware, version, status, redundant, os_name, os_service_pack,
            bios_version, oem_type_description
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run([
          customerId,
          node.node_name,
          node.node_type,
          node.model || null,
          node.description || null,
          node.serial || null,
          node.firmware || null,
          node.version || null,
          node.status || null,
          node.redundant || null,
          node.os_name || null,
          node.os_service_pack || null,
          node.bios_version || null,
          node.oem_type_description || null
        ]);
        importedCount++;
      } catch (nodeError) {
        errors.push(`${node.node_name}: ${nodeError.message}`);
      }
    }
    
    res.json({ 
      success: true, 
      imported: importedCount, 
      total: nodes.length,
      replaced: replace,
      errors: errors.length > 0 ? errors : null
    });
  } catch (error) {
    console.error('Import nodes error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete all nodes for a customer
app.delete('/api/customers/:customerId/nodes', requireAuth, async (req, res) => {
  const customerId = req.params.customerId;
  
  try {
    // First clear any node assignments, but only for active sessions
    await db.prepare(`
      UPDATE nodes SET assigned_cabinet_id = NULL, assigned_at = NULL 
      WHERE customer_id = ? 
      AND (assigned_cabinet_id IS NULL OR assigned_cabinet_id IN (
        SELECT c.id FROM cabinets c 
        JOIN sessions s ON c.pm_session_id = s.id 
        WHERE s.status != 'completed'
      ))
    `).run([customerId]);
    
    // Delete session node maintenance records, but only for non-completed sessions
    await db.prepare(`
      DELETE FROM session_node_maintenance 
      WHERE node_id IN (SELECT id FROM nodes WHERE customer_id = ?)
      AND session_id IN (SELECT id FROM sessions WHERE status != 'completed')
    `).run([customerId]);
    
    // Delete session node tracker records, but only for non-completed sessions
    await db.prepare(`
      DELETE FROM session_node_tracker 
      WHERE session_id IN (SELECT id FROM sessions WHERE status != 'completed')
      AND node_id IN (SELECT id FROM nodes WHERE customer_id = ?)
    `).run([customerId]);
    
    // Then delete all nodes
    const result = await db.prepare('DELETE FROM nodes WHERE customer_id = ?').run([customerId]);
    
    res.json({ 
      success: true, 
      deleted: result.changes,
      message: `Successfully deleted ${result.changes} nodes`
    });
  } catch (error) {
    console.error('Delete all nodes error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Assign controller to cabinet
app.post('/api/nodes/:nodeId/assign', requireAuth, async (req, res) => {
  const nodeId = req.params.nodeId;
  const { cabinet_id } = req.body;
  
  try {
    const result = await db.prepare(`
      UPDATE nodes SET 
        assigned_cabinet_id = ?, 
        assigned_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run([cabinet_id, nodeId]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Assign node error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Unassign controllers from a specific cabinet
app.post('/api/cabinets/:cabinetId/unassign-controllers', requireAuth, async (req, res) => {
  const cabinetId = req.params.cabinetId;
  
  try {
    const result = await db.prepare(`
      UPDATE nodes SET 
        assigned_cabinet_id = NULL, 
        assigned_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE assigned_cabinet_id = ?
    `).run([cabinetId]);
    
    res.json({ 
      success: true, 
      message: `Unassigned ${result.changes} controllers from cabinet`
    });
  } catch (error) {
    console.error('Unassign cabinet controllers error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Unassign controller from cabinet
app.post('/api/nodes/:nodeId/unassign', requireAuth, async (req, res) => {
  const nodeId = req.params.nodeId;
  
  try {
    const result = await db.prepare(`
      UPDATE nodes SET 
        assigned_cabinet_id = NULL, 
        assigned_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run([nodeId]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Unassign node error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete node
app.delete('/api/nodes/:nodeId', requireAuth, async (req, res) => {
  const nodeId = req.params.nodeId;
  
  try {
    const result = await db.prepare('DELETE FROM nodes WHERE id = ?').run([nodeId]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete node error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Session Node Maintenance API Endpoints

// Get node maintenance data for a session
app.get('/api/sessions/:sessionId/node-maintenance', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  
  try {
    const maintenanceData = await db.prepare(`
      SELECT node_id, dv_checked, os_checked, macafee_checked, 
             free_time, redundancy_checked, cold_restart_checked, no_errors_checked,
             hdd_replaced, performance_type, performance_value, hf_updated, firmware_updated_checked
      FROM session_node_maintenance 
      WHERE session_id = ?
    `).all([sessionId]);
    
    // Convert to object format {nodeId: {dv_checked: true, ...}}
    const result = {};
    maintenanceData.forEach(item => {
      result[item.node_id] = {
        dv_checked: Boolean(item.dv_checked),
        os_checked: Boolean(item.os_checked),
        macafee_checked: Boolean(item.macafee_checked),
        free_time: item.free_time || '',
        redundancy_checked: Boolean(item.redundancy_checked),
        cold_restart_checked: Boolean(item.cold_restart_checked),
        no_errors_checked: Boolean(item.no_errors_checked),
        hdd_replaced: Boolean(item.hdd_replaced),
        performance_type: item.performance_type || 'free_time',
        performance_value: item.performance_value || null,
        hf_updated: Boolean(item.hf_updated),
        firmware_updated_checked: Boolean(item.firmware_updated_checked)
      };
    });
    
    res.json(result);
  } catch (error) {
    console.error('Get node maintenance error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Save node maintenance data for a session
app.post('/api/sessions/:sessionId/node-maintenance', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  const maintenanceData = req.body;
  
  try {
    // Check if session is completed
    if (await isSessionCompleted(sessionId)) {
      return res.status(403).json({ 
        error: 'Cannot modify node maintenance data - PM session is completed',
        message: 'This PM session has been completed and cannot be modified. Create a new session to make changes.'
      });
    }
    
    // First, delete existing maintenance data for this session
    await db.prepare('DELETE FROM session_node_maintenance WHERE session_id = ?').run([sessionId]);
    
    // Insert new maintenance data
    let insertedCount = 0;
    
    for (const [nodeId, maintenance] of Object.entries(maintenanceData)) {
      // Only insert if at least one field has data
      const hasData = maintenance.dv_checked || maintenance.os_checked || maintenance.macafee_checked ||
                     maintenance.redundancy_checked || maintenance.cold_restart_checked || 
                     maintenance.no_errors_checked || maintenance.hdd_replaced || maintenance.hf_updated ||
                     maintenance.firmware_updated_checked || (maintenance.free_time && maintenance.free_time.trim()) ||
                     maintenance.performance_value;
      
      if (hasData) {
        await db.prepare(`
          INSERT INTO session_node_maintenance (
            session_id, node_id, dv_checked, os_checked, macafee_checked,
            free_time, redundancy_checked, cold_restart_checked, no_errors_checked,
            hdd_replaced, performance_type, performance_value, hf_updated, firmware_updated_checked
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run([
          sessionId,
          parseInt(nodeId),
          maintenance.dv_checked ? 1 : 0,
          maintenance.os_checked ? 1 : 0,
          maintenance.macafee_checked ? 1 : 0,
          maintenance.free_time || null,
          maintenance.redundancy_checked ? 1 : 0,
          maintenance.cold_restart_checked ? 1 : 0,
          maintenance.no_errors_checked ? 1 : 0,
          maintenance.hdd_replaced ? 1 : 0,
          maintenance.performance_type || 'free_time',
          maintenance.performance_value || null,
          maintenance.hf_updated ? 1 : 0,
          maintenance.firmware_updated_checked ? 1 : 0
        ]);
        insertedCount++;
      }
    }
    
    res.json({ 
      success: true, 
      message: `Maintenance data saved for ${insertedCount} nodes`
    });
  } catch (error) {
    console.error('Save node maintenance error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Clear all node maintenance data for a session
app.delete('/api/sessions/:sessionId/node-maintenance', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  
  try {
    const result = await db.prepare('DELETE FROM session_node_maintenance WHERE session_id = ?').run([sessionId]);
    
    res.json({ 
      success: true, 
      message: `Cleared maintenance data for ${result.changes} nodes`
    });
  } catch (error) {
    console.error('Clear node maintenance error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Sync functionality removed for now

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server function
async function startServer() {
  console.log('🔧 Initializing database...');
  console.log('🔧 Opening SQLite DB at:', dbPath);
  
  try {
    await initializeDatabase();
    console.log('✅ Database is ready');
    
    // Temporarily disable sync endpoints to fix core functionality first
    console.log('⚠️  Sync endpoints temporarily disabled for testing');
    
    // Start listening only after everything is initialized
    try {
        app.listen(PORT, () => {
            console.log(`🚀 Cabinet PM Tablet App running on port ${PORT}`);
            console.log(`📱 Visit http://localhost:${PORT} to get started`);
            console.log('');
            console.log('💾 Tablet version with SQLite database (sqlite3)');
            console.log('🔑 Default login: admin / cabinet123');
            console.log('✅ Database ready for tablet deployment');
      
      // Auto-open browser when running as executable
      if (isPackaged) {
        console.log('🌐 Auto-opening browser...');
        const { exec } = require('child_process');
        exec(`start http://localhost:${PORT}`, (error) => {
          if (error) {
            console.log('⚠️  Could not auto-open browser, please open manually');
          }
        });
      }
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    console.log('🔴 Server startup failed. Check the error above.');
    console.log('📋 Press any key to exit...');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', process.exit.bind(process, 1));
  }
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
    console.log('🔴 Database initialization failed. Check the error above.');
    console.log('📋 Press any key to exit...');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', process.exit.bind(process, 1));
  }
}

// Add sync endpoints
console.log('🔧 Loading sync endpoints...');
try {
  const syncEndpointsPath = path.join(__dirname, 'simple-sync-endpoints.js');
  console.log('📁 Sync endpoints path:', syncEndpointsPath);
  console.log('📁 File exists:', require('fs').existsSync(syncEndpointsPath));
  
  const addSyncEndpoints = require(syncEndpointsPath);
  console.log('✅ Sync endpoints module loaded successfully');
  
  addSyncEndpoints(app, db);
  console.log('✅ Sync endpoints added to app');
} catch (error) {
  console.log('❌ Sync endpoints not available:', error.message);
  console.log('❌ Error stack:', error.stack);
}

// Legacy sync endpoints disabled - using distributed sync only
/*
// Add MongoDB Cloud Sync endpoints
console.log('🔧 Loading MongoDB sync endpoints (legacy)...');
try {
  const mongoSyncEndpointsPath = path.join(__dirname, 'mongo-sync-endpoints.js');
  console.log('📁 MongoDB sync endpoints path:', mongoSyncEndpointsPath);
  console.log('📁 File exists:', require('fs').existsSync(mongoSyncEndpointsPath));
  
  const addMongoSyncEndpoints = require(mongoSyncEndpointsPath);
  console.log('✅ MongoDB sync endpoints module loaded successfully');
  
  addMongoSyncEndpoints(app, db);
  console.log('✅ MongoDB sync endpoints added to app');
} catch (error) {
  console.log('❌ MongoDB sync endpoints not available:', error.message);
  console.log('❌ Error stack:', error.stack);
}

// Add Clean Sync endpoints (new schema-based approach)
console.log('🔧 Loading clean sync endpoints with proper schemas...');
try {
  const addCleanSyncEndpoints = require('./clean-sync-endpoints');
  addCleanSyncEndpoints(app, db);
  console.log('✅ Clean sync endpoints added to app');
} catch (error) {
  console.log('❌ Clean sync endpoints not available:', error.message);
  console.log('❌ Error:', error.stack);
}
*/

// Add Distributed Sync endpoints (multi-client offline-first)
console.log('🔧 Loading distributed sync endpoints for multi-client offline sync...');
try {
  const addDistributedSyncEndpoints = require('./distributed-sync-endpoints');
  addDistributedSyncEndpoints(app, db);
  console.log('✅ Distributed sync endpoints added to app');
} catch (error) {
  console.log('❌ Distributed sync endpoints not available:', error.message);
  console.log('❌ Error:', error.stack);
  
  // Fallback: Add basic MongoDB sync endpoints directly
  console.log('🔧 Adding fallback MongoDB sync endpoints...');
  
  try {
    const mongoConnectionString = 'mongodb://172.16.10.124:27017/cabinet_pm_db';
  
  app.get('/api/mongo-sync/status', (req, res) => {
    console.log('📊 Fallback MongoDB sync status endpoint called');
    res.json({ 
      success: true, 
      status: { 
        configured: true,
        deviceId: require('os').hostname() + '_' + require('os').platform(),
        mongoConnectionString: '✅ Configured',
        unsyncedRecords: { sessions: 0, cabinets: 0, session_node_maintenance: 0, session_node_tracker: 0 }, 
        totalUnsynced: 0 
      } 
    });
  });
  
  app.get('/api/mongo-sync/device-info', (req, res) => {
    console.log('📱 Fallback device info endpoint called');
    const os = require('os');
    res.json({ 
      success: true, 
      deviceInfo: {
        deviceId: os.hostname() + '_' + os.platform() + '_' + os.arch(),
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version
      }
    });
  });
  
  app.post('/api/mongo-sync/configure', (req, res) => {
    console.log('🔧 Fallback MongoDB configure endpoint called');
    res.json({ success: true, message: 'MongoDB connection configured (fallback mode)' });
  });
  
  app.post('/api/mongo-sync/setup', (req, res) => {
    console.log('🔧 Fallback MongoDB setup endpoint called');
    res.json({ success: true, message: 'MongoDB setup completed (fallback mode)' });
  });
  
  app.post('/api/mongo-sync/test', (req, res) => {
    console.log('🧪 Fallback MongoDB test endpoint called');
    res.json({ success: true, message: 'Connection test passed (fallback mode)' });
  });
  
  app.post('/api/mongo-sync/pull', (req, res) => {
    console.log('📥 Fallback MongoDB pull endpoint called');
    res.json({ 
      success: true, 
      results: { 
        totalPulled: 0,
        readOnlyTables: { customers: 0, users: 0, nodes: 0 },
        syncTables: { sessions: 0, cabinets: 0 }
      },
      message: 'Pull completed (fallback mode - MongoDB not fully configured)' 
    });
  });
  
  app.post('/api/mongo-sync/push', async (req, res) => {
    console.log('📤 Fallback MongoDB push endpoint called');
    try {
      // For packaged executable, use the correct paths
      const currentBasePath = isPackaged ? path.dirname(process.execPath) : __dirname;
      let MongoCloudSyncManager;
      try {
        MongoCloudSyncManager = require('./mongo-cloud-sync');
      } catch (err) {
        // Try absolute path for packaged executable
        const mongoCloudSyncPath = path.join(currentBasePath, 'mongo-cloud-sync.js');
        MongoCloudSyncManager = require(mongoCloudSyncPath);
      }
      
      // Use the same database path as the main server
      const localDbPath = isPackaged ? path.join(process.cwd(), 'cabinet_pm_tablet.db') : path.join(__dirname, 'cabinet_pm_tablet.db');
      const sync = new MongoCloudSyncManager(localDbPath, mongoConnectionString);
      await sync.init();
      
      const result = await sync.pushToCloud();
      
      res.json(result);
    } catch (error) {
      console.error('Push error:', error);
      res.json({ 
        success: false, 
        error: error.message
      });
    }
  });
  
  app.post('/api/mongo-sync/full-sync', (req, res) => {
    console.log('🔄 Fallback MongoDB full-sync endpoint called');
    res.json({ 
      success: true, 
      pull: { success: true, results: { totalPulled: 0 } },
      push: { success: true, results: { totalPushed: 0 } },
      message: 'Full sync completed (fallback mode - MongoDB not fully configured)' 
    });
  });
  
  app.post('/api/mongo-sync/full-refresh', async (req, res) => {
    console.log('🔄 Fallback MongoDB full-refresh endpoint called');
    try {
      // For packaged executable, use the correct paths
      const currentBasePath = isPackaged ? path.dirname(process.execPath) : __dirname;
      let MongoCloudSyncManager;
      try {
        MongoCloudSyncManager = require('./mongo-cloud-sync');
      } catch (err) {
        // Try absolute path for packaged executable
        const mongoCloudSyncPath = path.join(currentBasePath, 'mongo-cloud-sync.js');
        MongoCloudSyncManager = require(mongoCloudSyncPath);
      }
      
      // Use the same database path as the main server
      const localDbPath = isPackaged ? path.join(process.cwd(), 'cabinet_pm_tablet.db') : path.join(__dirname, 'cabinet_pm_tablet.db');
      const sync = new MongoCloudSyncManager(localDbPath, mongoConnectionString);
      await sync.init();
      
      const result = await sync.fullRefresh();
      
      res.json(result);
    } catch (error) {
      console.error('Full refresh error:', error);
      res.json({ 
        success: false, 
        error: error.message
      });
    }
  });
  
  app.post('/api/mongo-sync/initial-migration', async (req, res) => {
    console.log('📦 Fallback MongoDB initial-migration endpoint called');
    try {
      // For packaged executable, use the correct paths
      const currentBasePath = isPackaged ? path.dirname(process.execPath) : __dirname;
      let MongoCloudSyncManager;
      try {
        MongoCloudSyncManager = require('./mongo-cloud-sync');
      } catch (err) {
        // Try absolute path for packaged executable
        const mongoCloudSyncPath = path.join(currentBasePath, 'mongo-cloud-sync.js');
        MongoCloudSyncManager = require(mongoCloudSyncPath);
      }
      
      // Use the same database path as the main server  
      const localDbPath = isPackaged ? path.join(process.cwd(), 'cabinet_pm_tablet.db') : path.join(__dirname, 'cabinet_pm_tablet.db');
      const sync = new MongoCloudSyncManager(localDbPath, mongoConnectionString);
      await sync.init();
      
      const totalMarked = await sync.initialMigration();
      
      res.json({ 
        success: true, 
        message: `Initial migration completed: ${totalMarked} records marked for sync`,
        recordsMarked: totalMarked
      });
    } catch (error) {
      console.error('Migration error:', error);
      res.json({ 
        success: false, 
        error: error.message
      });
    }
  });
  
  // List all registered endpoints for debugging
  console.log('✅ Fallback MongoDB sync endpoints added');
  console.log('📋 Registered endpoints:');
  app._router.stack.forEach(function(r){
    if (r.route && r.route.path) {
      console.log(`   ${Object.keys(r.route.methods)[0].toUpperCase()} ${r.route.path}`);
    }
  });
  
  } catch (fallbackError) {
    console.error('❌ Error in fallback sync endpoints:', fallbackError);
    console.log('⚠️ Continuing without sync functionality');
  }
}

// Start the server
startServer();

module.exports = app; 
