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

module.exports = { getEnhancedControllerType, getControllerType };
