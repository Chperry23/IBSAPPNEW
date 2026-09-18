import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const CATEGORY_ORDER = [
  { key: 'controller', label: 'Controllers' },
  { key: 'cioc', label: 'CIOC / CSLS' },
  { key: 'workstation', label: 'Workstations' },
  { key: 'switch', label: 'Smart switches' },
  { key: 'other', label: 'Other' },
];

function categoryOf(node) {
  if (node.node_category) return node.node_category;
  const t = String(node.node_type || '').toLowerCase();
  if (t.includes('controller') || t.includes('eioc') || t === 'sis') return 'controller';
  if (t === 'cioc' || t === 'csls') return 'cioc';
  if (t.includes('smart network') || t.includes('switch')) return 'switch';
  if (
    t.includes('workstation') ||
    t.includes('professional') ||
    t.includes('operator') ||
    t.includes('application') ||
    t.includes('non-dv') ||
    t.includes('non dv')
  ) {
    return 'workstation';
  }
  return 'other';
}

/**
 * All-nodes vs specific-nodes picker for create / duplicate session.
 *
 * @param {object} props
 * @param {string|number|null} props.customerId
 * @param {string|null} [props.sessionId] — when set, loads that session's visible nodes (duplicate)
 * @param {'all'|'selected'} props.mode
 * @param {(mode: 'all'|'selected') => void} props.onModeChange
 * @param {Array<string|number>} props.selectedIds
 * @param {(ids: Array<string|number>) => void} props.onSelectedIdsChange
 * @param {string} [props.allLabel]
 * @param {string} [props.selectedLabel]
 * @param {string} [props.hint]
 */
export default function SessionNodeScopePicker({
  customerId,
  sessionId = null,
  mode,
  onModeChange,
  selectedIds,
  onSelectedIdsChange,
  allLabel = 'Include all nodes',
  selectedLabel = 'Include only specific ones',
  allDescription,
  selectedDescription,
  hint = 'Use the site / session label in the name to track which part of the plant this PM covers.',
}) {
  const resolvedAllDescription =
    allDescription ||
    (sessionId
      ? 'Keeps the same visible node set as the source session (including a prior custom scope).'
      : 'Same as today — every controller, workstation, and switch on the system.');
  const resolvedSelectedDescription =
    selectedDescription ||
    (sessionId
      ? 'Pick a subset of the nodes currently on the source session.'
      : 'Split sites — only the nodes you check below are on this PM.');
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!customerId || mode !== 'selected') return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getNodes(customerId, sessionId || undefined);
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setNodes(list);
        // Prefill all currently visible nodes whenever the candidate set loads
        onSelectedIdsChange(list.map((n) => n.id));
      } catch (e) {
        if (!cancelled) {
          setError('Could not load nodes for this customer');
          setNodes([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // intentionally re-load when customer/session/mode changes — not when selectedIds change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, sessionId, mode]);

  const selectedSet = useMemo(
    () => new Set((selectedIds || []).map((id) => String(id))),
    [selectedIds]
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return nodes;
    return nodes.filter((n) => {
      const name = String(n.node_name || '').toLowerCase();
      const type = String(n.node_type || '').toLowerCase();
      const cat = String(n.node_category || '').toLowerCase();
      return name.includes(q) || type.includes(q) || cat.includes(q);
    });
  }, [nodes, filter]);

  const grouped = useMemo(() => {
    const map = Object.fromEntries(CATEGORY_ORDER.map((c) => [c.key, []]));
    for (const n of filtered) {
      const key = categoryOf(n);
      if (!map[key]) map[key] = [];
      map[key].push(n);
    }
    return map;
  }, [filtered]);

  const toggleId = (id) => {
    const key = String(id);
    const next = new Set(selectedSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectedIdsChange([...next]);
  };

  const setGroupSelected = (groupNodes, on) => {
    const next = new Set(selectedSet);
    for (const n of groupNodes) {
      if (on) next.add(String(n.id));
      else next.delete(String(n.id));
    }
    onSelectedIdsChange([...next]);
  };

  const selectAllVisible = () => {
    onSelectedIdsChange(filtered.map((n) => n.id));
  };

  const clearVisible = () => {
    const visible = new Set(filtered.map((n) => String(n.id)));
    onSelectedIdsChange((selectedIds || []).filter((id) => !visible.has(String(id))));
  };

  if (!customerId) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] p-3 text-sm text-gray-400">
        Select a customer to choose which nodes to include.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="form-label">Nodes for this session</label>
        <div className="space-y-2">
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border)] px-3 py-2 hover:bg-[var(--surface-hover)]">
            <input
              type="radio"
              className="mt-1"
              checked={mode === 'all'}
              onChange={() => {
                onModeChange('all');
                onSelectedIdsChange([]);
              }}
            />
            <span>
              <span className="block text-sm font-medium text-gray-100">{allLabel}</span>
              <span className="block text-xs text-gray-400">{resolvedAllDescription}</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border)] px-3 py-2 hover:bg-[var(--surface-hover)]">
            <input
              type="radio"
              className="mt-1"
              checked={mode === 'selected'}
              onChange={() => onModeChange('selected')}
            />
            <span>
              <span className="block text-sm font-medium text-gray-100">{selectedLabel}</span>
              <span className="block text-xs text-gray-400">{resolvedSelectedDescription}</span>
            </span>
          </label>
        </div>
        {hint && <p className="mt-2 text-xs text-gray-500">{hint}</p>}
      </div>

      {mode === 'selected' && (
        <div className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)]">
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-2">
            <input
              type="search"
              className="form-input max-w-xs flex-1"
              placeholder="Filter by name…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <button type="button" className="btn btn-secondary btn-sm" onClick={selectAllVisible}>
              Select all
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={clearVisible}>
              Clear
            </button>
            <span className="ml-auto text-xs text-gray-400">
              {selectedSet.size} selected
              {nodes.length ? ` / ${nodes.length}` : ''}
            </span>
          </div>
          <div className="max-h-64 overflow-y-auto px-3 py-2">
            {loading && <p className="py-6 text-center text-sm text-gray-400">Loading nodes…</p>}
            {error && <p className="py-4 text-center text-sm text-red-400">{error}</p>}
            {!loading && !error && nodes.length === 0 && (
              <p className="py-6 text-center text-sm text-gray-400">
                No nodes in System Registry yet. Import registry first, or create with all nodes.
              </p>
            )}
            {!loading &&
              !error &&
              CATEGORY_ORDER.map(({ key, label }) => {
                const group = grouped[key] || [];
                if (group.length === 0) return null;
                const allOn = group.every((n) => selectedSet.has(String(n.id)));
                return (
                  <div key={key} className="mb-3">
                    <div className="mb-1 flex items-center justify-between">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        {label} ({group.length})
                      </h4>
                      <button
                        type="button"
                        className="text-xs text-blue-400 hover:text-blue-300"
                        onClick={() => setGroupSelected(group, !allOn)}
                      >
                        {allOn ? 'Deselect group' : 'Select group'}
                      </button>
                    </div>
                    <ul className="space-y-0.5">
                      {group.map((n) => (
                        <li key={n.id}>
                          <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-gray-200 hover:bg-[var(--surface-hover)]">
                            <input
                              type="checkbox"
                              checked={selectedSet.has(String(n.id))}
                              onChange={() => toggleId(n.id)}
                            />
                            <span className="truncate">{n.node_name || `Node ${n.id}`}</span>
                            {n.node_type && (
                              <span className="ml-auto shrink-0 text-xs text-gray-500">
                                {n.node_type}
                              </span>
                            )}
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
