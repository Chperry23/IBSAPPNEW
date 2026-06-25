// Helper function to get enhanced controller type with model mappings
function isRioController(node) {
  if (!node) return false;
  const model = (node.model || '').toLowerCase();
  const nodeType = (node.node_type || '').toLowerCase();
  return model.includes('ve4021') ||
    model.includes('zone 2 remote') ||
    model.includes('remote i/o') ||
    model.includes('remote io') ||
    nodeType.includes('zone 2 remote') ||
    nodeType.includes('remote i/o') ||
    nodeType.includes('remote io');
}

/** RIO / RIU hardware cannot be made redundant — skip redundancy PM checks and scoring. */
function controllerSupportsRedundancyCheck(node) {
  return !isRioController(node);
}

/** True only when registry shows a real redundant pair (not XML placeholders like "Not available"). */
function isRedundantController(node) {
  if (!node) return false;
  const partner = String(node.partner_serial_number || '').trim().toLowerCase();
  const placeholderPartners = new Set([
    '', 'not available', 'n/a', 'na', 'none', 'unknown', 'false', 'undefined',
  ]);
  const hasPartner = partner && !placeholderPartners.has(partner);

  const r = String(node.redundant || '').trim().toLowerCase();
  const isRedundantFlag = r === 'yes' || r === 'true' || r === '1';

  return isRedundantFlag || hasPartner;
}

function getEnhancedControllerType(controller) {
  const model = (controller.model || '').toLowerCase();
  const nodeType = (controller.node_type || '').toLowerCase();
  const nodeName = (controller.node_name || '').toLowerCase();
  
  // Specific model mappings
  if (isRioController(controller)) {
    return 'RIU';
  }
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

  // CSLS detection — must come before generic CIOC check
  if (nodeType.includes('csls') || nodeType.includes('charms logic solver') || nodeType.includes('smart logic solver') ||
      nodeName.includes('csls') || nodeName.includes('charms logic solver') || nodeName.includes('smart logic solver') ||
      model.includes('csls') || model.includes('logic solver')) {
    return 'CSLS';
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

function getControllerType(node) {
    // Maps node types to controller types
    // This logic was in generateMaintenanceReport in the big file
    if (!node) return 'Controller';
    
    const model = (node.model || '').toLowerCase();
    const nodeType = (node.node_type || '').toLowerCase();
    const nodeName = (node.node_name || '').toLowerCase();
    
    if (isRioController(node)) return 'RIU';
    if (model.includes('ve4021')) return 'RIU';
    if (model.includes('se4101')) return 'EIOC';
    
    if (nodeType.includes('eioc') || nodeName.includes('eioc') || model.includes('eioc')) return 'EIOC';
    
    // CSLS detection — must come before generic CIOC check
    if (nodeType.includes('csls') || nodeType.includes('charms logic solver') || nodeType.includes('smart logic solver') ||
        nodeName.includes('csls') || nodeName.includes('charms logic solver') || nodeName.includes('smart logic solver') ||
        model.includes('csls') || model.includes('logic solver')) return 'CSLS';

    if (nodeType.includes('deltav charm io card') || nodeType.includes('cioc')) return 'CIOC';
    
    if (nodeType.includes('deltav charm io card 2') || nodeType.includes('cioc2')) return 'CIOC2';
    
    return 'Controller';
}

/**
 * Returns 'perf_index' (0-5 scale), 'free_time' (0-100%), or null.
 * Perf index controllers: S-Series (SE*, SZ*, SX*, SQ*, MQ*), MD/MD Plus, CSLS, SIS, PK, EIOC.
 * Free time controllers: VE*, MX*, SD Plus, CIOC.
 */
function getDefaultPerformanceType(node) {
  if (!node) return null;
  const nodeType = (node.node_type || '').toLowerCase();
  const nodeName = (node.node_name || '').toLowerCase();
  const model = (node.model || '').toLowerCase();

  // Performance Index (0-5): S-Series, CSLS, SIS, PK, EIOC, MD/MD Plus
  if (nodeType.startsWith('se') || nodeType.startsWith('sz') ||
      nodeType.startsWith('sx') || nodeType.startsWith('sq') || nodeType.startsWith('mq') ||
      nodeType.startsWith('md') ||
      nodeType.includes('csls') || nodeType.includes('charms logic solver') || nodeType.includes('smart logic solver') ||
      nodeType.includes('pk') || nodeType.includes('eioc') || nodeType.includes('sis') ||
      (nodeType.includes('kl') && nodeType.includes('ba1')) ||
      nodeName.includes('csls') || nodeName.includes('charms logic solver') || nodeName.includes('eioc')) {
    return 'perf_index';
  }
  if (model.includes('md') || model.includes('md plus') ||
      model.includes('sx controller') || model.includes('sz controller') ||
      model.includes('sq controller') || model.includes('mq controller') ||
      model.includes('csls') || model.includes('logic solver') ||
      model.includes('sis') || model.includes('pk ') || model.includes('pk controller')) {
    return 'perf_index';
  }

  // Free Time (0-100%): VE*, MX*, SD Plus, CIOC
  if (nodeType.startsWith('ve') || nodeType.startsWith('mx') ||
      nodeType.includes('sd plus') || nodeType.includes('cioc')) {
    return 'free_time';
  }
  if (model.includes('mx controller') ||
      model.includes('sd plus') || model.includes('cioc')) {
    return 'free_time';
  }

  return null;
}

module.exports = {
  getEnhancedControllerType,
  getControllerType,
  getDefaultPerformanceType,
  isRioController,
  controllerSupportsRedundancyCheck,
  isRedundantController,
};
