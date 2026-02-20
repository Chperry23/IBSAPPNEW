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

function getControllerType(node) {
    // Maps node types to controller types
    // This logic was in generateMaintenanceReport in the big file
    if (!node) return 'Controller';
    
    const model = (node.model || '').toLowerCase();
    const nodeType = (node.node_type || '').toLowerCase();
    const nodeName = (node.node_name || '').toLowerCase();
    
    if (model.includes('ve4021')) return 'RIU';
    if (model.includes('se4101')) return 'EIOC';
    
    if (nodeType.includes('eioc') || nodeName.includes('eioc') || model.includes('eioc')) return 'EIOC';
    
    if (nodeType.includes('deltav charm io card') || nodeType.includes('cioc')) return 'CIOC';
    
    if (nodeType.includes('deltav charm io card 2') || nodeType.includes('cioc2')) return 'CIOC2';
    
    return 'Controller';
}

/**
 * Returns 'perf_index' (0-5 scale), 'free_time' (0-100%), or null.
 * Perf index controllers: S-Series (SE*, SZ*, SX*, SQ*, MQ*), CSLS, SIS, PK, EIOC.
 * Free time controllers: M-Series (VE*, MD*, MX*), SD Plus, CIOC.
 */
function getDefaultPerformanceType(node) {
  if (!node) return null;
  const nodeType = (node.node_type || '').toLowerCase();
  const nodeName = (node.node_name || '').toLowerCase();
  const model = (node.model || '').toLowerCase();

  // Performance Index (0-5): S-Series, CSLS, SIS, PK, EIOC
  if (nodeType.startsWith('se') || nodeType.startsWith('sz') ||
      nodeType.startsWith('sx') || nodeType.startsWith('sq') || nodeType.startsWith('mq') ||
      nodeType.includes('csls') || nodeType.includes('pk') ||
      nodeType.includes('eioc') || nodeType.includes('sis') ||
      (nodeType.includes('kl') && nodeType.includes('ba1')) ||
      nodeName.includes('csls') || nodeName.includes('eioc')) {
    return 'perf_index';
  }
  if (model.includes('sx controller') || model.includes('sz controller') ||
      model.includes('sq controller') || model.includes('mq controller') ||
      model.includes('csls') || model.includes('logic solver') ||
      model.includes('sis') || model.includes('pk ') || model.includes('pk controller')) {
    return 'perf_index';
  }

  // Free Time (0-100%): M-Series, SD Plus, CIOC
  if (nodeType.startsWith('ve') || nodeType.startsWith('md') || nodeType.startsWith('mx') ||
      nodeType.includes('sd plus') || nodeType.includes('cioc')) {
    return 'free_time';
  }
  if (model.includes('md controller') || model.includes('mx controller') ||
      model.includes('md plus') || model.includes('sd plus') || model.includes('cioc')) {
    return 'free_time';
  }

  return null;
}

module.exports = { getEnhancedControllerType, getControllerType, getDefaultPerformanceType };
