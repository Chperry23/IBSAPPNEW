import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';

const STATUS_CLASS = {
  draft: 'bg-gray-600/40 text-gray-300 border-gray-500/30',
  queued: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  submitted: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  issued: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  shipped: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  denied: 'bg-red-500/20 text-red-300 border-red-500/30',
  received: 'bg-green-500/20 text-green-300 border-green-500/30',
  installed: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
};

export default function DellDispatches() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('open');
  const [connection, setConnection] = useState(null);
  const [message, setMessage] = useState(null);

  const showMsg = (text, type = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const [list, conn] = await Promise.all([
        fetch(`/api/dell-dispatches?status=${filter}`, { credentials: 'include' }).then((r) => r.json()),
        fetch('/api/dell-dispatches/connection', { credentials: 'include' }).then((r) => r.json()),
      ]);
      setRows(Array.isArray(list) ? list : []);
      setConnection(conn);
    } catch (e) {
      console.error(e);
      showMsg('Failed to load dispatches', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [filter]);

  return (
    <Layout>
      {message && (
        <div
          className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-xl max-w-md ${
            message.type === 'success' ? 'bg-green-600/90' : message.type === 'error' ? 'bg-red-600/90' : 'bg-blue-600/90'
          } text-white`}
        >
          {message.text}
        </div>
      )}

      <div className="mb-6 animate-fadeIn">
        <h1 className="text-3xl font-bold gradient-text mb-2">Dell Parts Dispatches</h1>
        <p className="text-gray-400 text-sm">Open HDD / parts requests across all customers</p>
      </div>

      {connection && (
        <div
          className={`mb-4 p-3 rounded-lg border text-sm ${
            connection.ready
              ? 'bg-green-900/20 border-green-700/40 text-green-300'
              : 'bg-yellow-900/20 border-yellow-700/40 text-yellow-300'
          }`}
        >
          {connection.ready
            ? `Dell SDSR ready${connection.fullName ? ` — ${connection.fullName}` : ''}${connection.sandbox ? ' (sandbox)' : ''}`
            : `Dell SDSR not ready: ${connection.error || 'CheckLogin failed'} — requests still save locally as queued`}
        </div>
      )}

      <div className="card mb-4 p-3 flex flex-wrap gap-2">
        {['open', 'all', 'queued', 'submitted', 'shipped', 'denied'].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              filter === f ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {f}
          </button>
        ))}
        <button type="button" className="ml-auto btn btn-secondary text-sm" onClick={load}>
          Refresh
        </button>
      </div>

      <div className="card">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="spinner h-10 w-10" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 text-gray-400">No dispatches match this filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-dark">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Node / tag</th>
                  <th>Part</th>
                  <th>DPS</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link to={`/customer/${d.customer_id}?tab=parts`} className="text-blue-400 hover:underline">
                        {d.customer_name || `Customer ${d.customer_id}`}
                      </Link>
                    </td>
                    <td>
                      <div className="text-gray-200">{d.node_name || '—'}</div>
                      <div className="font-mono text-xs text-cyan-400">{d.service_tag}</div>
                    </td>
                    <td className="text-sm">{d.part_number || '—'}</td>
                    <td className="font-mono text-xs">{d.dps_number || d.work_order || '—'}</td>
                    <td>
                      <span className={`px-2 py-0.5 rounded text-xs border ${STATUS_CLASS[d.status] || STATUS_CLASS.draft}`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="text-xs text-gray-400 whitespace-nowrap">
                      {d.updated_at ? new Date(d.updated_at).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
