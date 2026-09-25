import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  RefreshCw,
  Database,
  Package,
  User,
  LogOut,
  GripVertical,
  PanelLeft,
  PanelTop,
  BarChart3,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import SoundToggle from './SoundToggle';
import GlobalSearch from './GlobalSearch';
import AppUpdateBanner from './AppUpdateBanner';

const NAV_LINKS = [
  { to: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard, match: (p) => p === '/dashboard' },
  { to: '/customers', label: 'Customers', Icon: Users, match: (p) => p === '/customers' || p.startsWith('/customer/') },
  {
    to: '/sessions',
    label: 'PM Sessions',
    Icon: ClipboardList,
    match: (p) =>
      p === '/sessions' || p.startsWith('/session/') || p.startsWith('/ii-session/') || p.startsWith('/ii-document/'),
  },
  {
    to: '/analytics',
    label: 'Analytics',
    Icon: BarChart3,
    match: (p) => p === '/analytics',
  },
  {
    to: '/dispatches',
    label: 'Dispatches',
    Icon: Package,
    match: (p) => p === '/dispatches' || p.startsWith('/dispatches'),
  },
  { to: '/sync', label: 'Sync', Icon: RefreshCw, match: (p) => p === '/sync' },
  { to: '/csv-tracking', label: 'System Registry', Icon: Database, match: (p) => p === '/csv-tracking' },
];

const DRAG_THRESHOLD_PX = 8;

function NavLinkItem({ to, label, Icon, active, compact = false, dense = false }) {
  return (
    <Link
      to={to}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
        dense ? 'min-h-9 px-2.5 py-1.5 text-sm' : compact ? 'min-h-9 px-3 py-2 text-xs' : 'min-h-10 px-3 py-2.5 text-sm'
      } ${
        active
          ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 ring-1 ring-blue-400/40'
          : 'text-gray-400 hover:bg-[var(--surface-hover)] hover:text-gray-100'
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
      <span>{label}</span>
    </Link>
  );
}

function NavDragHandle({ currentLayout, onPointerDown }) {
  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      className="inline-flex h-9 w-9 shrink-0 touch-none cursor-grab items-center justify-center rounded-lg border border-[var(--border-strong)] bg-[var(--surface-inset)] text-gray-400 transition-colors hover:border-blue-500/50 hover:text-blue-300 active:cursor-grabbing"
      title={
        currentLayout === 'sidebar'
          ? 'Drag toward the top of the screen for top navigation'
          : 'Drag toward the left side for sidebar navigation'
      }
      aria-label="Drag to move navigation"
    >
      <GripVertical className="h-4 w-4" aria-hidden />
    </button>
  );
}

/** Shorter labels so top nav stays one row */
const TOP_NAV_LABELS = {
  '/dashboard': 'Dashboard',
  '/customers': 'Customers',
  '/sessions': 'Sessions',
  '/analytics': 'Analytics',
  '/dispatches': 'Dispatches',
  '/sync': 'Sync',
  '/csv-tracking': 'Registry',
};

