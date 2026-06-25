import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';

export default function Profile() {
  const { user, logout } = useAuth();
  const { navLayout, setNavLayout } = useSettings();

  return (
    <Layout>
      <div className="mb-8 animate-fadeIn">
        <h1 className="mb-2 text-4xl font-bold gradient-text">Profile & settings</h1>
        <p className="text-gray-400">Account information and application preferences</p>
      </div>

      <div className="mx-auto max-w-3xl space-y-6">
        <section className="card">
          <div className="card-header">
            <h2 className="text-xl font-semibold text-gray-100">Navigation</h2>
          </div>
          <div className="card-body space-y-4">
            <p className="text-sm text-gray-400">
              Choose how the main menu is shown. Side navigation is the default and is saved on this device.
            </p>
            <p className="form-label mb-2 text-xs uppercase tracking-wide text-gray-500">Layout</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
              <button
                type="button"
                onClick={() => setNavLayout('sidebar')}
                className={`flex-1 rounded-lg border px-4 py-3 text-left text-sm font-semibold transition-all ${
                  navLayout === 'sidebar'
                    ? 'border-blue-500 bg-blue-600/20 text-white shadow-md shadow-blue-900/40 ring-2 ring-blue-500/40'
                    : 'border-[#3d3d5c] bg-[#161624] text-gray-400 hover:border-gray-500 hover:text-gray-200'
                }`}
              >
                Side navigation
                <span className="mt-1 block text-xs font-normal text-gray-500">
                  Vertical menu on the left (default)
                </span>
              </button>
              <button
                type="button"
                onClick={() => setNavLayout('top')}
                className={`flex-1 rounded-lg border px-4 py-3 text-left text-sm font-semibold transition-all ${
                  navLayout === 'top'
                    ? 'border-blue-500 bg-blue-600/20 text-white shadow-md shadow-blue-900/40 ring-2 ring-blue-500/40'
                    : 'border-[#3d3d5c] bg-[#161624] text-gray-400 hover:border-gray-500 hover:text-gray-200'
                }`}
              >
                Top navigation
                <span className="mt-1 block text-xs font-normal text-gray-500">
                  Classic horizontal bar along the top
                </span>
              </button>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="text-xl font-semibold text-gray-100">Account</h2>
          </div>
          <div className="card-body space-y-4">
            <div>
              <p className="form-label mb-1">Username</p>
              <p className="rounded-lg border border-[#3d3d5c] bg-[#161624] px-4 py-3 text-gray-100">
                {user?.username ?? '—'}
              </p>
            </div>
            <p className="text-sm text-gray-500">
              Password changes and additional profile fields can be added here when your organization enables them.
            </p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => logout()}>
              Sign out
            </button>
          </div>
        </section>
      </div>
    </Layout>
  );
}
