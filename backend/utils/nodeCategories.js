/** Workstation / computer types — keep in sync with NodeMaintenance.jsx */
const WORKSTATION_TYPES = new Set([
  'Local Operator',
  'Local Application',
  'Local Professional Plus',
  'Local Pro',
  'Local ProfessionalPlus',
  'Professional Plus',
  'Application Station',
  'Local Safety',
  'VRTX Chassis (Virtual)',
  'Host (Virtual)',
  'File Witness (Virtual)',
  'Non-DV Node',
]);

const CONTROLLER_TYPES = new Set([
  'Controller',
  'CIOC',
  'CSLS',
  'DeltaV EIOC',
  'SIS',
  'SZ Controller',
  'Charms Smart Logic Solver',
]);

function isNonDeltavNode(node) {
  const nodeType = (node.node_type || '').toLowerCase();
  const model = (node.model || '').toLowerCase();
  return nodeType.includes('non-dv') || nodeType.includes('non dv') ||
    model.includes('non deltav') || model.includes('non-deltav') || model.includes('non dv');
}

function isControllerNode(node) {
  const nodeType = node.node_type || '';
  if (CONTROLLER_TYPES.has(nodeType)) return true;

  const lowerType = nodeType.toLowerCase();
  const nodeName = (node.node_name || '').toLowerCase();
  const model = (node.model || '').toLowerCase();

  return lowerType.includes('controller') ||
    lowerType.includes('cioc') ||
    lowerType.includes('csls') ||
    lowerType.includes('sis') ||
    lowerType.includes('eioc') ||
    nodeName.includes('csls') ||
    nodeName.includes('charms logic solver') ||
    nodeName.includes('smart logic solver') ||
    nodeName.includes('-sz') ||
    nodeName.includes('eioc') ||
    model.includes('se4101') ||
    model.includes('ve4021') ||
    model.includes('csls') ||
    model.includes('logic solver') ||
    /sz0[1-9]/.test(nodeName);
}

function isWorkstationNode(node) {
  const nodeType = node.node_type || '';
  if (WORKSTATION_TYPES.has(nodeType)) return true;
  if (isNonDeltavNode(node)) return true;

  const lowerType = nodeType.toLowerCase();
  const nodeName = (node.node_name || '').toLowerCase();

  return lowerType.includes('workstation') ||
    lowerType.includes('computer') ||
    lowerType.includes('pc') ||
    lowerType.includes('local application') ||
    lowerType.includes('local operator') ||
    lowerType.includes('local professional') ||
    lowerType.includes('local pro') ||
    lowerType.includes('application station') ||
    lowerType.includes('local safety') ||
    lowerType.includes('hmi') ||
    lowerType.includes('operator') ||
    lowerType.includes('virtual') ||
    lowerType.includes('professional plus') ||
    nodeName.includes('cpu') ||
    nodeName.includes('hmi') ||
    nodeName.includes('workstation') ||
    nodeName.includes('operator');
}

function isSwitchNode(node) {
  const nodeType = (node.node_type || '').toLowerCase();
  return nodeType === 'smart network devices' ||
    nodeType.includes('switch') ||
    nodeType.includes('network');
}

function nodeHasMaintenanceActivity(node) {
  return Boolean(
    node.dv_checked || node.os_checked || node.macafee_checked ||
    node.redundancy_checked || node.cold_restart_checked ||
    node.hdd_replaced || node.hf_updated || node.firmware_updated_checked ||
    node.completed || node.is_custom_node ||
    (node.notes && String(node.notes).trim()) ||
    node.performance_value != null ||
    (node.free_time && String(node.free_time).trim())
  );
}

/** Split maintenance rows into report sections (matches in-app Diagnostics checklist). */
function categorizeMaintenanceNodes(nodeMaintenanceData) {
  const controllers = [];
  const computers = [];
  const switches = [];
  const other = [];
  const seen = new Set();

  const pushUnique = (list, node) => {
    const key = String(node.id ?? node.node_name);
    if (seen.has(key)) return;
    seen.add(key);
    list.push(node);
  };

  for (const node of nodeMaintenanceData || []) {
    if ((node.node_name || '').endsWith('-partner')) continue;

    if (isControllerNode(node)) {
      pushUnique(controllers, node);
    } else if (isWorkstationNode(node)) {
      pushUnique(computers, node);
    } else if (isSwitchNode(node)) {
      pushUnique(switches, node);
    } else if (node.is_custom_node || isNonDeltavNode(node) || nodeHasMaintenanceActivity(node)) {
      pushUnique(other, node);
    }
  }

  return { controllers, computers, switches, other };
}

module.exports = {
  WORKSTATION_TYPES,
  CONTROLLER_TYPES,
  isNonDeltavNode,
  isControllerNode,
  isWorkstationNode,
  isSwitchNode,
  nodeHasMaintenanceActivity,
  categorizeMaintenanceNodes,
};