function TopNavBar({ pathname, user, onLogout, buildInfo, onNavPointerDown }) {
  return (
    <nav className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-[var(--surface)] shadow-lg shadow-black/20">
      {/* Full-width single row — no wrap */}
      <div className="flex h-14 w-full items-center gap-2 px-3 sm:gap-3 sm:px-4 lg:px-6">
        <NavDragHandle currentLayout="top" onPointerDown={onNavPointerDown} />

        <Link to="/dashboard" className="flex shrink-0 items-center gap-2">
          <img src="/logo.svg" alt="" className="h-8 w-8 rounded-lg shadow-md shadow-blue-900/40" width={32} height={32} />
          <span className="hidden text-sm font-bold tracking-tight text-white sm:inline">Cabinet PM</span>
        </Link>

        <div className="mx-1 hidden h-6 w-px shrink-0 bg-[var(--border-subtle)] md:block" aria-hidden />

        {/* Desktop links: single line, scroll if viewport is narrow */}
        <div className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto md:flex [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV_LINKS.map(({ to, label, Icon, match }) => (
            <NavLinkItem
              key={to}
              to={to}
              label={TOP_NAV_LABELS[to] || label}
              Icon={Icon}
              active={match(pathname)}
              dense
            />
          ))}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <GlobalSearch />
          <SoundToggle compact />
          {buildInfo && (
            <span
              className="hidden cursor-default font-mono text-[11px] text-gray-500 2xl:inline"
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
                title={`Settings (${user.username})`}
                aria-label="Profile and settings"
                className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  pathname === '/profile'
                    ? 'border-blue-500 bg-blue-600/25 text-blue-200 ring-2 ring-blue-500/40'
                    : 'border-[var(--border-strong)] bg-[var(--surface-hover)] text-gray-300 hover:border-blue-500/50 hover:bg-[#2f2f4d] hover:text-white'
                }`}
              >
                <User className="h-4 w-4" aria-hidden />
              </Link>
              <button type="button" onClick={onLogout} className="btn btn-secondary btn-sm !min-h-9 !px-2.5">
                <LogOut className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Phone-only link strip */}
      <div className="flex gap-1 overflow-x-auto border-t border-[var(--border-subtle)] px-2 py-1.5 md:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {NAV_LINKS.map(({ to, label, Icon, match }) => (
          <NavLinkItem
            key={to}
            to={to}
            label={TOP_NAV_LABELS[to] || label}
            Icon={Icon}
            active={match(pathname)}
            compact
          />
        ))}
      </div>
    </nav>
  );
}

/** Hit-test which layout drop zone the pointer is over */
function hitDropTarget(x, y, fromLayout) {
  if (fromLayout === 'sidebar') {
    // Top strip
    if (y <= 72) return 'top';
  } else {
    // Left strip
    if (x <= 96) return 'sidebar';
  }
  return null;
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { navLayout, setNavLayout } = useSettings();
  const location = useLocation();
  const pathname = location.pathname;
  const [buildInfo, setBuildInfo] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [dropTarget, setDropTarget] = useState(null);
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 });

  const dragRef = useRef({
    active: false,
    started: false,
    pointerId: null,
    originX: 0,
    originY: 0,
    fromLayout: 'sidebar',
  });

  useEffect(() => {
    fetch('/api/version')
      .then((r) => (r.ok ? r.json() : null))
      .then((info) => {
        if (info) setBuildInfo(info);
      })
      .catch(() => {});
  }, []);

  const endDrag = useCallback(
    (clientX, clientY) => {
      const d = dragRef.current;
      if (!d.active) return;

      const target = d.started ? hitDropTarget(clientX, clientY, d.fromLayout) : null;
      d.active = false;
      d.started = false;
      d.pointerId = null;

      setDragging(false);
      setDropTarget(null);

      if (target && target !== d.fromLayout) {
        setNavLayout(target);
      }
    },
    [setNavLayout]
  );

  const onNavPointerDown = useCallback(
    (e) => {
      // Left mouse / primary touch only
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);

      dragRef.current = {
        active: true,
        started: false,
        pointerId: e.pointerId,
        originX: e.clientX,
        originY: e.clientY,
        fromLayout: navLayout,
      };
      setGhostPos({ x: e.clientX, y: e.clientY });
    },
    [navLayout]
  );

  useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d.active || (d.pointerId != null && e.pointerId !== d.pointerId)) return;

      const dx = e.clientX - d.originX;
      const dy = e.clientY - d.originY;
      const dist = Math.hypot(dx, dy);

      if (!d.started && dist >= DRAG_THRESHOLD_PX) {
        d.started = true;
        setDragging(true);
      }

      if (d.started) {
        setGhostPos({ x: e.clientX, y: e.clientY });
        setDropTarget(hitDropTarget(e.clientX, e.clientY, d.fromLayout));
      }
    };

    const onUp = (e) => {
      const d = dragRef.current;
      if (!d.active || (d.pointerId != null && e.pointerId !== d.pointerId)) return;
      endDrag(e.clientX, e.clientY);
    };

    const onCancel = () => {
      dragRef.current.active = false;
      dragRef.current.started = false;
      setDragging(false);
      setDropTarget(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [endDrag]);

  const handleLogout = async () => {
    await logout();
  };

  const dropZones =
    dragging &&
    (navLayout === 'sidebar' ? (
      <div
        className={`pointer-events-none fixed inset-x-0 top-0 z-[60] flex h-[72px] items-center justify-center gap-2 border-b-2 text-sm font-semibold transition-colors ${
          dropTarget === 'top'
            ? 'border-blue-500 bg-blue-600/35 text-blue-50'
            : 'border-dashed border-blue-400/60 bg-[var(--surface)]/90 text-blue-200'
        }`}
      >
        <PanelTop className="h-5 w-5" aria-hidden />
        Drop here for top navigation
      </div>
    ) : (
      <div
        className={`pointer-events-none fixed inset-y-0 left-0 z-[60] flex w-24 flex-col items-center justify-center gap-2 border-r-2 px-2 text-center transition-colors ${
          dropTarget === 'sidebar'
            ? 'border-blue-500 bg-blue-600/35 text-blue-50'
            : 'border-dashed border-blue-400/60 bg-[var(--surface)]/90 text-blue-200'
        }`}
      >
        <PanelLeft className="h-6 w-6" aria-hidden />
        <span className="text-[10px] font-semibold leading-tight">Drop for sidebar</span>
      </div>
    ));

  const ghost =
    dragging && (
      <div
        className="pointer-events-none fixed z-[70] flex items-center gap-2 rounded-lg border border-blue-500/60 bg-[var(--surface)] px-3 py-2 text-sm font-medium text-white shadow-xl shadow-black/40"
        style={{ left: ghostPos.x + 12, top: ghostPos.y + 12 }}
      >
        <GripVertical className="h-4 w-4 text-blue-300" aria-hidden />
        Move nav
      </div>
    );

  if (navLayout === 'top') {
    return (
      <div className="relative min-h-screen bg-[var(--app-bg)] text-gray-200">
        {dropZones}
        {ghost}
        <TopNavBar
          pathname={pathname}
          user={user}
          onLogout={handleLogout}
          buildInfo={buildInfo}
          onNavPointerDown={onNavPointerDown}
        />
        <AppUpdateBanner />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[var(--app-bg)] text-gray-200">
      {dropZones}
      {ghost}

      <aside
        className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-[var(--border-subtle)] bg-[var(--surface)] shadow-xl shadow-black/20"
        aria-label="Main navigation"
      >
        <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-4">
          <NavDragHandle currentLayout="sidebar" onPointerDown={onNavPointerDown} />
          <img src="/logo.svg" alt="" className="h-10 w-10 shrink-0 rounded-xl shadow-lg shadow-blue-900/40" width={40} height={40} />
          <div className="min-w-0">
            <Link to="/dashboard" className="block truncate text-lg font-semibold tracking-tight text-white transition-colors hover:text-blue-300">
              Cabinet PM
            </Link>
            <p className="truncate text-xs text-gray-500">ECI Industrial Solutions</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV_LINKS.map(({ to, label, Icon, match }) => {
            const active = match(pathname);
            return (
              <Link
                key={to}
                to={to}
                className={`flex min-h-10 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                  active
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 ring-1 ring-blue-400/40'
                    : 'text-gray-400 hover:bg-[var(--surface-hover)] hover:text-gray-100'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-[var(--border-subtle)] p-3">
          <p className="px-1 text-[10px] leading-snug text-gray-500">
            Drag the grip icon toward the top of the screen for top navigation.
          </p>
          <div className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-hover)]/80 px-3 py-2 ring-1 ring-[var(--border-strong)]/60">
            <SoundToggle />
          </div>
          {user && (
            <div className="flex items-center gap-2 rounded-lg px-2 py-2">
              <Link
                to="/profile"
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-xs font-bold uppercase ${
                  pathname === '/profile'
                    ? 'border-blue-500 bg-blue-600/25 text-blue-200'
                    : 'border-[var(--border-strong)] bg-[var(--surface-hover)] text-gray-300 hover:border-blue-500/50'
                }`}
                title="Settings"
              >
                {(user.username || '?').slice(0, 2)}
              </Link>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-gray-200">{user.username}</span>
                <Link to="/profile" className="text-xs text-gray-500 hover:text-gray-300">
                  Settings
                </Link>
              </div>
              <button type="button" onClick={handleLogout} className="btn btn-secondary btn-sm shrink-0" title="Logout">
                <LogOut className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-h-screen flex-col pl-64">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-end gap-4 border-b border-[var(--border-subtle)] bg-[var(--app-bg)]/95 px-6 backdrop-blur-md">
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
        <AppUpdateBanner />

        <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
