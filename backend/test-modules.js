// Test script to verify all modules load correctly
console.log('🧪 Testing module imports...\n');

try {
  console.log('✓ Loading config/database...');
  require('./config/database');
  
  console.log('✓ Loading config/init-db...');
  require('./config/init-db');
  
  console.log('✓ Loading middleware/auth...');
  require('./middleware/auth');
  
  console.log('✓ Loading utils/chrome...');
  require('./utils/chrome');
  
  console.log('✓ Loading utils/session...');
  require('./utils/session');
  
  console.log('✓ Loading utils/controllerType...');
  require('./utils/controllerType');
  
  console.log('✓ Loading utils/dateFormat...');
  require('./utils/dateFormat');
  
  console.log('✓ Loading services/pdf/cabinetReport...');
  require('./services/pdf/cabinetReport');
  
  console.log('✓ Loading services/pdf/maintenanceReport...');
  require('./services/pdf/maintenanceReport');
  
  console.log('✓ Loading services/pdf/diagnosticsReport...');
  require('./services/pdf/diagnosticsReport');
  
  console.log('✓ Loading services/pdf/iiReport...');
  require('./services/pdf/iiReport');
  
  console.log('✓ Loading routes/auth...');
  require('./routes/auth');
  
  console.log('✓ Loading routes/customers...');
  require('./routes/customers');
  
  console.log('✓ Loading routes/sessions...');
  require('./routes/sessions');
  
  console.log('✓ Loading routes/cabinets...');
  require('./routes/cabinets');
  
  console.log('✓ Loading routes/nodes...');
  require('./routes/nodes');
  
  console.log('✓ Loading routes/nodeMaintenance...');
  require('./routes/nodeMaintenance');
  
  console.log('✓ Loading routes/nodeTracker...');
  require('./routes/nodeTracker');
  
  console.log('✓ Loading routes/diagnostics...');
  require('./routes/diagnostics');
  
  console.log('✓ Loading routes/pmNotes...');
  require('./routes/pmNotes');
  
  console.log('✓ Loading routes/iiDocuments...');
  require('./routes/iiDocuments');
  
  console.log('\n✅ All modules loaded successfully!');
  console.log('🎉 The restructured backend is ready to use!\n');
  
  process.exit(0);
} catch (error) {
  console.error('\n❌ Module loading failed:', error.message);
  console.error('\n📍 Error location:', error.stack);
  console.error('\n💡 Fix the error above and try again.\n');
  process.exit(1);
}

