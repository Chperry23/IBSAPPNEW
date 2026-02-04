const db = require('./database');
const bcrypt = require('bcryptjs');

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
      uuid TEXT,
      synced INTEGER DEFAULT 0,
      device_id TEXT,
      deleted INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) {
          console.error('❌ Error creating users table:', err);
        } else {
          console.log('✅ Created (or found) users table');
        }
      });

      // Add sync columns to existing users table
      db.run(`ALTER TABLE users ADD COLUMN uuid TEXT`, (err) => {});
      db.run(`ALTER TABLE users ADD COLUMN synced INTEGER DEFAULT 0`, (err) => {});
      db.run(`ALTER TABLE users ADD COLUMN device_id TEXT`, (err) => {});
      db.run(`ALTER TABLE users ADD COLUMN deleted INTEGER DEFAULT 0`, (err) => {});
      db.run(`ALTER TABLE users ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`, (err) => {});

    // Customers table
      db.run(`CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      location TEXT,
      contact_info TEXT,
      uuid TEXT,
      synced INTEGER DEFAULT 0,
      device_id TEXT,
      deleted INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) {
          console.error('❌ Error creating customers table:', err);
        } else {
          console.log('✅ Created (or found) customers table');
        }
      });

      // Add sync columns to existing customers table
      db.run(`ALTER TABLE customers ADD COLUMN uuid TEXT`, (err) => {});
      db.run(`ALTER TABLE customers ADD COLUMN synced INTEGER DEFAULT 0`, (err) => {});
      db.run(`ALTER TABLE customers ADD COLUMN device_id TEXT`, (err) => {});
      db.run(`ALTER TABLE customers ADD COLUMN deleted INTEGER DEFAULT 0`, (err) => {});

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
      device_id TEXT,
      deleted INTEGER DEFAULT 0,
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

      // Add device_id column if it doesn't exist
      db.run(`ALTER TABLE sessions ADD COLUMN device_id TEXT`, (err) => {
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
      cabinet_name TEXT NOT NULL,
      cabinet_location TEXT,
      cabinet_date DATE,
      status TEXT DEFAULT 'active',
      power_supplies TEXT DEFAULT '[]',
      distribution_blocks TEXT DEFAULT '[]',
      diodes TEXT DEFAULT '[]',
      network_equipment TEXT DEFAULT '[]',
      controllers TEXT DEFAULT '[]',
      inspection_data TEXT DEFAULT '{}',
      uuid TEXT,
      synced INTEGER DEFAULT 0,
      device_id TEXT,
      deleted INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (pm_session_id) REFERENCES sessions(id)
    )`);

    // Add sync columns to cabinets table
    db.run(`ALTER TABLE cabinets ADD COLUMN uuid TEXT`, (err) => {});
    db.run(`ALTER TABLE cabinets ADD COLUMN synced INTEGER DEFAULT 0`, (err) => {});
    db.run(`ALTER TABLE cabinets ADD COLUMN device_id TEXT`, (err) => {});
    db.run(`ALTER TABLE cabinets ADD COLUMN deleted INTEGER DEFAULT 0`, (err) => {});

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

    // Add sync columns to existing nodes table
    db.run(`ALTER TABLE nodes ADD COLUMN uuid TEXT`, (err) => {});
    db.run(`ALTER TABLE nodes ADD COLUMN synced INTEGER DEFAULT 0`, (err) => {});
    db.run(`ALTER TABLE nodes ADD COLUMN device_id TEXT`, (err) => {});
    db.run(`ALTER TABLE nodes ADD COLUMN deleted INTEGER DEFAULT 0`, (err) => {});

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
      notes TEXT,
      dv_reason TEXT,
      os_reason TEXT,
      macafee_reason TEXT,
      hf_reason TEXT,
      firmware_reason TEXT,
      is_custom_node BOOLEAN DEFAULT FALSE,
      completed BOOLEAN DEFAULT FALSE,
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
    db.run(`ALTER TABLE session_node_maintenance ADD COLUMN notes TEXT`, (err) => {
      // Column already exists, ignore error
    });
    db.run(`ALTER TABLE session_node_maintenance ADD COLUMN completed BOOLEAN DEFAULT FALSE`, (err) => {
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
    
    // Add reason fields for unchecked items
    db.run(`ALTER TABLE session_node_maintenance ADD COLUMN dv_reason TEXT`, (err) => {
      // Column already exists, ignore error
    });
    db.run(`ALTER TABLE session_node_maintenance ADD COLUMN os_reason TEXT`, (err) => {
      // Column already exists, ignore error
    });
    db.run(`ALTER TABLE session_node_maintenance ADD COLUMN macafee_reason TEXT`, (err) => {
      // Column already exists, ignore error
    });
    db.run(`ALTER TABLE session_node_maintenance ADD COLUMN hf_reason TEXT`, (err) => {
      // Column already exists, ignore error
    });
    db.run(`ALTER TABLE session_node_maintenance ADD COLUMN firmware_reason TEXT`, (err) => {
      // Column already exists, ignore error
    });
    
    // Add flag for custom nodes
    db.run(`ALTER TABLE session_node_maintenance ADD COLUMN is_custom_node BOOLEAN DEFAULT FALSE`, (err) => {
      // Column already exists, ignore error
    });

    // Session node tracker table
      db.run(`CREATE TABLE IF NOT EXISTS session_node_tracker (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      node_id INTEGER NOT NULL,
      completed BOOLEAN DEFAULT FALSE,
      notes TEXT,
      uuid TEXT,
      synced INTEGER DEFAULT 0,
      device_id TEXT,
      deleted INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      FOREIGN KEY (node_id) REFERENCES nodes(id),
      UNIQUE(session_id, node_id)
    )`);

    // Add sync columns to session_node_tracker table
    db.run(`ALTER TABLE session_node_tracker ADD COLUMN uuid TEXT`, (err) => {});
    db.run(`ALTER TABLE session_node_tracker ADD COLUMN synced INTEGER DEFAULT 0`, (err) => {});
    db.run(`ALTER TABLE session_node_tracker ADD COLUMN device_id TEXT`, (err) => {});
    db.run(`ALTER TABLE session_node_tracker ADD COLUMN deleted INTEGER DEFAULT 0`, (err) => {});

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

    // Cabinet names table (SQLite local; MongoDB sync uses cabinet_locations)
    db.run(`CREATE TABLE IF NOT EXISTS cabinet_names (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      location_name TEXT NOT NULL,
      description TEXT,
      is_collapsed BOOLEAN DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted INTEGER DEFAULT 0,
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      UNIQUE(session_id, location_name)
    )`);
    db.run(`ALTER TABLE cabinet_names ADD COLUMN deleted INTEGER DEFAULT 0`, (err) => {});

    // Cabinet Locations table
    db.run(`CREATE TABLE IF NOT EXISTS cabinet_locations (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      location_name TEXT NOT NULL,
      description TEXT,
      is_collapsed BOOLEAN DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      uuid TEXT,
      synced INTEGER DEFAULT 0,
      device_id TEXT,
      deleted INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      UNIQUE(session_id, location_name)
    )`);

    // Add sync columns to cabinet_locations table
    db.run(`ALTER TABLE cabinet_locations ADD COLUMN uuid TEXT`, (err) => {});
    db.run(`ALTER TABLE cabinet_locations ADD COLUMN synced INTEGER DEFAULT 0`, (err) => {});
    db.run(`ALTER TABLE cabinet_locations ADD COLUMN device_id TEXT`, (err) => {});
    db.run(`ALTER TABLE cabinet_locations ADD COLUMN deleted INTEGER DEFAULT 0`, (err) => {});

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
    db.run(`ALTER TABLE session_pm_notes ADD COLUMN uuid TEXT`, (err) => {});
    db.run(`ALTER TABLE session_pm_notes ADD COLUMN synced INTEGER DEFAULT 0`, (err) => {});
    db.run(`ALTER TABLE session_pm_notes ADD COLUMN device_id TEXT`, (err) => {});
    db.run(`ALTER TABLE session_pm_notes ADD COLUMN deleted INTEGER DEFAULT 0`, (err) => {});

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
      session_id TEXT,
      document_id TEXT,
      clamp_on_rms_ammeter BOOLEAN DEFAULT FALSE,
      digit_dvm BOOLEAN DEFAULT FALSE,
      fluke_1630_earth_ground BOOLEAN DEFAULT FALSE,
      fluke_mt8200_micromapper BOOLEAN DEFAULT FALSE,
      notes TEXT,
      uuid TEXT,
      synced INTEGER DEFAULT 0,
      device_id TEXT,
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

    // Add sync columns to existing session_ii_equipment table
    db.run(`ALTER TABLE session_ii_equipment ADD COLUMN session_id TEXT`, (err) => {});
    db.run(`ALTER TABLE session_ii_equipment ADD COLUMN device_id TEXT`, (err) => {});

    // I&I Checklist Items table
    db.run(`CREATE TABLE IF NOT EXISTS session_ii_checklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      document_id TEXT,
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
      device_id TEXT,
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

    // Add sync columns to existing session_ii_checklist table
    db.run(`ALTER TABLE session_ii_checklist ADD COLUMN session_id TEXT`, (err) => {});
    db.run(`ALTER TABLE session_ii_checklist ADD COLUMN device_id TEXT`, (err) => {});

    // I&I Equipment Used table
    db.run(`CREATE TABLE IF NOT EXISTS session_ii_equipment_used (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      document_id TEXT,
      manufacturer TEXT,
      type TEXT,
      serial_number TEXT,
      recalibration_date DATE,
      used_in_section TEXT,
      uuid TEXT,
      synced INTEGER DEFAULT 0,
      device_id TEXT,
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

    // Add sync columns to existing session_ii_equipment_used table
    db.run(`ALTER TABLE session_ii_equipment_used ADD COLUMN session_id TEXT`, (err) => {});
    db.run(`ALTER TABLE session_ii_equipment_used ADD COLUMN device_id TEXT`, (err) => {});

    // Create sync_metadata table for tracking sync state
    db.run(`CREATE TABLE IF NOT EXISTS sync_metadata (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (err) {
        console.error('❌ Error creating sync_metadata table:', err);
      } else {
        console.log('✅ Created (or found) sync_metadata table');
      }
    });

    // Database migrations - add columns if they don't exist
    const addColumnIfNotExists = (tableName, columnName, columnType) => {
      db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
        if (err) {
          console.error(`❌ Error getting table info for ${tableName}:`, err);
          return;
        }
        if (!columns) {
          console.error(`❌ No column info returned for table ${tableName}`);
          return;
        }
        
        const columnExists = columns.some(col => col.name === columnName);
        
        if (!columnExists) {
          db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`, (alterErr) => {
            if (alterErr && !alterErr.message.includes('duplicate column')) {
              console.error(`❌ Error adding column ${columnName} to ${tableName}:`, alterErr);
            } else {
              console.log(`✅ Added ${columnName} column to ${tableName}`);
            }
          });
        }
      });
    };

    // ============================================================
    // CRITICAL: Add sync columns to ALL tables (for existing databases)
    // ============================================================
    console.log('🔧 Running database migrations...');
    
    // Users table
    addColumnIfNotExists('users', 'uuid', 'TEXT');
    addColumnIfNotExists('users', 'synced', 'INTEGER DEFAULT 0');
    addColumnIfNotExists('users', 'device_id', 'TEXT');
    addColumnIfNotExists('users', 'deleted', 'INTEGER DEFAULT 0');
    
    // Customers table
    addColumnIfNotExists('customers', 'uuid', 'TEXT');
    addColumnIfNotExists('customers', 'synced', 'INTEGER DEFAULT 0');
    addColumnIfNotExists('customers', 'device_id', 'TEXT');
    addColumnIfNotExists('customers', 'deleted', 'INTEGER DEFAULT 0');
    
    // Sessions table
    addColumnIfNotExists('sessions', 'uuid', 'TEXT');
    addColumnIfNotExists('sessions', 'synced', 'INTEGER DEFAULT 0');
    addColumnIfNotExists('sessions', 'device_id', 'TEXT');
    addColumnIfNotExists('sessions', 'deleted', 'INTEGER DEFAULT 0');
    
    // Cabinets table
    addColumnIfNotExists('cabinets', 'uuid', 'TEXT');
    addColumnIfNotExists('cabinets', 'synced', 'INTEGER DEFAULT 0');
    addColumnIfNotExists('cabinets', 'device_id', 'TEXT');
    addColumnIfNotExists('cabinets', 'deleted', 'INTEGER DEFAULT 0');
    
    // Nodes table
    addColumnIfNotExists('nodes', 'uuid', 'TEXT');
    addColumnIfNotExists('nodes', 'synced', 'INTEGER DEFAULT 0');
    addColumnIfNotExists('nodes', 'device_id', 'TEXT');
    addColumnIfNotExists('nodes', 'deleted', 'INTEGER DEFAULT 0');
    
    // Session node maintenance table
    addColumnIfNotExists('session_node_maintenance', 'uuid', 'TEXT');
    addColumnIfNotExists('session_node_maintenance', 'synced', 'INTEGER DEFAULT 0');
    addColumnIfNotExists('session_node_maintenance', 'device_id', 'TEXT');
    addColumnIfNotExists('session_node_maintenance', 'deleted', 'INTEGER DEFAULT 0');
    
    // Session node tracker table
    addColumnIfNotExists('session_node_tracker', 'uuid', 'TEXT');
    addColumnIfNotExists('session_node_tracker', 'synced', 'INTEGER DEFAULT 0');
    addColumnIfNotExists('session_node_tracker', 'device_id', 'TEXT');
    addColumnIfNotExists('session_node_tracker', 'deleted', 'INTEGER DEFAULT 0');
    
    // Cabinet locations table
    addColumnIfNotExists('cabinet_locations', 'uuid', 'TEXT');
    addColumnIfNotExists('cabinet_locations', 'synced', 'INTEGER DEFAULT 0');
    addColumnIfNotExists('cabinet_locations', 'device_id', 'TEXT');
    addColumnIfNotExists('cabinet_locations', 'deleted', 'INTEGER DEFAULT 0');
    
    // Session PM notes table
    addColumnIfNotExists('session_pm_notes', 'uuid', 'TEXT');
    addColumnIfNotExists('session_pm_notes', 'synced', 'INTEGER DEFAULT 0');
    addColumnIfNotExists('session_pm_notes', 'device_id', 'TEXT');
    addColumnIfNotExists('session_pm_notes', 'deleted', 'INTEGER DEFAULT 0');
    
    // Session II documents table
    addColumnIfNotExists('session_ii_documents', 'uuid', 'TEXT');
    addColumnIfNotExists('session_ii_documents', 'synced', 'INTEGER DEFAULT 0');
    addColumnIfNotExists('session_ii_documents', 'device_id', 'TEXT');
    addColumnIfNotExists('session_ii_documents', 'deleted', 'INTEGER DEFAULT 0');
    
    // Session II equipment table
    addColumnIfNotExists('session_ii_equipment', 'uuid', 'TEXT');
    addColumnIfNotExists('session_ii_equipment', 'synced', 'INTEGER DEFAULT 0');
    addColumnIfNotExists('session_ii_equipment', 'device_id', 'TEXT');
    addColumnIfNotExists('session_ii_equipment', 'deleted', 'INTEGER DEFAULT 0');
    addColumnIfNotExists('session_ii_equipment', 'document_id', 'TEXT');
    
    // Session II checklist table
    addColumnIfNotExists('session_ii_checklist', 'uuid', 'TEXT');
    addColumnIfNotExists('session_ii_checklist', 'synced', 'INTEGER DEFAULT 0');
    addColumnIfNotExists('session_ii_checklist', 'device_id', 'TEXT');
    addColumnIfNotExists('session_ii_checklist', 'deleted', 'INTEGER DEFAULT 0');
    
    // Session II equipment used table
    addColumnIfNotExists('session_ii_equipment_used', 'uuid', 'TEXT');
    addColumnIfNotExists('session_ii_equipment_used', 'synced', 'INTEGER DEFAULT 0');
    addColumnIfNotExists('session_ii_equipment_used', 'device_id', 'TEXT');
    addColumnIfNotExists('session_ii_equipment_used', 'deleted', 'INTEGER DEFAULT 0');
    addColumnIfNotExists('session_ii_equipment_used', 'document_id', 'TEXT');
    
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
    
    // Migrate cabinet_location to cabinet_name
    db.all(`PRAGMA table_info(cabinets)`, (err, columns) => {
      if (!err && columns) {
        const hasCabinetLocation = columns.some(col => col.name === 'cabinet_location');
        const hasCabinetName = columns.some(col => col.name === 'cabinet_name');
        
        if (hasCabinetLocation && !hasCabinetName) {
          console.log('🔄 Migrating cabinet_location to cabinet_name...');
          // Add new column
          db.run(`ALTER TABLE cabinets ADD COLUMN cabinet_name TEXT`, (err) => {
            if (!err) {
              // Copy data from old column to new
              db.run(`UPDATE cabinets SET cabinet_name = cabinet_location WHERE cabinet_name IS NULL`, (err) => {
                if (!err) {
                  console.log('✅ Successfully migrated cabinet_location to cabinet_name');
                } else {
                  console.error('Error copying cabinet_location data:', err);
                }
              });
            } else if (!err.message.includes('duplicate column name')) {
              console.error('Error adding cabinet_name column:', err);
            }
          });
        } else if (!hasCabinetLocation && hasCabinetName) {
          console.log('✓ Cabinet table already using cabinet_name column');
        } else if (hasCabinetLocation && hasCabinetName) {
          // Both columns exist, ensure data is synced
          db.run(`UPDATE cabinets SET cabinet_name = cabinet_location WHERE cabinet_name IS NULL OR cabinet_name = ''`, () => {
            console.log('✓ Synced cabinet_location to cabinet_name');
          });
        }
      }
    });
    
    // Add cabinet_type column for cabinet/rack differentiation
    addColumnIfNotExists('cabinets', 'cabinet_type', 'TEXT DEFAULT "cabinet"');
    
    // Add workstations column for racks
    addColumnIfNotExists('cabinets', 'workstations', 'TEXT DEFAULT "[]"');
    
    // Add rack equipment flags and comments
    addColumnIfNotExists('cabinets', 'rack_has_ups', 'INTEGER DEFAULT 0');
    addColumnIfNotExists('cabinets', 'rack_has_hmi', 'INTEGER DEFAULT 0');
    addColumnIfNotExists('cabinets', 'rack_has_kvm', 'INTEGER DEFAULT 0');
    addColumnIfNotExists('cabinets', 'rack_has_monitor', 'INTEGER DEFAULT 0');
    addColumnIfNotExists('cabinets', 'comments', 'TEXT');

    console.log('✅ Database tables initialized successfully');
    
    // Debug: Check cabinet data after initialization
    db.all('SELECT id, COALESCE(cabinet_name, cabinet_location) as name, power_supplies, distribution_blocks, diodes, network_equipment, controllers FROM cabinets', (err, cabinets) => {
      if (!err) {
        console.log(`🔍 DEBUG: Found ${cabinets.length} cabinets in database after initialization`);
        cabinets.forEach(cabinet => {
          console.log(`📦 Cabinet: ${cabinet.name} (ID: ${cabinet.id})`);
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

module.exports = { initializeDatabase };

