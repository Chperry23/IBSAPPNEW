// MongoDB Models/Schemas for Cabinet PM Database
// This defines the proper structure for all collections in MongoDB

const mongoose = require('mongoose');

// Users Schema
const userSchema = new mongoose.Schema({
  _id: { type: Number, required: true }, // Maps to SQLite id (INTEGER PRIMARY KEY)
  username: { type: String, required: true, unique: true },
  password_hash: { type: String, required: true },
  email: { type: String },
  uuid: { type: String, index: true }, // Global unique ID for merge replication
  synced: { type: Number, default: 0 },
  device_id: { type: String, index: true }, // Device that created/last modified
  deleted: { type: Number, default: 0, index: true }, // Soft delete flag
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { 
  collection: 'users',
  versionKey: false // Remove __v field
});

// Add compound index for efficient sync queries
userSchema.index({ updated_at: 1, deleted: 1 });
userSchema.index({ uuid: 1 }, { unique: true, sparse: true });

// Customers Schema (includes fields updated by System Registry import)
const customerSchema = new mongoose.Schema({
  _id: { type: Number, required: true }, // Maps to SQLite id (INTEGER PRIMARY KEY)
  name: { type: String, required: true },
  location: { type: String },
  contact_info: { type: String },
  contact_person: { type: String },
  email: { type: String },
  phone: { type: String },
  address: { type: String },
  system_username: { type: String },
  system_password: { type: String },
  company_name: { type: String },
  street_address: { type: String },
  city: { type: String },
  state: { type: String },
  zip: { type: String },
  country: { type: String },
  dongle_id: { type: String },
  alias: { type: String },
  uuid: { type: String, index: true },
  synced: { type: Number, default: 0 },
  device_id: { type: String, index: true },
  deleted: { type: Number, default: 0, index: true },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, {
  collection: 'customers',
  versionKey: false
});

customerSchema.index({ updated_at: 1, deleted: 1 });
customerSchema.index({ uuid: 1 }, { unique: true, sparse: true });

// Sessions Schema
const sessionSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // Maps to SQLite id (TEXT PRIMARY KEY)
  customer_id: { type: Number, required: true },
  user_id: { type: Number, required: true },
  session_name: { type: String, required: true },
  session_type: { type: String, default: 'pm' },
  status: { type: String, default: 'active' },
  uuid: { type: String },
  synced: { type: Number, default: 0 },
  device_id: { type: String },
  deleted: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  completed_at: { type: Date },
  // I&I specific fields
  deltav_system_id: { type: String },
  ii_location: { type: String },
  ii_performed_by: { type: String },
  ii_date_performed: { type: Date },
  ii_customer_name: { type: String }
}, { 
  collection: 'sessions',
  versionKey: false
});

sessionSchema.index({ updated_at: 1, deleted: 1 });
sessionSchema.index({ uuid: 1 }, { unique: true, sparse: true });
sessionSchema.index({ customer_id: 1 });

// Cabinets Schema
const cabinetSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // Maps to SQLite id (TEXT PRIMARY KEY)
  pm_session_id: { type: String, required: true },
  cabinet_name: { type: String, required: true },
  cabinet_type: { type: String, default: 'cabinet' }, // 'cabinet' or 'rack'
  cabinet_location: { type: String }, // For backward compatibility
  location_id: { type: String }, // Reference to cabinet_locations
  cabinet_date: { type: Date },
  status: { type: String, default: 'active' },
  power_supplies: { type: String }, // JSON string
  distribution_blocks: { type: String }, // JSON string
  diodes: { type: String }, // JSON string
  network_equipment: { type: String }, // JSON string
  controllers: { type: String }, // JSON string - for cabinets
  workstations: { type: String }, // JSON string - for racks
  inspection_data: { type: String }, // JSON string
  comments: { type: String },
  // Rack-specific equipment flags
  rack_has_ups: { type: Number, default: 0 },
  rack_has_hmi: { type: Number, default: 0 },
  rack_has_kvm: { type: Number, default: 0 },
  rack_has_monitor: { type: Number, default: 0 },
  uuid: { type: String },
  synced: { type: Number, default: 0 },
  device_id: { type: String },
  deleted: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { 
  collection: 'cabinets',
  versionKey: false
});

cabinetSchema.index({ updated_at: 1, deleted: 1 });
cabinetSchema.index({ uuid: 1 }, { unique: true, sparse: true });
cabinetSchema.index({ pm_session_id: 1 });

