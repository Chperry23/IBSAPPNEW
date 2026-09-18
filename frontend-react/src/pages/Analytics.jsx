import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  Clock,
  Box,
  ClipboardCheck,
  Zap,
  AlertTriangle,
  Users,
  Timer,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
} from 'recharts';
import Layout from '../components/Layout';
import api from '../services/api';

function Kpi({ label, value, hint, Icon, tone = 'blue' }) {
  const tones = {
    blue: 'text-blue-300',
    green: 'text-emerald-300',
    amber: 'text-amber-300',
    red: 'text-red-300',
    gray: 'text-gray-300',
  };
  return (
    <div className="card">
      <div className="card-body flex items-start gap-3">
        <div className={`rounded-lg bg-[var(--surface-inset)] p-2 ${tones[tone] || tones.blue}`}>
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
          <div className="mt-0.5 truncate text-2xl font-semibold text-white">{value}</div>
          {hint && <div className="mt-0.5 text-xs text-gray-500">{hint}</div>}
        </div>
      </div>
    </div>
  );
}

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const overview = await api.getAnalyticsOverview(12);
        if (!cancelled) setData(overview);
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load analytics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const weekChart = useMemo(() => {
    if (!data) return [];
    const map = new Map();
    for (const r of data.sessionsByWeek || []) {
      map.set(r.week_key, {
        week_key: r.week_key,
        label: r.label,
        sessions: r.completed || 0,
        cabinets: 0,
        errors: 0,
      });
    }
    for (const r of data.cabinetsByWeek || []) {
      const cur = map.get(r.week_key) || {
        week_key: r.week_key,
        label: r.label,
        sessions: 0,
        cabinets: 0,
        errors: 0,
      };
      cur.cabinets = r.completed || 0;
      cur.label = r.label || cur.label;
      map.set(r.week_key, cur);
    }
    for (const r of data.ioErrorsByWeek || []) {
      const cur = map.get(r.week_key) || {
        week_key: r.week_key,
        label: r.label,
        sessions: 0,
        cabinets: 0,
        errors: 0,
      };
      cur.errors = r.errors || 0;
      cur.label = r.label || cur.label;
      map.set(r.week_key, cur);
    }
    return [...map.values()].sort((a, b) => String(a.week_key).localeCompare(String(b.week_key)));
  }, [data]);

  if (loading) {
    return (
      <Layout>
        <div className="flex h-64 items-center justify-center">
          <div className="spinner h-12 w-12" />
        </div>
      </Layout>
    );
  }

  if (error || !data) {
    return (
      <Layout>
        <div className="alert alert-error">{error || 'No analytics data'}</div>
      </Layout>
    );
  }

  const k = data.kpis || {};

  return (
    <Layout>
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">
            Team throughput, PM labor, equipment checks, and site health from completed field work
          </p>
        </div>
        <div className="page-actions">
          <Link to="/sessions" className="btn btn-secondary">
            Sessions
          </Link>
          <Link to="/dashboard" className="btn btn-secondary">
            Dashboard
          </Link>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="PMs completed"
          value={k.completed_sessions}
          hint={`${k.active_sessions} active · ${k.sessions} total`}
          Icon={ClipboardCheck}
          tone="green"
        />
        <Kpi
          label="Cabinets completed"
          value={k.completed_cabinets}
          hint={`${k.pending_cabinets} pending · ${k.cabinets} total`}
          Icon={Box}
          tone="blue"
        />
        <Kpi
          label="Avg PM duration"
          value={k.avg_duration_label || '—'}
          hint={
            k.timed_sessions
              ? `${k.timed_sessions} timed · ${k.total_person_hours} person-hrs`
              : 'Start the timer on active sessions'
          }
          Icon={Timer}
          tone="amber"
        />
        <Kpi
          label="Power supplies checked"
          value={`${k.psus_checked}/${k.psus_total}`}
          hint={`${k.psu_check_rate}% with readings · ${k.psus_failed} failed/dead`}
          Icon={Zap}
          tone="amber"
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Customers served" value={k.customers} Icon={Users} tone="gray" />
        <Kpi label="I/O errors logged" value={k.io_errors} Icon={AlertTriangle} tone="red" />
        <Kpi
          label="Completion rate"
          value={
            k.cabinets ? `${Math.round((k.completed_cabinets / k.cabinets) * 100)}%` : '—'
          }
          hint="Cabinets marked complete"
          Icon={BarChart3}
          tone="green"
        />
        <Kpi
          label="Person-hours (window)"
          value={k.total_person_hours}
          hint="Duration × crew on completed PMs"
          Icon={Clock}
          tone="blue"
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-100">PMs &amp; cabinets by week</h2>
            <p className="text-xs text-gray-500">Last ~{data.weeks} weeks of completed work</p>
          </div>
          <div className="card-body h-72">
            {weekChart.length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-500">No completed work in this window yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={weekChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #334155' }}
                    labelStyle={{ color: '#e2e8f0' }}
                  />
                  <Legend />
                  <Bar dataKey="sessions" name="PMs completed" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cabinets" name="Cabinets completed" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="errors" name="I/O errors" stroke="#f59e0b" strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-100">Average PM duration by week</h2>
            <p className="text-xs text-gray-500">
              Uses session timer when available; otherwise capped wall-clock estimate
            </p>
          </div>
          <div className="card-body h-72">
            {(data.durationByWeek || []).length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-500">
                No duration data yet. Use Start timer + crew count on PM sessions.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.durationByWeek}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    tickFormatter={(v) => `${Math.round(v / 60)}m`}
                  />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #334155' }}
                    formatter={(v, name) =>
                      name === 'avg_seconds' ? [`${Math.round(v / 60)} min`, 'Avg duration'] : [v, name]
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="avg_seconds"
                    name="avg_seconds"
                    stroke="#a78bfa"
                    fill="#7c3aed55"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-100">Site health trend</h2>
            <p className="text-xs text-gray-500">
              Average score &amp; errors from sessions saved to customer history
            </p>
          </div>
          <div className="card-body h-72">
            {(data.healthTrend || []).length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-500">
                Complete sessions with “Save to customer history” to build this trend.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.healthTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="month_key" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fill: '#94a3b8', fontSize: 11 }} domain={[0, 100]} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="avg_score"
                    name="Avg health score"
                    stroke="#34d399"
                    strokeWidth={2}
                  />
                  <Bar yAxisId="right" dataKey="avg_errors" name="Avg I/O errors" fill="#f97316" />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-100">Top sites by cabinets completed</h2>
            <p className="text-xs text-gray-500">Where the team has spent the most cabinet effort</p>
          </div>
          <div className="card-body">
            {(data.topCustomers || []).length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">No cabinet history yet.</p>
            ) : (
              <ul className="divide-y divide-[var(--border-subtle)]">
                {data.topCustomers.map((c) => (
                  <li key={c.customer_id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link
                        to={`/customer/${c.customer_id}`}
                        className="truncate font-medium text-blue-300 hover:text-blue-200"
                      >
                        {c.customer_name}
                      </Link>
                      <div className="text-xs text-gray-500">
                        {c.session_count} session{c.session_count !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div className="text-right text-sm text-gray-200">
                      <div className="font-semibold text-emerald-300">{c.completed_cabinets}</div>
                      <div className="text-xs text-gray-500">of {c.cabinet_count} cabinets</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="card mb-8">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-gray-100">Recently completed PMs</h2>
          <p className="text-xs text-gray-500">Duration and crew for labor tracking</p>
        </div>
        <div className="overflow-x-auto">
          <table className="table-compact">
            <thead>
              <tr>
                <th>Session</th>
                <th>Customer</th>
                <th>Completed</th>
                <th>Duration</th>
                <th>Crew</th>
                <th>Person-hrs</th>
              </tr>
            </thead>
            <tbody>
              {(data.recentCompleted || []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-500">
                    No completed sessions in this window.
                  </td>
                </tr>
              ) : (
                data.recentCompleted.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link to={`/session/${s.id}`} className="text-blue-300 hover:underline">
                        {s.session_name}
                      </Link>
                    </td>
                    <td>
                      <Link
                        to={`/customer/${s.customer_id}`}
                        className="text-gray-300 hover:text-blue-300"
                      >
                        {s.customer_name || '—'}
                      </Link>
                    </td>
                    <td className="text-gray-400">
                      {s.completed_at ? new Date(String(s.completed_at).replace(' ', 'T')).toLocaleDateString() : '—'}
                    </td>
                    <td>{s.duration_label}</td>
                    <td>{s.crew_count}</td>
                    <td>{s.person_hours != null ? s.person_hours : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
