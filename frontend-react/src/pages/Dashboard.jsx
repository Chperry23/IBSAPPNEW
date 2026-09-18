import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  ClipboardList,
  CheckCircle2,
  Box,
  Package,
  Plus,
  UserPlus,
  RefreshCw,
  Database,
  BarChart3,
} from 'lucide-react';
import Layout from '../components/Layout';
import api from '../services/api';

export default function Dashboard() {
  const [stats, setStats] = useState({
    total_customers: 0,
    total_sessions: 0,
    completed_sessions: 0,
    total_cabinets: 0,
  });
  const [openDispatches, setOpenDispatches] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [statsData, summary] = await Promise.all([
        api.getDashboardStats(),
        fetch('/api/dell-dispatches/status-summary', { credentials: 'include' })
          .then((r) => (r.ok ? r.json() : { open_count: 0 }))
          .catch(() => ({ open_count: 0 })),
      ]);
      setStats(statsData);
      setOpenDispatches(summary.open_count || 0);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex h-64 items-center justify-center">
          <div className="spinner h-12 w-12" />
        </div>
      </Layout>
    );
  }

  const statTiles = [
    { label: 'Customers', value: stats.total_customers, Icon: Users, to: '/customers' },
    { label: 'PM Sessions', value: stats.total_sessions, Icon: ClipboardList, to: '/sessions' },
    { label: 'Completed', value: stats.completed_sessions, Icon: CheckCircle2, to: '/sessions' },
    { label: 'Cabinets', value: stats.total_cabinets, Icon: Box, to: '/sessions' },
  ];

  return (
    <Layout>
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Overview</h1>
          <p className="page-subtitle">Control cabinet preventive maintenance for field teams</p>
        </div>
        <div className="page-actions">
          <Link to="/analytics" className="btn btn-secondary">
            <BarChart3 className="h-4 w-4" aria-hidden />
            Analytics
          </Link>
          <Link to="/sessions?action=new" className="btn btn-primary">
            <Plus className="h-4 w-4" aria-hidden />
            New session
          </Link>
          <Link to="/customers" className="btn btn-secondary">
            <UserPlus className="h-4 w-4" aria-hidden />
            Add customer
          </Link>
          <Link to="/sync" className="btn btn-secondary">
            <RefreshCw className="h-4 w-4" aria-hidden />
            Sync
          </Link>
          <Link to="/dispatches" className="btn btn-secondary">
            <Package className="h-4 w-4" aria-hidden />
            Dispatches
            {openDispatches > 0 && (
              <span className="badge badge-yellow ml-0.5">{openDispatches}</span>
            )}
          </Link>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {statTiles.map(({ label, value, Icon, to }) => (
          <Link key={label} to={to} className="stats-card block hover:border-blue-500/50">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-3xl font-bold text-white">{value}</div>
                <div className="mt-1 text-sm text-gray-400">{label}</div>
              </div>
              <div className="rounded-lg bg-blue-600/15 p-2 text-blue-400">
                <Icon className="h-5 w-5" aria-hidden />
              </div>
            </div>
          </Link>
        ))}
        <Link to="/dispatches" className="stats-card block hover:border-blue-500/50">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-3xl font-bold text-white">{openDispatches}</div>
              <div className="mt-1 text-sm text-gray-400">Open Dell parts</div>
            </div>
            <div className="rounded-lg bg-blue-600/15 p-2 text-blue-400">
              <Package className="h-5 w-5" aria-hidden />
            </div>
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card flex flex-col">
          <div className="card-header flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-100">What&apos;s new</h2>
            <span className="font-mono text-xs text-gray-500">May 2026</span>
          </div>
          <div className="card-body max-h-[420px] space-y-5 overflow-y-auto pr-1">
            {[
              {
                ver: 'v2.7 — May 15',
                items: [
                  'Duplicate session / cabinets carry structure more reliably.',
                  'System Registry import is file upload only; simpler modals.',
                  'CIOC charms / I/O errors: two-stage charm picker restored.',
                  'First-time cloud download for empty databases.',
                ],
              },
              {
                ver: 'v2.6 — May 7',
                items: [
                  'Sidebar navigation (switch to top nav in Settings).',
                  'Profile & settings page.',
                  'Dark navy visual refresh for long PM work.',
                  'Custom workstations and No Card I/O entry improvements.',
                ],
              },
              {
                ver: 'v2.5 — May 6',
                items: [
                  'Empty-controller I/O diagnostics guidance.',
                  'No Card manual entry flow clarified.',
                  'Import no longer overwrites customer name/alias.',
                ],
              },
              {
                ver: 'v2.4 — Apr 24',
                items: [
                  'Redundancy check in risk engine.',
                  'Risk scoring rebalanced (40-40-20).',
                  'Searchable customer picker for new sessions.',
                ],
              },
            ].map((block) => (
              <div key={block.ver} className="border-l-2 border-[var(--border-strong)] pl-4">
                <span className="badge badge-blue mb-2">{block.ver}</span>
                <ul className="space-y-1.5 text-sm text-gray-300">
                  {block.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-100">Shortcuts</h2>
          </div>
          <div className="card-body space-y-2">
            {[
              { to: '/customers', Icon: Users, title: 'Customers', desc: 'Manage customer database' },
              { to: '/sessions?action=new', Icon: ClipboardList, title: 'New PM session', desc: 'Start a field visit' },
              { to: '/csv-tracking', Icon: Database, title: 'System Registry', desc: 'View and manage imports' },
              {
                to: '/dispatches',
                Icon: Package,
                title: 'Dell parts',
                desc: 'HDD / SDSR dispatch tracker',
                badge: openDispatches,
              },
              { to: '/sync', Icon: RefreshCw, title: 'Sync data', desc: 'Cloud synchronization' },
            ].map(({ to, Icon, title, desc, badge }) => (
              <Link
                key={to + title}
                to={to}
                className="flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-inset)]/50 p-4 transition-all hover:border-blue-500/50 hover:bg-[var(--surface-hover)]/40"
              >
                <div className="rounded-lg bg-blue-600/15 p-2 text-blue-400">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-gray-100">
                    {title}
                    {badge > 0 && <span className="badge badge-yellow ml-2">{badge}</span>}
                  </div>
                  <div className="text-xs text-gray-500">{desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
