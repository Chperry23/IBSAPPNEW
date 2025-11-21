// MongoDB Models/Schemas for Cabinet PM Database
// This defines the proper structure for all collections in MongoDB

const mongoose = require('mongoose');

// Users Schema
const userSchema = new mongoose.Schema({
  _id: { type: Number, required: true }, // Maps to SQLite id (INTEGER PRIMARY KEY)
  username: { type: String, required: true, unique: true },
  password_hash: { type: String, required: true },
  email: { type: String },
  created_at: { type: Date, default: Date.now }
}, { 
  collection: 'users',
  versionKey: false // Remove __v field
});

// Customers Schema
const customerSchema = new mongoose.Schema({
  _id: { type: Number, required: true }, // Maps to SQLite id (INTEGER PRIMARY KEY)
  name: { type: String, required: true },
  location: { type: String },
  contact_info: { type: String },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { 
  collection: 'customers',
  versionKey: false
});

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

// Cabinets Schema
const cabinetSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // Maps to SQLite id (TEXT PRIMARY KEY)
  pm_session_id: { type: String, required: true },
  cabinet_location: { type: String, required: true },
  power_supplies: { type: String }, // JSON string
  distribution_blocks: { type: String }, // JSON string
  diodes: { type: String }, // JSON string
  network_equipment: { type: String }, // JSON string
  controllers: { type: String }, // JSON string
  inspection_data: { type: String }, // JSON string
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

// Nodes Schema
const nodeSchema = new mongoose.Schema({
  _id: { type: Number, required: true }, // Maps to SQLite id (INTEGER PRIMARY KEY)
  customer_id: { type: Number, required: true },
  node_name: { type: String, required: true },
  node_type: { type: String },
  model: { type: String },
  serial: { type: String },
  firmware: { type: String },
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
  SessionIIEquipmentUsed: mongoose.model('SessionIIEquipmentUsed', sessionIIEquipmentUsedSchema)
};
