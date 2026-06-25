/**
 * Canonical list of synced tables and Mongo model mapping.
 * Shared by legacy merge replication, uuid backfill, sync-server, and sync-client.
 */
const models = require('../models/mongodb-models');

const SYNC_TABLES = [
  'users',
  'customers',
  'sessions',
  'cabinets',
  'nodes',
  'session_node_maintenance',
  'cabinet_locations',
  'session_pm_notes',
  'session_diagnostics',
  'session_ii_documents',
  'session_ii_equipment',
  'session_ii_checklist',
  'session_ii_equipment_used',
  'sys_workstations',
  'sys_smart_switches',
  'sys_io_devices',
  'sys_controllers',
  'sys_charms_io_cards',
  'sys_charms',
  'sys_ams_systems',
  'customer_metric_history',
  'customer_notes',
];

const REGISTRY_TABLES = [
  'sys_workstations',
  'sys_smart_switches',
  'sys_io_devices',
  'sys_controllers',
  'sys_charms_io_cards',
  'sys_charms',
  'sys_ams_systems',
];

const MODEL_MAP = {
  users: models.User,
  customers: models.Customer,
  sessions: models.Session,
  cabinets: models.Cabinet,
  nodes: models.Node,
  session_node_maintenance: models.SessionNodeMaintenance,
  cabinet_locations: models.CabinetLocation,
  session_pm_notes: models.SessionPMNotes,
  session_diagnostics: models.SessionDiagnostics,
  session_ii_documents: models.SessionIIDocument,
  session_ii_equipment: models.SessionIIEquipment,
  session_ii_checklist: models.SessionIIChecklist,
  session_ii_equipment_used: models.SessionIIEquipmentUsed,
  sys_workstations: models.SysWorkstation,
  sys_smart_switches: models.SysSmartSwitch,
  sys_io_devices: models.SysIODevice,
  sys_controllers: models.SysController,
  sys_charms_io_cards: models.SysCharmsIOCard,
  sys_charms: models.SysCharm,
  sys_ams_systems: models.SysAMSSystem,
  customer_metric_history: models.CustomerMetricHistory,
  customer_notes: models.CustomerNote,
};

/** Tables keyed by UUID string _id in Mongo */
const STRING_ID_TABLES = new Set(['sessions', 'cabinets', 'cabinet_locations', 'session_ii_documents']);

module.exports = {
  SYNC_TABLES,
  REGISTRY_TABLES,
  MODEL_MAP,
  STRING_ID_TABLES,
};
