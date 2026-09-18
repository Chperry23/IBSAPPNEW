import { PanelLeft, PanelTop, LogOut } from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';

export default function Profile() {
  const { user, logout } = useAuth();
  const { navLayout, setNavLayout } = useSettings();

  return (
    <Layout>
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Account and application preferences</p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-6">
        <section className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-100">Navigation</h2>
          </div>
          <div className="card-body space-y-4">
            <p className="text-sm text-gray-400">
              Choose how the main menu is shown, or drag the grip icon on the nav to the top edge / left edge to switch.
              Preference is saved on this device.
            </p>
            <p className="form-label mb-2 text-xs uppercase tracking-wide text-gray-500">Layout</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
              <button
                type="button"
                onClick={() => setNavLayout('sidebar')}
                className={`flex flex-1 items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm font-semibold transition-all ${
                  navLayout === 'sidebar'
                    ? 'border-blue-500 bg-blue-600/20 text-white shadow-md shadow-blue-900/40 ring-2 ring-blue-500/40'
                    : 'border-[var(--border-strong)] bg-[var(--surface-inset)] text-gray-400 hover:border-gray-500 hover:text-gray-200'
                }`}
              >
                <PanelLeft className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                <span>
                  Side navigation
                  <span className="mt-1 block text-xs font-normal text-gray-500">
                    Vertical menu on the left (default)
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setNavLayout('top')}
                className={`flex flex-1 items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm font-semibold transition-all ${
                  navLayout === 'top'
                    ? 'border-blue-500 bg-blue-600/20 text-white shadow-md shadow-blue-900/40 ring-2 ring-blue-500/40'
                    : 'border-[var(--border-strong)] bg-[var(--surface-inset)] text-gray-400 hover:border-gray-500 hover:text-gray-200'
                }`}
              >
                <PanelTop className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                <span>
                  Top navigation
                  <span className="mt-1 block text-xs font-normal text-gray-500">
                    Classic horizontal bar along the top
                  </span>
                </span>
              </button>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-100">Account</h2>
          </div>
          <div className="card-body space-y-4">
            <div>
              <p className="form-label mb-1">Username</p>
              <p className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface-inset)] px-4 py-3 text-gray-100">
                {user?.username ?? '—'}
              </p>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => logout()}>
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              Sign out
            </button>
          </div>
        </section>
      </div>
    </Layout>
  );
}
