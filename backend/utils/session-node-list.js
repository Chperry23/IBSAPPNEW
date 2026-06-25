const ID_WORKSTATION = 1000000;
const ID_CONTROLLER = 2000000;

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

/** Drop legacy custom nodes when the same name already exists in sys_workstations. */
function dedupeRegistryOverCustomNodes(nodes) {
  const registryNames = new Set(
    nodes
      .filter((n) => {
        const id = Number(n.id);
        return n.node_category === 'workstation' ||
          (Number.isFinite(id) && id >= ID_WORKSTATION && id < ID_CONTROLLER);
      })
      .map((n) => String(n.node_name || '').trim().toLowerCase())
      .filter(Boolean)
  );

  return nodes.filter((n) => {
    const id = Number(n.id);
    if (!Number.isFinite(id) || id <= 0 || id >= ID_WORKSTATION) return true;
    const name = String(n.node_name || '').trim().toLowerCase();
    return !(name && registryNames.has(name));
  });
}

function filterSessionExcludedNodes(nodes, excludedIds) {
  if (!excludedIds?.size) return nodes;
  return nodes.filter((n) => !excludedIds.has(String(n.id)));
}

function finalizeSessionNodeList(nodes, excludedIds) {
  normalizeWorkstationNodeTypes(nodes);
  return filterSessionExcludedNodes(dedupeRegistryOverCustomNodes(nodes), excludedIds);
}

function dedupeNodesForReport(nodes) {
  normalizeWorkstationNodeTypes(nodes);
  return dedupeRegistryOverCustomNodes(nodes);
}

module.exports = {
  ID_WORKSTATION,
  ID_CONTROLLER,
  normalizeWorkstationNodeTypes,
  dedupeRegistryOverCustomNodes,
  filterSessionExcludedNodes,
  finalizeSessionNodeList,
  dedupeNodesForReport,
};
