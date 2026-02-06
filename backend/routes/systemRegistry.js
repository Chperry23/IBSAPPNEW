const express = require('express');
const router = express.Router();
const db = require('../config/database');
const requireAuth = require('../middleware/auth');
const xml2js = require('xml2js');

// Import system registry from XML
router.post('/api/customers/:customerId/system-registry/import', requireAuth, async (req, res) => {
  const customerId = req.params.customerId;
  const { xmlData } = req.body;
  
  console.log('🔵 [SYSTEM REGISTRY] Import request received for customer:', customerId);
  console.log('🔵 [SYSTEM REGISTRY] XML data length:', xmlData?.length || 0, 'characters');
  
  if (!xmlData) {
    return res.status(400).json({ error: 'No XML data provided' });
  }
  
  try {
    // Configure parser to be more lenient with XML issues
    const parser = new xml2js.Parser({ 
      explicitArray: false,
      strict: false,  // Don't fail on invalid XML
      trim: true,     // Trim whitespace
      normalize: true, // Normalize whitespace
      normalizeTags: false, // Keep tag case as-is
      attrkey: 'attributes',
      charkey: 'value'
    });
    
    // Try to clean common XML issues before parsing
    let cleanedXml = xmlData;
    
    // Replace common problematic characters that should be escaped
    // But be careful not to break valid entities
    const entityPattern = /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g;
    if (entityPattern.test(cleanedXml)) {
      console.log('⚠️ [SYSTEM REGISTRY] Found unescaped ampersands, attempting to fix...');
      cleanedXml = cleanedXml.replace(entityPattern, '&amp;');
    }
    
    const result = await parser.parseStringPromise(cleanedXml);
    
    console.log('🔵 [SYSTEM REGISTRY] XML parsed successfully');
    console.log('🔵 [SYSTEM REGISTRY] Root keys:', Object.keys(result));
    
    // Extract the root element - handle both formats
    let root = result.Export || result.System || result;
    
    // Check for DeltaV System Registration format
    // Structure: <registration><AutoData><DeltaVSystem>...
    if (result.registration || result.REGISTRATION) {
      const reg = result.registration || result.REGISTRATION;
      console.log('🔵 [SYSTEM REGISTRY] Detected DeltaV System Registration format');
      console.log('🔵 [SYSTEM REGISTRY] REGISTRATION keys:', Object.keys(reg));
      console.log('🔵 [SYSTEM REGISTRY] REGISTRATION type:', typeof reg);
      
      // Check for various casings of AutoData
      const autoData = reg.AutoData || reg.autodata || reg.AUTODATA || reg.autoData;
      
      if (autoData) {
        console.log('🔵 [SYSTEM REGISTRY] Found AutoData section');
        console.log('🔵 [SYSTEM REGISTRY] AutoData keys:', Object.keys(autoData));
        
        // Create a virtual root with the expected structure
        root = {};
        
        // Extract from DeltaVSystem (check various casings)
        const dvSys = autoData.DeltaVSystem || autoData.deltavSystem || autoData.DELTAVSYSTEM || autoData.deltavsystem;
        
        if (dvSys) {
          console.log('🔵 [SYSTEM REGISTRY] Found DeltaVSystem with keys:', Object.keys(dvSys));
          
          // Handle both uppercase and normal case
          root.Workstation = dvSys.Workstation || dvSys.WORKSTATION || dvSys.workstation;
          root.Controller = dvSys.Controller || dvSys.CONTROLLER || dvSys.controller;
          root.SmartSwitch = dvSys.SmartSwitch || dvSys.SMARTSWITCH || dvSys.smartswitch;
          root.CharmsIOCard = dvSys.CharmsIOCard || dvSys.CHARMSIOCARD || dvSys.charmsiocard;
        } else {
          console.warn('⚠️ [SYSTEM REGISTRY] DeltaVSystem not found in AutoData');
          console.warn('⚠️ [SYSTEM REGISTRY] AutoData keys:', Object.keys(autoData));
        }
        
        // Extract from IOBusDevices (check various casings)
        const ioBus = autoData.IOBusDevices || autoData.iobusdevices || autoData.IOBUSDEVICES || autoData.ioBusDevices;
        
        if (ioBus) {
          console.log('🔵 [SYSTEM REGISTRY] Found IOBusDevices section');
          // Handle both uppercase and normal case
          root.IODevice = ioBus.IODevice || ioBus.IODEVICE || ioBus.iodevice;
        }
        
        // Extract AMSSystem (check various casings)
        const ams = autoData.AMSSystem || autoData.amssystem || autoData.AMSSYSTEM || autoData.amsSystem;
        
        if (ams) {
          console.log('🔵 [SYSTEM REGISTRY] Found AMSSystem section');
          root.AMSSystem = ams;
        }
      } else {
        console.warn('⚠️ [SYSTEM REGISTRY] AutoData section not found in REGISTRATION');
        console.warn('⚠️ [SYSTEM REGISTRY] Available keys:', Object.keys(reg));
        console.warn('⚠️ [SYSTEM REGISTRY] First few chars of reg:', JSON.stringify(reg).substring(0, 500));
      }
    }
    
    console.log('🔵 [SYSTEM REGISTRY] Using root element with keys:', Object.keys(root));
    
    // Check what table names are present
    const availableTables = Object.keys(root).filter(key => 
      ['Workstation', 'Controller', 'SmartSwitch', 'IODevice', 'CharmsIOCard', 'Charm', 'AMSSystem'].includes(key)
    );
    console.log('🔵 [SYSTEM REGISTRY] Available table names:', availableTables);
    
    if (availableTables.length === 0) {
      console.warn('⚠️ [SYSTEM REGISTRY] No recognized table names found in XML');
      console.warn('⚠️ [SYSTEM REGISTRY] Expected: Workstation, Controller, SmartSwitch, IODevice, CharmsIOCard, Charm, AMSSystem');
      console.warn('⚠️ [SYSTEM REGISTRY] Found keys:', Object.keys(root));
    }
    
    let stats = {
      workstations: 0,
      smartSwitches: 0,
      ioDevices: 0,
      controllers: 0,
      charmsIOCards: 0,
      charms: 0,
      amsSystems: 0
    };
    
    // Parse Workstation table
    if (root.Workstation) {
      const workstations = Array.isArray(root.Workstation) ? root.Workstation : [root.Workstation];
      console.log('🔵 [SYSTEM REGISTRY] Processing', workstations.length, 'workstations');
      
      for (const ws of workstations) {
        try {
          // Helper to get field value regardless of case
          const getField = (obj, fieldName) => {
            return obj[fieldName] || obj[fieldName.toUpperCase()] || obj[fieldName.toLowerCase()] || null;
          };
          
          await db.prepare(`
            INSERT OR REPLACE INTO sys_workstations (
              customer_id, name, model, type, redundant, software_revision,
              dv_hotfixes, os_name, ms_office_installed, terminal_server,
              domain_controller, iddc, dell_service_tag_number, computer_model,
              bios_version, memory, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `).run([
            customerId,
            getField(ws, 'Name') || '',
            getField(ws, 'Model'),
            getField(ws, 'Type'),
            getField(ws, 'Redundant'),
            getField(ws, 'SoftwareRevision'),
            getField(ws, 'DVHotFixes'),
            getField(ws, 'OSName'),
            getField(ws, 'MSOfficeInstalled'),
            getField(ws, 'TerminalServer'),
            getField(ws, 'DomainController'),
            getField(ws, 'IDDC'),
            getField(ws, 'DellServiceTagNumber'),
            getField(ws, 'ComputerModel'),
            getField(ws, 'BIOSVersion'),
            getField(ws, 'Memory')
          ]);
          stats.workstations++;
        } catch (err) {
          console.error('Error inserting workstation:', err);
        }
      }
    }
    
    // Parse SmartSwitch table
    if (root.SmartSwitch) {
      const switches = Array.isArray(root.SmartSwitch) ? root.SmartSwitch : [root.SmartSwitch];
      console.log('🔵 [SYSTEM REGISTRY] Processing', switches.length, 'smart switches');
      
      for (const sw of switches) {
        try {
          const getField = (obj, fieldName) => {
            return obj[fieldName] || obj[fieldName.toUpperCase()] || obj[fieldName.toLowerCase()] || null;
          };
          
          await db.prepare(`
            INSERT OR REPLACE INTO sys_smart_switches (
              customer_id, name, model, software_revision, hardware_revision,
              serial_number, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `).run([
            customerId,
            getField(sw, 'Name') || '',
            getField(sw, 'Model'),
            getField(sw, 'SoftwareRevision'),
            getField(sw, 'HardwareRevision'),
            getField(sw, 'SerialNumber')
          ]);
          stats.smartSwitches++;
        } catch (err) {
          console.error('Error inserting smart switch:', err);
        }
      }
    }
    
    // Parse IODevice table
    if (root.IODevice) {
      const devices = Array.isArray(root.IODevice) ? root.IODevice : [root.IODevice];
      console.log('🔵 [SYSTEM REGISTRY] Processing', devices.length, 'I/O devices');
      
      // Clear existing IO devices for this customer first
      await db.prepare('DELETE FROM sys_io_devices WHERE customer_id = ?').run([customerId]);
      
      for (const dev of devices) {
        try {
          const getField = (obj, fieldName) => {
            return obj[fieldName] || obj[fieldName.toUpperCase()] || obj[fieldName.toLowerCase()] || null;
          };
          
          await db.prepare(`
            INSERT INTO sys_io_devices (
              customer_id, bus_type, device_type, node, card,
              device_name, channel, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `).run([
            customerId,
            getField(dev, 'BusType'),
            getField(dev, 'DeviceType'),
            getField(dev, 'Node'),
            getField(dev, 'Card'),
            getField(dev, 'DeviceName'),
            getField(dev, 'Channel')
          ]);
          stats.ioDevices++;
        } catch (err) {
          console.error('Error inserting IO device:', err);
        }
      }
    }
    
    // Parse Controller table
    if (root.Controller) {
      const controllers = Array.isArray(root.Controller) ? root.Controller : [root.Controller];
      console.log('🔵 [SYSTEM REGISTRY] Processing', controllers.length, 'controllers');
      
      for (const ctrl of controllers) {
        try {
          const getField = (obj, fieldName) => {
            return obj[fieldName] || obj[fieldName.toUpperCase()] || obj[fieldName.toLowerCase()] || null;
          };
          
          await db.prepare(`
            INSERT OR REPLACE INTO sys_controllers (
              customer_id, name, model, software_revision, hardware_revision,
              serial_number, controller_free_memory, redundant, partner_model,
              partner_software_revision, partner_hardware_revision,
              partner_serial_number, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `).run([
            customerId,
            getField(ctrl, 'Name') || '',
            getField(ctrl, 'Model'),
            getField(ctrl, 'SoftwareRevision'),
            getField(ctrl, 'HardwareRevision'),
            getField(ctrl, 'SerialNumber'),
            getField(ctrl, 'ControllerFreeMemory'),
            getField(ctrl, 'Redundant'),
            getField(ctrl, 'PartnerModel'),
            getField(ctrl, 'PartnerSoftwareRevision'),
            getField(ctrl, 'PartnerHardwareRevision'),
            getField(ctrl, 'PartnerSerialNumber')
          ]);
          stats.controllers++;
        } catch (err) {
          console.error('Error inserting controller:', err);
        }
      }
    }
    
    // Parse CharmsIOCard table (and nested Charms)
    if (root.CharmsIOCard) {
      const cards = Array.isArray(root.CharmsIOCard) ? root.CharmsIOCard : [root.CharmsIOCard];
      console.log('🔵 [SYSTEM REGISTRY] Processing', cards.length, 'Charms I/O cards');
      
      // Clear existing Charms for this customer before importing (to avoid duplicates from schema changes)
      await db.prepare('DELETE FROM sys_charms WHERE customer_id = ?').run([customerId]);
      console.log('🔵 [SYSTEM REGISTRY] Cleared existing Charms for fresh import');
      
      for (const card of cards) {
        try {
          const getField = (obj, fieldName) => {
            return obj[fieldName] || obj[fieldName.toUpperCase()] || obj[fieldName.toLowerCase()] || null;
          };
          
          await db.prepare(`
            INSERT OR REPLACE INTO sys_charms_io_cards (
              customer_id, name, model, software_revision, hardware_revision,
              serial_number, redundant, partner_model, partner_software_revision,
              partner_hardware_revision, partner_serial_number, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `).run([
            customerId,
            getField(card, 'Name') || '',
            getField(card, 'Model'),
            getField(card, 'SoftwareRevision'),
            getField(card, 'HardwareRevision'),
            getField(card, 'SerialNumber'),
            getField(card, 'Redundant'),
            getField(card, 'PartnerModel'),
            getField(card, 'PartnerSoftwareRevision'),
            getField(card, 'PartnerHardwareRevision'),
            getField(card, 'PartnerSerialNumber')
          ]);
          stats.charmsIOCards++;
          
          // Extract nested Charm elements from within this CharmsIOCard (check case variations)
          const nestedCharms = card.Charm || card.CHARM || card.charm;
          if (nestedCharms) {
            const charms = Array.isArray(nestedCharms) ? nestedCharms : [nestedCharms];
            const ciocName = getField(card, 'Name');
            console.log('🔵 [SYSTEM REGISTRY] Found', charms.length, 'nested Charms in', ciocName);
            
            for (const charm of charms) {
              try {
                await db.prepare(`
                  INSERT INTO sys_charms (
                    customer_id, charms_io_card_name, name, model, software_revision, 
                    hardware_revision, serial_number, updated_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                `).run([
                  customerId,
                  ciocName, // Store which CIOC this charm belongs to
                  getField(charm, 'Name') || '',
                  getField(charm, 'Model'),
                  getField(charm, 'SoftwareRevision'),
                  getField(charm, 'HardwareRevision'),
                  getField(charm, 'SerialNumber')
                ]);
                stats.charms++;
              } catch (err) {
                console.error('Error inserting nested charm:', err);
              }
            }
          }
        } catch (err) {
          console.error('Error inserting Charms IO card:', err);
        }
      }
    }
    
    // Also parse standalone Charm table (if they exist at root level)
    if (root.Charm) {
      const charms = Array.isArray(root.Charm) ? root.Charm : [root.Charm];
      console.log('🔵 [SYSTEM REGISTRY] Processing', charms.length, 'standalone Charms');
      
      for (const charm of charms) {
        try {
          const getField = (obj, fieldName) => {
            return obj[fieldName] || obj[fieldName.toUpperCase()] || obj[fieldName.toLowerCase()] || null;
          };
          
          await db.prepare(`
            INSERT INTO sys_charms (
              customer_id, charms_io_card_name, name, model, software_revision, 
              hardware_revision, serial_number, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `).run([
            customerId,
            null, // No parent CIOC for standalone charms
            getField(charm, 'Name') || '',
            getField(charm, 'Model'),
            getField(charm, 'SoftwareRevision'),
            getField(charm, 'HardwareRevision'),
            getField(charm, 'SerialNumber')
          ]);
          stats.charms++;
        } catch (err) {
          console.error('Error inserting charm:', err);
        }
      }
    }
    
    // Parse AMSSystem table
    if (root.AMSSystem) {
      const ams = Array.isArray(root.AMSSystem) ? root.AMSSystem[0] : root.AMSSystem;
      
      try {
        const getField = (obj, fieldName) => {
          return obj[fieldName] || obj[fieldName.toUpperCase()] || obj[fieldName.toLowerCase()] || null;
        };
        
        await db.prepare(`
          INSERT OR REPLACE INTO sys_ams_systems (
            customer_id, software_revision, updated_at
          ) VALUES (?, ?, CURRENT_TIMESTAMP)
        `).run([
          customerId,
          getField(ams, 'SoftwareRevision')
        ]);
        stats.amsSystems++;
      } catch (err) {
        console.error('Error inserting AMS system:', err);
      }
    }
    
    // If no standard tables found, provide helpful message
    const totalImported = Object.values(stats).reduce((a, b) => a + b, 0);
    if (totalImported === 0) {
      console.warn('⚠️ [SYSTEM REGISTRY] No data was imported!');
      console.warn('⚠️ [SYSTEM REGISTRY] This usually means the XML structure doesn\'t match the expected format.');
      console.warn('⚠️ [SYSTEM REGISTRY] Please check the sample XML file for the correct format.');
    }
    
    console.log('✅ [SYSTEM REGISTRY] Import completed successfully');
    console.log('✅ [SYSTEM REGISTRY] Stats:', JSON.stringify(stats, null, 2));
    console.log('💡 [SYSTEM REGISTRY] PM Sessions will now read directly from System Registry tables');
    
    res.json({
      success: true,
      message: 'System registry imported successfully - ready for PM sessions',
      stats
    });
  } catch (error) {
    console.error('❌ [SYSTEM REGISTRY] Import error:', error);
    console.error('❌ [SYSTEM REGISTRY] Error stack:', error.stack);
    
    // Provide helpful error messages based on the error type
    let userMessage = 'Failed to parse XML data';
    let helpText = '';
    
    if (error.message.includes('Invalid character entity')) {
      userMessage = 'XML contains invalid character entities';
      helpText = 'This usually means there are unescaped special characters (like & or <) in the data. ' +
                 'Try opening the XML in a text editor and searching for line ' + 
                 (error.message.match(/Line: (\d+)/) ? error.message.match(/Line: (\d+)/)[1] : 'unknown') +
                 '. Look for ampersands (&) that should be &amp; or other special characters.';
    } else if (error.message.includes('Unclosed tag') || error.message.includes('Unexpected close tag')) {
      userMessage = 'XML has malformed tags';
      helpText = 'One or more XML tags are not properly closed or nested.';
    } else if (error.message.includes('Attribute without value')) {
      userMessage = 'XML has attributes without values';
      helpText = 'All XML attributes must have values in quotes.';
    }
    
    console.error('❌ [SYSTEM REGISTRY] User message:', userMessage);
    console.error('❌ [SYSTEM REGISTRY] Help text:', helpText);
    
    res.status(500).json({ 
      error: userMessage,
      details: error.message,
      help: helpText,
      lineNumber: error.message.match(/Line: (\d+)/) ? error.message.match(/Line: (\d+)/)[1] : null
    });
  }
});