// Nodes Schema
const nodeSchema = new mongoose.Schema({
  _id: { type: Number, required: true }, // Maps to SQLite id (INTEGER PRIMARY KEY)
  customer_id: { type: Number, required: true },
  node_name: { type: String, required: true },
  node_type: { type: String },
  model: { type: String },
  serial: { type: String },
  firmware: { type: String },
  assigned_cabinet_id: { type: String }, // cabinet id when assigned in session
  assigned_at: { type: Date },
  uuid: { type: String },
  synced: { type: Number, default: 0 },
  device_id: { type: String },
  deleted: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, {
  collection: 'nodes',
  versionKey: false
});

nodeSchema.index({ updated_at: 1, deleted: 1 });
nodeSchema.index({ uuid: 1 }, { unique: true, sparse: true });
nodeSchema.index({ customer_id: 1 });

// Session Node Maintenance Schema
const sessionNodeMaintenanceSchema = new mongoose.Schema({
  _id: { type: Number, required: true }, // Maps to SQLite id (INTEGER PRIMARY KEY)
  session_id: { type: String, required: true },
  node_id: { type: Number, required: true },
  dv_checked: { type: Number },
  os_checked: { type: Number },
  macafee_checked: { type: Number },
  free_time: { type: Number },
  redundancy_checked: { type: Number },
  cold_restart_checked: { type: Number },
  no_errors_checked: { type: Number },
  hdd_replaced: { type: Number },
  performance_type: { type: String },
  performance_value: { type: Number },
  hf_updated: { type: Number },
  firmware_updated_checked: { type: Number },
  uuid: { type: String },
  synced: { type: Number, default: 0 },
  device_id: { type: String },
  deleted: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { 
  collection: 'session_node_maintenance',
  versionKey: false
});

sessionNodeMaintenanceSchema.index({ updated_at: 1, deleted: 1 });
sessionNodeMaintenanceSchema.index({ uuid: 1 }, { unique: true, sparse: true });
sessionNodeMaintenanceSchema.index({ session_id: 1, node_id: 1 });

// Session Node Tracker Schema
const sessionNodeTrackerSchema = new mongoose.Schema({
  _id: { type: Number, required: true }, // Maps to SQLite id (INTEGER PRIMARY KEY)
  session_id: { type: String, required: true },
  node_id: { type: Number, required: true },
  status: { type: String, default: 'pending' },
  uuid: { type: String },
  synced: { type: Number, default: 0 },
  device_id: { type: String },
  deleted: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { 
  collection: 'session_node_tracker',
  versionKey: false
});

sessionNodeTrackerSchema.index({ updated_at: 1, deleted: 1 });
sessionNodeTrackerSchema.index({ uuid: 1 }, { unique: true, sparse: true });
sessionNodeTrackerSchema.index({ session_id: 1 });

// Cabinet Locations Schema
const cabinetLocationSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // Maps to SQLite id (TEXT PRIMARY KEY - UUID)
  session_id: { type: String, required: true },
  location_name: { type: String, required: true },
  description: { type: String },
  is_collapsed: { type: Number, default: 0 },
  sort_order: { type: Number },
  uuid: { type: String },
  synced: { type: Number, default: 0 },
  device_id: { type: String },
  deleted: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { 
  collection: 'cabinet_locations',
  versionKey: false
});

cabinetLocationSchema.index({ updated_at: 1, deleted: 1 });
cabinetLocationSchema.index({ uuid: 1 }, { unique: true, sparse: true });
cabinetLocationSchema.index({ session_id: 1 });

// Session PM Notes Schema
const sessionPMNotesSchema = new mongoose.Schema({
  _id: { type: Number, required: true }, // Maps to SQLite id (INTEGER PRIMARY KEY)
  session_id: { type: String, required: true },
  common_tasks: { type: String }, // JSON string
  additional_work_notes: { type: String },
  troubleshooting_notes: { type: String },
  recommendations_notes: { type: String },
  uuid: { type: String },
  synced: { type: Number, default: 0 },
  device_id: { type: String },
  deleted: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { 
  collection: 'session_pm_notes',
  versionKey: false
});

sessionPMNotesSchema.index({ updated_at: 1, deleted: 1 });
sessionPMNotesSchema.index({ uuid: 1 }, { unique: true, sparse: true });
sessionPMNotesSchema.index({ session_id: 1 });

// I&I Documents Schema
const sessionIIDocumentSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // Maps to SQLite id (TEXT PRIMARY KEY - UUID)
  session_id: { type: String, required: true },
  document_name: { type: String, required: true },
  deltav_system_id: { type: String },
  location: { type: String },
  performed_by: { type: String },
  date_performed: { type: Date },
  document_type: { type: String, default: 'installation' },
  status: { type: String, default: 'draft' },
  uuid: { type: String },
  synced: { type: Number, default: 0 },
  device_id: { type: String },
  deleted: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { 
  collection: 'session_ii_documents',
  versionKey: false
});

sessionIIDocumentSchema.index({ updated_at: 1, deleted: 1 });
sessionIIDocumentSchema.index({ uuid: 1 }, { unique: true, sparse: true });
sessionIIDocumentSchema.index({ session_id: 1 });

// I&I Equipment Schema
const sessionIIEquipmentSchema = new mongoose.Schema({
  _id: { type: Number, required: true }, // Maps to SQLite id (INTEGER PRIMARY KEY)
  session_id: { type: String, required: true },
  document_id: { type: String },
  clamp_on_rms_ammeter: { type: String },
  digit_dvm: { type: String },
  fluke_1630_earth_ground: { type: String },
  fluke_mt8200_micromapper: { type: String },
  notes: { type: String },
  uuid: { type: String },
  synced: { type: Number, default: 0 },
  device_id: { type: String },
  deleted: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { 
  collection: 'session_ii_equipment',
  versionKey: false
});

sessionIIEquipmentSchema.index({ updated_at: 1, deleted: 1 });
sessionIIEquipmentSchema.index({ uuid: 1 }, { unique: true, sparse: true });
sessionIIEquipmentSchema.index({ document_id: 1 });

// I&I Checklist Schema
const sessionIIChecklistSchema = new mongoose.Schema({
  _id: { type: Number, required: true }, // Maps to SQLite id (INTEGER PRIMARY KEY)
  session_id: { type: String, required: true },
  document_id: { type: String },
  section_name: { type: String, required: true },
  item_name: { type: String, required: true },
  answer: { type: String },
  comments: { type: String },
  performed_by: { type: String },
  date_completed: { type: Date },
  measurement_dc_ma: { type: Number },
  measurement_voltage: { type: Number },
  measurement_ohms: { type: Number },
  measurement_ac_ma: { type: Number },
  measurement_frequency: { type: Number },
  uuid: { type: String },
  synced: { type: Number, default: 0 },
  device_id: { type: String },
  deleted: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { 
  collection: 'session_ii_checklist',
  versionKey: false
});

sessionIIChecklistSchema.index({ updated_at: 1, deleted: 1 });
sessionIIChecklistSchema.index({ uuid: 1 }, { unique: true, sparse: true });
sessionIIChecklistSchema.index({ document_id: 1 });

// I&I Equipment Used Schema
const sessionIIEquipmentUsedSchema = new mongoose.Schema({
  _id: { type: Number, required: true }, // Maps to SQLite id (INTEGER PRIMARY KEY)
  session_id: { type: String, required: true },
  document_id: { type: String },
  manufacturer: { type: String },
  type: { type: String },
  serial_number: { type: String },
  recalibration_date: { type: Date },
  used_in_section: { type: String },
  uuid: { type: String },
  synced: { type: Number, default: 0 },
  device_id: { type: String },
  deleted: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { 
  collection: 'session_ii_equipment_used',
  versionKey: false
});

sessionIIEquipmentUsedSchema.index({ updated_at: 1, deleted: 1 });
sessionIIEquipmentUsedSchema.index({ uuid: 1 }, { unique: true, sparse: true });
sessionIIEquipmentUsedSchema.index({ document_id: 1 });

// CSV Import History Schema
const csvImportHistorySchema = new mongoose.Schema({
  _id: { type: String, required: true }, // Maps to SQLite id (TEXT PRIMARY KEY - UUID)
  customer_id: { type: Number, required: true },
  file_name: { type: String, required: true },
  import_date: { type: Date, default: Date.now },
  nodes_imported: { type: Number, default: 0 },
  imported_by: { type: String },
  uuid: { type: String },
  synced: { type: Number, default: 0 },
  device_id: { type: String },
  deleted: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { 
  collection: 'csv_import_history',
  versionKey: false
});

csvImportHistorySchema.index({ updated_at: 1, deleted: 1 });
csvImportHistorySchema.index({ uuid: 1 }, { unique: true, sparse: true });
csvImportHistorySchema.index({ customer_id: 1 });
csvImportHistorySchema.index({ import_date: -1 });

// System Registry Schemas (replaces CSV node imports)
const sysWorkstationSchema = new mongoose.Schema({
  _id: { type: Number, required: true },
  customer_id: { type: Number, required: true },
  name: { type: String, required: true },
  model: { type: String },
  type: { type: String },
  redundant: { type: String },
  software_revision: { type: String },
  dv_hotfixes: { type: String },
  os_name: { type: String },
  ms_office_installed: { type: String },
  terminal_server: { type: String },
  domain_controller: { type: String },
  iddc: { type: String },
  dell_service_tag_number: { type: String },
  computer_model: { type: String },
  bios_version: { type: String },
  memory: { type: String },
  assigned_cabinet_id: { type: String },
  assigned_at: { type: Date },
  uuid: { type: String },
  synced: { type: Number, default: 0 },
  device_id: { type: String },
  deleted: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { collection: 'sys_workstations', versionKey: false });
sysWorkstationSchema.index({ updated_at: 1, deleted: 1 });
sysWorkstationSchema.index({ customer_id: 1, name: 1 }, { unique: true });

const sysSmartSwitchSchema = new mongoose.Schema({
  _id: { type: Number, required: true },
  customer_id: { type: Number, required: true },
  name: { type: String, required: true },
  model: { type: String },
  software_revision: { type: String },
  hardware_revision: { type: String },
  serial_number: { type: String },
  assigned_cabinet_id: { type: String },
  assigned_at: { type: Date },
  uuid: { type: String },
  synced: { type: Number, default: 0 },
  device_id: { type: String },
  deleted: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { collection: 'sys_smart_switches', versionKey: false });
sysSmartSwitchSchema.index({ updated_at: 1, deleted: 1 });
sysSmartSwitchSchema.index({ customer_id: 1, name: 1 }, { unique: true });

const sysIODeviceSchema = new mongoose.Schema({
  _id: { type: Number, required: true },
  customer_id: { type: Number, required: true },
  bus_type: { type: String },
  device_type: { type: String },
  node: { type: String },
  card: { type: String },
  device_name: { type: String },
  channel: { type: String },
  uuid: { type: String },
  synced: { type: Number, default: 0 },
  device_id: { type: String },
  deleted: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { collection: 'sys_io_devices', versionKey: false });
sysIODeviceSchema.index({ updated_at: 1, deleted: 1 });
sysIODeviceSchema.index({ customer_id: 1, node: 1, card: 1, channel: 1 });

const sysControllerSchema = new mongoose.Schema({
  _id: { type: Number, required: true },
  customer_id: { type: Number, required: true },
  name: { type: String, required: true },
  model: { type: String },
  software_revision: { type: String },
  hardware_revision: { type: String },
  serial_number: { type: String },
  controller_free_memory: { type: String },
  redundant: { type: String },
  partner_model: { type: String },
  partner_software_revision: { type: String },
  partner_hardware_revision: { type: String },
  partner_serial_number: { type: String },
  assigned_cabinet_id: { type: String },
  assigned_at: { type: Date },
  uuid: { type: String },
  synced: { type: Number, default: 0 },
  device_id: { type: String },
  deleted: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { collection: 'sys_controllers', versionKey: false });
sysControllerSchema.index({ updated_at: 1, deleted: 1 });
sysControllerSchema.index({ customer_id: 1, name: 1 }, { unique: true });

const sysCharmsIOCardSchema = new mongoose.Schema({
  _id: { type: Number, required: true },
  customer_id: { type: Number, required: true },
  name: { type: String, required: true },
  model: { type: String },
  software_revision: { type: String },
  hardware_revision: { type: String },
  serial_number: { type: String },
  redundant: { type: String },
  partner_model: { type: String },
  partner_software_revision: { type: String },
  partner_hardware_revision: { type: String },
  partner_serial_number: { type: String },
  assigned_cabinet_id: { type: String },
  assigned_at: { type: Date },
  uuid: { type: String },
  synced: { type: Number, default: 0 },
  device_id: { type: String },
  deleted: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { collection: 'sys_charms_io_cards', versionKey: false });
sysCharmsIOCardSchema.index({ updated_at: 1, deleted: 1 });
sysCharmsIOCardSchema.index({ customer_id: 1, name: 1 }, { unique: true });

const sysCharmSchema = new mongoose.Schema({
  _id: { type: Number, required: true },
  customer_id: { type: Number, required: true },
  charms_io_card_name: { type: String },
  name: { type: String, required: true },
  model: { type: String },
  software_revision: { type: String },
  hardware_revision: { type: String },
  serial_number: { type: String },
  uuid: { type: String },
  synced: { type: Number, default: 0 },
  device_id: { type: String },
  deleted: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { collection: 'sys_charms', versionKey: false });
sysCharmSchema.index({ updated_at: 1, deleted: 1 });
sysCharmSchema.index({ customer_id: 1 });

const sysAMSSystemSchema = new mongoose.Schema({
  _id: { type: Number, required: true },
  customer_id: { type: Number, required: true },
  software_revision: { type: String },
  uuid: { type: String },
  synced: { type: Number, default: 0 },
  device_id: { type: String },
  deleted: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { collection: 'sys_ams_systems', versionKey: false });
sysAMSSystemSchema.index({ updated_at: 1, deleted: 1 });
sysAMSSystemSchema.index({ customer_id: 1 }, { unique: true });

// Customer metric history (trend over time per customer)
const customerMetricHistorySchema = new mongoose.Schema({
  _id: { type: Number, required: true },
  customer_id: { type: Number, required: true },
  session_id: { type: String, required: true },
  session_name: { type: String },
  recorded_at: { type: Date, default: Date.now },
  error_count: { type: Number, default: 0 },
  risk_score: { type: Number, default: 0 },
  risk_level: { type: String },
  total_components: { type: Number, default: 0 },
  failed_components: { type: Number, default: 0 },
  cabinet_count: { type: Number, default: 0 },
  synced: { type: Number, default: 0 },
  deleted: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now }
}, { collection: 'customer_metric_history', versionKey: false });
customerMetricHistorySchema.index({ customer_id: 1 });
customerMetricHistorySchema.index({ recorded_at: -1 });

// Export all models
module.exports = {
  User: mongoose.model('User', userSchema),
  Customer: mongoose.model('Customer', customerSchema),
  Session: mongoose.model('Session', sessionSchema),
  Cabinet: mongoose.model('Cabinet', cabinetSchema),
  Node: mongoose.model('Node', nodeSchema),
  SessionNodeMaintenance: mongoose.model('SessionNodeMaintenance', sessionNodeMaintenanceSchema),
  SessionNodeTracker: mongoose.model('SessionNodeTracker', sessionNodeTrackerSchema),
  CabinetLocation: mongoose.model('CabinetLocation', cabinetLocationSchema),
  SessionPMNotes: mongoose.model('SessionPMNotes', sessionPMNotesSchema),
  SessionIIDocument: mongoose.model('SessionIIDocument', sessionIIDocumentSchema),
  SessionIIEquipment: mongoose.model('SessionIIEquipment', sessionIIEquipmentSchema),
  SessionIIChecklist: mongoose.model('SessionIIChecklist', sessionIIChecklistSchema),
  SessionIIEquipmentUsed: mongoose.model('SessionIIEquipmentUsed', sessionIIEquipmentUsedSchema),
  CSVImportHistory: mongoose.model('CSVImportHistory', csvImportHistorySchema),
  // System Registry models (replaces CSV node imports)
  SysWorkstation: mongoose.model('SysWorkstation', sysWorkstationSchema),
  SysSmartSwitch: mongoose.model('SysSmartSwitch', sysSmartSwitchSchema),
  SysIODevice: mongoose.model('SysIODevice', sysIODeviceSchema),
  SysController: mongoose.model('SysController', sysControllerSchema),
  SysCharmsIOCard: mongoose.model('SysCharmsIOCard', sysCharmsIOCardSchema),
  SysCharm: mongoose.model('SysCharm', sysCharmSchema),
  SysAMSSystem: mongoose.model('SysAMSSystem', sysAMSSystemSchema),
  CustomerMetricHistory: mongoose.model('CustomerMetricHistory', customerMetricHistorySchema)
};
