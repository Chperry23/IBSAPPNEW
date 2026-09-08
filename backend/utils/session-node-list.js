const ID_WORKSTATION = 1000000;
const ID_CONTROLLER = 2000000;

/** Normalize equipment names for duplicate matching (P1EIOC-1 === P1-EIOC-1). */
function normalizeNodeNameKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeWorkstationNodeTypes(nodes) {
  for (const node of nodes) {
    if (node.node_category !== 'workstation' && Number(node.id) < ID_WORKSTATION) continue;
    if (Number(node.id) >= ID_CONTROLLER) continue;

    const type = String(node.node_type || '').trim();
    const model = String(node.model || '').toLowerCase();

    if (!type) {
      if (model.includes('non deltav') || model.includes('non-deltav') || model.includes('non dv')) {
        node.node_type = 'Non-DV Node';
      } else {
        node.node_type = 'Workstation';
      }
    } else if (
      type.toLowerCase().includes('non-dv') ||
      (model.includes('non deltav') || model.includes('non-deltav'))
    ) {
      node.node_type = 'Non-DV Node';
    }
  }
  return nodes;
}

function isRegistrySyntheticId(id) {
  const n = Number(id);
  return Number.isFinite(n) && n >= ID_WORKSTATION;
}

/** Drop legacy custom nodes when the same name already exists in the registry (any category). */
function dedupeRegistryOverCustomNodes(nodes) {
  const registryNames = new Set(
    nodes
      .filter((n) => isRegistrySyntheticId(n.id) || (n.node_category && n.node_category !== 'legacy'))
      .map((n) => normalizeNodeNameKey(n.node_name))
      .filter(Boolean)
  );

  return nodes.filter((n) => {
    const id = Number(n.id);
    // Keep registry / synthetic-id rows
    if (isRegistrySyntheticId(id)) return true;
    if (n.node_category && n.node_category !== 'legacy' && n.node_category !== 'custom') return true;
    const name = normalizeNodeNameKey(n.node_name);
    // Drop custom/legacy when a registry row already owns that name
    return !(name && registryNames.has(name));
  });
}

function filterSessionExcludedNodes(nodes, excludedIds, excludedNameKeys = null) {
  if (!excludedIds?.size && !excludedNameKeys?.size) return nodes;
  return nodes.filter((n) => {
    if (excludedIds?.has(String(n.id))) return false;
    if (excludedNameKeys?.size) {
      const key = normalizeNodeNameKey(n.node_name);
      if (key && excludedNameKeys.has(key)) return false;
    }
    return true;
  });
}

function finalizeSessionNodeList(nodes, excludedIds, excludedNameKeys = null) {
  normalizeWorkstationNodeTypes(nodes);
  return filterSessionExcludedNodes(dedupeRegistryOverCustomNodes(nodes), excludedIds, excludedNameKeys);
}

function dedupeNodesForReport(nodes) {
  normalizeWorkstationNodeTypes(nodes);
  return dedupeRegistryOverCustomNodes(nodes);
}

/** Build report node list that honors session exclusions (deleted maintenance tombstones). */
function finalizeNodesForReport(nodes, excludedIds, excludedNameKeys = null) {
  return finalizeSessionNodeList(nodes, excludedIds, excludedNameKeys);
}

module.exports = {
  ID_WORKSTATION,
  ID_CONTROLLER,
  normalizeNodeNameKey,
  normalizeWorkstationNodeTypes,
  dedupeRegistryOverCustomNodes,
  filterSessionExcludedNodes,
  finalizeSessionNodeList,
  dedupeNodesForReport,
  finalizeNodesForReport,
};