// Get system registry summary for a customer
router.get('/api/customers/:customerId/system-registry/summary', requireAuth, async (req, res) => {
  const customerId = req.params.customerId;
  
  try {
    const workstations = await db.prepare('SELECT COUNT(*) as count FROM sys_workstations WHERE customer_id = ?').get([customerId]);
    const smartSwitches = await db.prepare('SELECT COUNT(*) as count FROM sys_smart_switches WHERE customer_id = ?').get([customerId]);
    const ioDevices = await db.prepare('SELECT COUNT(*) as count FROM sys_io_devices WHERE customer_id = ?').get([customerId]);
    const controllers = await db.prepare('SELECT COUNT(*) as count FROM sys_controllers WHERE customer_id = ?').get([customerId]);
    const charmsIOCards = await db.prepare('SELECT COUNT(*) as count FROM sys_charms_io_cards WHERE customer_id = ?').get([customerId]);
    const charms = await db.prepare('SELECT COUNT(*) as count FROM sys_charms WHERE customer_id = ?').get([customerId]);
    const amsSystems = await db.prepare('SELECT COUNT(*) as count FROM sys_ams_systems WHERE customer_id = ?').get([customerId]);
    
    res.json({
      workstations: workstations?.count || 0,
      smartSwitches: smartSwitches?.count || 0,
      ioDevices: ioDevices?.count || 0,
      controllers: controllers?.count || 0,
      charmsIOCards: charmsIOCards?.count || 0,
      charms: charms?.count || 0,
      amsSystems: amsSystems?.count || 0
    });
  } catch (error) {
    console.error('Get summary error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get workstations for a customer
router.get('/api/customers/:customerId/system-registry/workstations', requireAuth, async (req, res) => {
  const customerId = req.params.customerId;
  
  try {
    const workstations = await db.prepare('SELECT * FROM sys_workstations WHERE customer_id = ? ORDER BY name').all([customerId]);
    res.json(workstations);
  } catch (error) {
    console.error('Get workstations error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get controllers for a customer
router.get('/api/customers/:customerId/system-registry/controllers', requireAuth, async (req, res) => {
  const customerId = req.params.customerId;
  
  try {
    const controllers = await db.prepare('SELECT * FROM sys_controllers WHERE customer_id = ? ORDER BY name').all([customerId]);
    res.json(controllers);
  } catch (error) {
    console.error('Get controllers error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get smart switches for a customer
router.get('/api/customers/:customerId/system-registry/switches', requireAuth, async (req, res) => {
  const customerId = req.params.customerId;
  
  try {
    const switches = await db.prepare('SELECT * FROM sys_smart_switches WHERE customer_id = ? ORDER BY name').all([customerId]);
    res.json(switches);
  } catch (error) {
    console.error('Get switches error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get I/O devices for a customer
router.get('/api/customers/:customerId/system-registry/iodevices', requireAuth, async (req, res) => {
  const customerId = req.params.customerId;
  
  try {
    const devices = await db.prepare('SELECT * FROM sys_io_devices WHERE customer_id = ? ORDER BY node, card, channel').all([customerId]);
    res.json(devices);
  } catch (error) {
    console.error('Get I/O devices error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get Charms I/O cards for a customer
router.get('/api/customers/:customerId/system-registry/charms-io-cards', requireAuth, async (req, res) => {
  const customerId = req.params.customerId;
  
  try {
    const cards = await db.prepare('SELECT * FROM sys_charms_io_cards WHERE customer_id = ? ORDER BY name').all([customerId]);
    res.json(cards);
  } catch (error) {
    console.error('Get Charms I/O cards error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get Charms for a customer
router.get('/api/customers/:customerId/system-registry/charms', requireAuth, async (req, res) => {
  const customerId = req.params.customerId;
  
  try {
    // Order by CIOC name first, then charm name for proper grouping
    const charms = await db.prepare('SELECT * FROM sys_charms WHERE customer_id = ? ORDER BY charms_io_card_name, name').all([customerId]);
    console.log('📊 [SYSTEM REGISTRY] Loaded', charms.length, 'charms for customer', customerId);
    
    // Log grouping info
    const grouped = {};
    charms.forEach(charm => {
      const cioc = charm.charms_io_card_name || 'Standalone';
      grouped[cioc] = (grouped[cioc] || 0) + 1;
    });
    console.log('📊 [SYSTEM REGISTRY] Charms by CIOC:', grouped);
    
    res.json(charms);
  } catch (error) {
    console.error('Get Charms error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get AMS system for a customer
router.get('/api/customers/:customerId/system-registry/ams-system', requireAuth, async (req, res) => {
  const customerId = req.params.customerId;
  
  try {
    const amsSystem = await db.prepare('SELECT * FROM sys_ams_systems WHERE customer_id = ? LIMIT 1').get([customerId]);
    res.json(amsSystem || null);
  } catch (error) {
    console.error('Get AMS system error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete all system registry data for a customer
router.delete('/api/customers/:customerId/system-registry', requireAuth, async (req, res) => {
  const customerId = req.params.customerId;
  
  try {
    await db.prepare('DELETE FROM sys_workstations WHERE customer_id = ?').run([customerId]);
    await db.prepare('DELETE FROM sys_smart_switches WHERE customer_id = ?').run([customerId]);
    await db.prepare('DELETE FROM sys_io_devices WHERE customer_id = ?').run([customerId]);
    await db.prepare('DELETE FROM sys_controllers WHERE customer_id = ?').run([customerId]);
    await db.prepare('DELETE FROM sys_charms_io_cards WHERE customer_id = ?').run([customerId]);
    await db.prepare('DELETE FROM sys_charms WHERE customer_id = ?').run([customerId]);
    await db.prepare('DELETE FROM sys_ams_systems WHERE customer_id = ?').run([customerId]);
    
    res.json({ success: true, message: 'System registry data deleted' });
  } catch (error) {
    console.error('Delete system registry error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Rebuild charms table (removes UNIQUE constraint for duplicate names across CIOCs)
router.post('/api/system-registry/rebuild-charms-table', requireAuth, async (req, res) => {
  try {
    console.log('🔧 Rebuilding sys_charms table...');
    
    // Drop and recreate table
    await db.prepare('DROP TABLE IF EXISTS sys_charms').run();
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
    
    console.log('✅ sys_charms table rebuilt successfully');
    
    res.json({ 
      success: true, 
      message: 'Charms table rebuilt. Please re-import your system registry data.' 
    });
  } catch (error) {
    console.error('Rebuild charms table error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Helper function to sync System Registry to nodes table (auto-called after import)
async function syncSystemRegistryToNodes(customerId) {
  console.log('🔄 [SYNC] Starting sync for customer:', customerId);
  let totalCreated = 0;
  let totalUpdated = 0;
  
  // Sync Workstations
  const workstations = await db.prepare('SELECT * FROM sys_workstations WHERE customer_id = ?').all([customerId]);
  console.log(`🔄 [SYNC] Processing ${workstations.length} workstations...`);
  for (const ws of workstations) {
    const existing = await db.prepare('SELECT id FROM nodes WHERE customer_id = ? AND node_name = ?').get([customerId, ws.name]);
    if (existing) {
      await db.prepare(`
        UPDATE nodes SET node_type = ?, model = ?, serial = ?, firmware = ?, version = ?, 
        os_name = ?, bios_version = ?, updated_at = CURRENT_TIMESTAMP, synced = 0
        WHERE id = ?
      `).run([ws.type || 'Workstation', ws.model, ws.dell_service_tag_number, ws.software_revision,
        ws.dv_hotfixes, ws.os_name, ws.bios_version, existing.id]);
      totalUpdated++;
    } else {
      await db.prepare(`
        INSERT INTO nodes (customer_id, node_name, node_type, model, serial, firmware, version, 
        os_name, bios_version, status, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0)
      `).run([customerId, ws.name, ws.type || 'Workstation', ws.model, ws.dell_service_tag_number,
        ws.software_revision, ws.dv_hotfixes, ws.os_name, ws.bios_version]);
      totalCreated++;
    }
  }
  
  console.log(`✅ [SYNC] Workstations: ${totalCreated} created, ${totalUpdated} updated`);
  
  // Sync Controllers
  const controllers = await db.prepare('SELECT * FROM sys_controllers WHERE customer_id = ?').all([customerId]);
  console.log(`🔄 [SYNC] Processing ${controllers.length} controllers...`);
  const ctrlCreatedBefore = totalCreated;
  const ctrlUpdatedBefore = totalUpdated;
  for (const ctrl of controllers) {
    const existing = await db.prepare('SELECT id FROM nodes WHERE customer_id = ? AND node_name = ?').get([customerId, ctrl.name]);
    if (existing) {
      await db.prepare(`
        UPDATE nodes SET node_type = ?, model = ?, serial = ?, firmware = ?, version = ?, 
        redundant = ?, updated_at = CURRENT_TIMESTAMP, synced = 0
        WHERE id = ?
      `).run([ctrl.model || 'Controller', ctrl.model, ctrl.serial_number, ctrl.software_revision,
        ctrl.hardware_revision, ctrl.redundant, existing.id]);
      totalUpdated++;
    } else {
      await db.prepare(`
        INSERT INTO nodes (customer_id, node_name, node_type, model, serial, firmware, version, 
        redundant, status, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 0)
      `).run([customerId, ctrl.name, ctrl.model || 'Controller', ctrl.model, ctrl.serial_number,
        ctrl.software_revision, ctrl.hardware_revision, ctrl.redundant]);
      totalCreated++;
    }
    
    // Create partner if redundant
    if (ctrl.redundant && ctrl.redundant.toLowerCase() === 'yes' && ctrl.partner_serial_number) {
      const partnerName = `${ctrl.name}-partner`;
      const partnerExists = await db.prepare('SELECT id FROM nodes WHERE customer_id = ? AND node_name = ?').get([customerId, partnerName]);
      if (!partnerExists) {
        await db.prepare(`
          INSERT INTO nodes (customer_id, node_name, node_type, model, serial, firmware, version, 
          redundant, status, synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'yes', 'active', 0)
        `).run([customerId, partnerName, ctrl.partner_model || 'Controller', ctrl.partner_model,
          ctrl.partner_serial_number, ctrl.partner_software_revision, ctrl.partner_hardware_revision]);
        totalCreated++;
      }
    }
  }
  
  console.log(`✅ [SYNC] Controllers: ${totalCreated - ctrlCreatedBefore} created, ${totalUpdated - ctrlUpdatedBefore} updated`);
  
  // Sync Smart Switches
  const switches = await db.prepare('SELECT * FROM sys_smart_switches WHERE customer_id = ?').all([customerId]);
  console.log(`🔄 [SYNC] Processing ${switches.length} smart switches...`);
  const swCreatedBefore = totalCreated;
  const swUpdatedBefore = totalUpdated;
  for (const sw of switches) {
    const existing = await db.prepare('SELECT id FROM nodes WHERE customer_id = ? AND node_name = ?').get([customerId, sw.name]);
    if (existing) {
      await db.prepare(`
        UPDATE nodes SET node_type = ?, model = ?, serial = ?, firmware = ?, version = ?, 
        updated_at = CURRENT_TIMESTAMP, synced = 0
        WHERE id = ?
      `).run([sw.model || 'Smart Switch', sw.model, sw.serial_number, sw.software_revision,
        sw.hardware_revision, existing.id]);
      totalUpdated++;
    } else {
      await db.prepare(`
        INSERT INTO nodes (customer_id, node_name, node_type, model, serial, firmware, version, status, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 0)
      `).run([customerId, sw.name, sw.model || 'Smart Switch', sw.model, sw.serial_number,
        sw.software_revision, sw.hardware_revision]);
      totalCreated++;
    }
  }
  
  console.log(`✅ [SYNC] Smart Switches: ${totalCreated - swCreatedBefore} created, ${totalUpdated - swUpdatedBefore} updated`);
  
  // Sync Charms I/O Cards
  const ciocs = await db.prepare('SELECT * FROM sys_charms_io_cards WHERE customer_id = ?').all([customerId]);
  console.log(`🔄 [SYNC] Processing ${ciocs.length} Charms I/O cards...`);
  const ciocCreatedBefore = totalCreated;
  const ciocUpdatedBefore = totalUpdated;
  for (const cioc of ciocs) {
    const existing = await db.prepare('SELECT id FROM nodes WHERE customer_id = ? AND node_name = ?').get([customerId, cioc.name]);
    if (existing) {
      await db.prepare(`
        UPDATE nodes SET node_type = ?, model = ?, serial = ?, firmware = ?, version = ?, 
        redundant = ?, updated_at = CURRENT_TIMESTAMP, synced = 0
        WHERE id = ?
      `).run([cioc.model || 'Charms I/O Card', cioc.model, cioc.serial_number, cioc.software_revision,
        cioc.hardware_revision, cioc.redundant, existing.id]);
      totalUpdated++;
    } else {
      await db.prepare(`
        INSERT INTO nodes (customer_id, node_name, node_type, model, serial, firmware, version, 
        redundant, status, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 0)
      `).run([customerId, cioc.name, cioc.model || 'Charms I/O Card', cioc.model, cioc.serial_number,
        cioc.software_revision, cioc.hardware_revision, cioc.redundant]);
      totalCreated++;
    }
    
    // Create partner if redundant
    if (cioc.redundant && cioc.redundant.toLowerCase() === 'yes' && cioc.partner_serial_number) {
      const partnerName = `${cioc.name}-partner`;
      const partnerExists = await db.prepare('SELECT id FROM nodes WHERE customer_id = ? AND node_name = ?').get([customerId, partnerName]);
      if (!partnerExists) {
        await db.prepare(`
          INSERT INTO nodes (customer_id, node_name, node_type, model, serial, firmware, version, 
          redundant, status, synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'yes', 'active', 0)
        `).run([customerId, partnerName, cioc.partner_model || 'Charms I/O Card', cioc.partner_model,
          cioc.partner_serial_number, cioc.partner_software_revision, cioc.partner_hardware_revision]);
        totalCreated++;
      }
    }
  }
  
  console.log(`✅ [SYNC] Charms I/O Cards: ${totalCreated - ciocCreatedBefore} created, ${totalUpdated - ciocUpdatedBefore} updated`);
  console.log(`✅ [SYNC] TOTAL: ${totalCreated} created, ${totalUpdated} updated, ${totalCreated + totalUpdated} total`);
  
  return { total: totalCreated + totalUpdated, created: totalCreated, updated: totalUpdated };
}

module.exports = router;
