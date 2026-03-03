import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import SoundToggle from './SoundToggle';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = window.location.pathname;
  const [buildInfo, setBuildInfo] = useState(null);

  useEffect(() => {
    fetch('/api/version')
      .then(r => r.ok ? r.json() : null)
      .then(info => { if (info) setBuildInfo(info); })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await logout();
  };

  const isActive = (path) => location === path || location.startsWith(path);

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Sound Toggle */}
      <SoundToggle />
      
      {/* Navigation Bar - Dark Mode */}
      <nav className="bg-gray-800 shadow-lg border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <Link to="/dashboard" className="flex items-center px-2 text-xl font-bold gradient-text">
                ⚡ ECI Cabinet PM
              </Link>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-1">
                <Link
                  to="/dashboard"
                  className={`inline-flex items-center px-4 py-1 text-sm font-medium rounded-lg transition-all ${
                    isActive('/dashboard')
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                      : 'text-gray-300 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  📊 Dashboard
                </Link>
                <Link
                  to="/customers"
                  className={`inline-flex items-center px-4 py-1 text-sm font-medium rounded-lg transition-all ${
                    isActive('/customers')
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                      : 'text-gray-300 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  👥 Customers
                </Link>
                <Link
                  to="/sessions"
                  className={`inline-flex items-center px-4 py-1 text-sm font-medium rounded-lg transition-all ${
                    isActive('/sessions') || isActive('/session/')
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                      : 'text-gray-300 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  📋 PM Sessions
                </Link>
                <Link
                  to="/sync"
                  className={`inline-flex items-center px-4 py-1 text-sm font-medium rounded-lg transition-all ${
                    isActive('/sync')
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                      : 'text-gray-300 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  🔄 Sync
                </Link>
                <Link
                  to="/csv-tracking"
                  className={`inline-flex items-center px-4 py-1 text-sm font-medium rounded-lg transition-all ${
                    isActive('/csv-tracking')
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                      : 'text-gray-300 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  📊 System Registry
                </Link>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {buildInfo && (
                <span
                  className="text-xs text-gray-500 font-mono cursor-default"
                  title={`Build: ${buildInfo.buildId}\n${buildInfo.buildDateHuman || ''}\nGit: ${buildInfo.git?.commit || 'N/A'}`}
                >
                  v{buildInfo.version}{buildInfo.buildId !== 'dev' ? `-${buildInfo.buildId.split('-').slice(1, 2)[0]}` : '-dev'}
                </span>
              )}
              {user && (
                <>
                  <span className="text-sm text-gray-400">👤 {user.username}</span>
                  <button
                    onClick={handleLogout}
                    className="btn btn-secondary text-sm"
                  >
                    Logout
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
