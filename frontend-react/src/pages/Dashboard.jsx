import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../services/api';

export default function Dashboard() {
  const [stats, setStats] = useState({
    total_customers: 0,
    total_sessions: 0,
    completed_sessions: 0,
    total_cabinets: 0,
  });
  const [recentSessions, setRecentSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Load stats
      const statsData = await api.getDashboardStats();
      setStats(statsData);

      // Load recent sessions
      const sessionsData = await api.getSessions();
      setRecentSessions(sessionsData.slice(0, 5));
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Header */}
      <div className="mb-8 animate-fadeIn">
        <h1 className="text-4xl font-bold gradient-text mb-2">Dashboard</h1>
        <p className="text-gray-400">Professional Control Cabinet Preventative Maintenance System</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="stats-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold text-blue-400 mb-2">{stats.total_customers}</div>
              <div className="text-sm text-gray-400">Total Customers</div>
            </div>
            <div className="text-4xl">👥</div>
          </div>
        </div>
        <div className="stats-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold text-purple-400 mb-2">{stats.total_sessions}</div>
              <div className="text-sm text-gray-400">PM Sessions</div>
            </div>
            <div className="text-4xl">📋</div>
          </div>
        </div>
        <div className="stats-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold text-green-400 mb-2">{stats.completed_sessions}</div>
              <div className="text-sm text-gray-400">Completed</div>
            </div>
            <div className="text-4xl">✅</div>
          </div>
        </div>
        <div className="stats-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold text-cyan-400 mb-2">{stats.total_cabinets}</div>
              <div className="text-sm text-gray-400">Total Cabinets</div>
            </div>
            <div className="text-4xl">🗄️</div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Sessions */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-xl font-semibold text-gray-900">Recent PM Sessions</h2>
          </div>
          <div className="card-body">
            {recentSessions.length === 0 ? (
              <p className="text-gray-500 text-sm">No recent sessions</p>
            ) : (
              <div className="space-y-4">
                {recentSessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex justify-between items-center py-3 border-b border-gray-700 last:border-b-0 hover:bg-gray-700/30 px-2 rounded transition-colors"
                    >
                      <div>
                        <div className="font-medium text-gray-200">{session.session_name}</div>
                        <div className="text-sm text-gray-400">{session.customer_name}</div>
                      </div>
                      <div className="text-right">
                        <span
                          className={`badge ${
                            session.status === 'completed'
                              ? 'badge-green'
                              : 'badge-blue'
                          }`}
                        >
                          {(session.status || 'active').toUpperCase()}
                        </span>
                        <div className="text-xs text-gray-500 mt-1">
                          {new Date(session.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                ))}
              </div>
            )}
            <div className="mt-4">
              <Link to="/sessions" className="btn btn-secondary text-sm">
                View All Sessions
              </Link>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-xl font-semibold text-gray-100">Quick Links</h2>
          </div>
          <div className="card-body space-y-3">
            <Link to="/customers" className="block p-4 bg-gray-700/30 hover:bg-gray-700/50 rounded-lg border border-gray-600 hover:border-blue-500 transition-all">
              <div className="flex items-center gap-3">
                <div className="text-2xl">👥</div>
                <div>
                  <div className="font-medium text-gray-200">Customers</div>
                  <div className="text-xs text-gray-400">Manage customer database</div>
                </div>
              </div>
            </Link>
            <Link to="/sessions?action=new" className="block p-4 bg-gray-700/30 hover:bg-gray-700/50 rounded-lg border border-gray-600 hover:border-green-500 transition-all">
              <div className="flex items-center gap-3">
                <div className="text-2xl">📋</div>
                <div>
                  <div className="font-medium text-gray-200">New PM Session</div>
                  <div className="text-xs text-gray-400">Create new session</div>
                </div>
              </div>
            </Link>
            <Link to="/csv-tracking" className="block p-4 bg-gray-700/30 hover:bg-gray-700/50 rounded-lg border border-gray-600 hover:border-cyan-500 transition-all">
              <div className="flex items-center gap-3">
                <div className="text-2xl">📈</div>
                <div>
                  <div className="font-medium text-gray-200">CSV History</div>
                  <div className="text-xs text-gray-400">Track node imports</div>
                </div>
              </div>
            </Link>
            <Link to="/sync" className="block p-4 bg-gray-700/30 hover:bg-gray-700/50 rounded-lg border border-gray-600 hover:border-purple-500 transition-all">
              <div className="flex items-center gap-3">
                <div className="text-2xl">🔄</div>
                <div>
                  <div className="font-medium text-gray-200">Sync Data</div>
                  <div className="text-xs text-gray-400">Cloud synchronization</div>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
