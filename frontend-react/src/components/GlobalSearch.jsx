import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const CATEGORY_META = {
  customers: { label: 'Customers', icon: '👥' },
  sessions:  { label: 'Sessions',  icon: '📋' },
  cabinets:  { label: 'Cabinets',  icon: '🗄️' },
  nodes:     { label: 'Nodes',     icon: '🖥️' },
};

function navTarget(result) {
  switch (result.type) {
    case 'customer': return `/customer/${result.id}`;
    case 'session':  return `/session/${result.id}`;
    case 'cabinet':  return `/cabinet/${result.id}`;
    case 'node':     return result.customer_id ? `/system-registry/${result.customer_id}` : '/customers';
    default:         return '/dashboard';
  }
}

function flattenResults(data) {
  const out = [];
  for (const key of ['customers', 'sessions', 'cabinets', 'nodes']) {
    for (const item of (data[key] || [])) {
      out.push({ ...item, _category: key });
    }
  }
  return out;
}

export default function GlobalSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  const flat = results ? flattenResults(results) : [];
  const grouped = results
    ? Object.entries(CATEGORY_META)
        .map(([key, meta]) => ({ key, meta, items: (results[key] || []).map(i => ({ ...i, _category: key })) }))
        .filter(g => g.items.length > 0)
    : [];

  const doSearch = useCallback(async (q) => {
    if (q.length < 2) { setResults(null); setLoading(false); return; }
    setLoading(true);
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { credentials: 'include' });
      if (r.ok) setResults(await r.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.length < 2) { setResults(null); return; }
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, doSearch]);

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults(null);
      setFocusIdx(-1);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Ctrl+K / Cmd+K global shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const close = () => { setOpen(false); setQuery(''); setResults(null); setFocusIdx(-1); };

  const navigateTo = (item) => {
    navigate(navTarget(item));
    close();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx(i => Math.min(i + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusIdx(i => Math.max(i - 1, -1)); }
    else if (e.key === 'Enter' && focusIdx >= 0) { e.preventDefault(); navigateTo(flat[focusIdx]); }
    else if (e.key === 'Escape') close();
  };

  const hasResults = results && flat.length > 0;
  const noResults  = results && flat.length === 0 && query.length >= 2;

  return (
    <>
      {/* Trigger button — compact, takes minimal nav space */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-400 hover:text-gray-200 text-sm transition-colors"
        title="Search (Ctrl+K)"
      >
        <span>🔍</span>
        <span className="hidden lg:inline text-xs font-mono text-gray-500">⌃K</span>
      </button>

      {/* Search modal overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div className="bg-gray-800 border border-gray-600 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            {/* Input row */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700">
              <span className="text-gray-400 text-lg shrink-0">🔍</span>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => { setQuery(e.target.value); setFocusIdx(-1); }}
                onKeyDown={handleKeyDown}
                placeholder="Search customers, sessions, cabinets, nodes…"
                className="flex-1 bg-transparent text-gray-100 text-base placeholder-gray-500 outline-none"
                autoComplete="off"
              />
              {loading && (
                <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
              )}
              <kbd
                className="hidden sm:inline text-xs text-gray-500 border border-gray-600 rounded px-1.5 py-0.5 font-mono shrink-0 cursor-pointer"
                onClick={close}
              >
                Esc
              </kbd>
            </div>

            {/* Results */}
            {(hasResults || noResults || query.length < 2) && (
              <div className="max-h-96 overflow-y-auto">
                {query.length < 2 && !loading && (
                  <p className="px-5 py-8 text-center text-sm text-gray-500">
                    Type at least 2 characters to search
                  </p>
                )}
                {noResults && (
                  <p className="px-5 py-8 text-center text-sm text-gray-400">
                    No results for <span className="text-gray-200">"{query}"</span>
                  </p>
                )}
                {hasResults && (
                  <div className="py-2">
                    {grouped.map(({ key, meta, items }) => (
                      <div key={key}>
                        <div className="px-4 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          {meta.icon} {meta.label}
                        </div>
                        {items.map(item => {
                          const gIdx = flat.findIndex(f => f === item);
                          const focused = gIdx === focusIdx;
                          return (
                            <button
                              key={`${key}-${item.id}`}
                              className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                                focused ? 'bg-blue-600' : 'hover:bg-gray-700'
                              }`}
                              onMouseEnter={() => setFocusIdx(gIdx)}
                              onClick={() => navigateTo(item)}
                            >
                              <span className="text-base shrink-0">{meta.icon}</span>
                              <span className="flex-1 min-w-0">
                                <span className={`block truncate font-medium text-sm ${focused ? 'text-white' : 'text-gray-200'}`}>
                                  {item.name}
                                </span>
                                {item.subtitle && (
                                  <span className={`block truncate text-xs ${focused ? 'text-blue-200' : 'text-gray-400'}`}>
                                    {item.subtitle}
                                  </span>
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
