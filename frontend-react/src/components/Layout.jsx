import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import SoundToggle from './SoundToggle';
import GlobalSearch from './GlobalSearch';

const NAV_LINKS = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊', match: (p) => p === '/dashboard' },
  { to: '/customers', label: 'Customers', icon: '👥', match: (p) => p === '/customers' || p.startsWith('/customer/') },
  {
    to: '/sessions',
    label: 'PM Sessions',
    icon: '📋',
    match: (p) =>
      p === '/sessions' || p.startsWith('/session/') || p.startsWith('/ii-session/') || p.startsWith('/ii-document/'),
  },
  { to: '/sync', label: 'Sync', icon: '🔄', match: (p) => p === '/sync' },
  { to: '/csv-tracking', label: 'System Registry', icon: '📊', match: (p) => p === '/csv-tracking' },
  { to: '/profile', label: 'Profile', icon: '⚙️', match: (p) => p === '/profile' },
];

/** Top bar uses icon-only profile on the right to avoid horizontal overflow */
const MAIN_NAV_LINKS = NAV_LINKS.filter((l) => l.to !== '/profile');

function TopNavBar({ pathname, user, onLogout, buildInfo }) {
  return (
    <nav className="sticky top-0 z-40 border-b border-[#2d2d44] bg-[#1b1b2f] shadow-lg shadow-black/20">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-4 lg:gap-6">
          <Link to="/dashboard" className="flex shrink-0 items-center gap-2">
            <img src="/logo.svg" alt="" className="h-9 w-9 rounded-lg shadow-md shadow-blue-900/40" width={36} height={36} />
            <span className="truncate text-lg font-bold tracking-tight text-white">PM APP</span>
          </Link>
          <div className="hidden min-w-0 flex-1 flex-wrap items-center gap-1 md:flex lg:gap-2">
            {MAIN_NAV_LINKS.map(({ to, label, icon, match }) => {
              const active = match(pathname);
              return (
                <Link
                  key={to}
                  to={to}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                    active
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/35 ring-1 ring-blue-400/40'
                      : 'text-gray-400 hover:bg-[#252542] hover:text-gray-100'
                  }`}
                >
                  <span aria-hidden>{icon}</span>
                  <span className="hidden lg:inline">{label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <GlobalSearch />
          <SoundToggle compact />
          {buildInfo && (
            <span
              className="hidden cursor-default font-mono text-xs text-gray-500 xl:inline"
              title={`Build: ${buildInfo.buildId}\n${buildInfo.buildDateHuman || ''}`}
            >
              v{buildInfo.version}
              {buildInfo.buildId !== 'dev' ? `-${buildInfo.buildId.split('-').slice(1, 2)[0]}` : '-dev'}
            </span>
          )}
          {user && (
            <>
              <Link
                to="/profile"
                title={`Profile (${user.username})`}
                aria-label="Profile and settings"
                className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  pathname === '/profile'
                    ? 'border-blue-500 bg-blue-600/25 text-blue-200 ring-2 ring-blue-500/40'
                    : 'border-[#3d3d5c] bg-[#252542] text-gray-300 hover:border-blue-500/50 hover:bg-[#2f2f4d] hover:text-white'
                }`}
              >
                <span aria-hidden>👤</span>
              </Link>
              <button type="button" onClick={onLogout} className="btn btn-secondary btn-sm">
                Logout
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-t border-[#2d2d44] px-3 py-2 md:hidden">
        {MAIN_NAV_LINKS.map(({ to, label, icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={to}
              to={to}
              className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium ${
                active ? 'bg-blue-600 text-white' : 'bg-[#252542] text-gray-400'
              }`}
            >
              <span aria-hidden>{icon}</span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { navLayout } = useSettings();
  const location = useLocation();
  const pathname = location.pathname;
  const [buildInfo, setBuildInfo] = useState(null);

  useEffect(() => {
    fetch('/api/version')
      .then((r) => (r.ok ? r.json() : null))
      .then((info) => {
        if (info) setBuildInfo(info);
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await logout();
  };

  if (navLayout === 'top') {
    return (
      <div className="min-h-screen bg-[#11111d] text-gray-200">
        <TopNavBar pathname={pathname} user={user} onLogout={handleLogout} buildInfo={buildInfo} />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#11111d] text-gray-200">
      <aside
        className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-[#2d2d44] bg-[#1b1b2f] shadow-xl shadow-black/20"
        aria-label="Main navigation"
      >
        <div className="flex items-center gap-3 border-b border-[#2d2d44] px-4 py-4">
          <img src="/logo.svg" alt="" className="h-10 w-10 shrink-0 rounded-xl shadow-lg shadow-blue-900/40" width={40} height={40} />
          <div className="min-w-0">
            <Link to="/dashboard" className="block truncate text-lg font-semibold tracking-tight text-white transition-colors hover:text-blue-300">
              PM APP
            </Link>
            <p className="truncate text-xs text-gray-500">Cabinet maintenance</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV_LINKS.map(({ to, label, icon, match }) => {
            const active = match(pathname);
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                  active
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/35 ring-1 ring-blue-400/40'
                    : 'text-gray-400 hover:bg-[#252542] hover:text-gray-100'
                }`}
              >
                <span className="text-lg leading-none" aria-hidden>
                  {icon}
                </span>
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-[#2d2d44] p-3">
          <div className="flex items-center justify-between gap-2 rounded-lg bg-[#252542]/80 px-3 py-2 ring-1 ring-[#3d3d5c]/60">
            <SoundToggle />
          </div>
          {user && (
            <div className="flex items-center gap-2 rounded-lg px-2 py-2">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-gray-200">{user.username}</span>
                <span className="text-xs text-gray-500">Signed in</span>
              </div>
              <button type="button" onClick={handleLogout} className="btn btn-secondary btn-sm shrink-0">
                Logout
              </button>
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-h-screen flex-col pl-64">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-end gap-4 border-b border-[#2d2d44] bg-[#11111d]/95 px-6 backdrop-blur-md">
          <GlobalSearch />
          {buildInfo && (
            <span
              className="hidden cursor-default font-mono text-xs text-gray-500 sm:inline"
              title={`Build: ${buildInfo.buildId}\n${buildInfo.buildDateHuman || ''}\nGit: ${buildInfo.git?.commit || 'N/A'}`}
            >
              v{buildInfo.version}
              {buildInfo.buildId !== 'dev' ? `-${buildInfo.buildId.split('-').slice(1, 2)[0]}` : '-dev'}
            </span>
          )}
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
