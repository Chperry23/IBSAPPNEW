import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { applyAppUpdate, checkAppUpdate } from '../utils/appUpdates';

const DISMISS_KEY = 'cabinet-pm-update-banner-dismissed';

export default function AppUpdateBanner() {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISS_KEY) === '1');
  const [note, setNote] = useState(null);

  useEffect(() => {
    let cancelled = false;
    checkAppUpdate()
      .then((result) => {
        if (!cancelled) setInfo(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (dismissed || !info?.updateAvailable) return null;

  const version = info.remote?.version || 'a newer build';

  const install = async () => {
    setBusy(true);
    setNote(null);
    try {
      const result = await applyAppUpdate(info.remote?.installerUrl);
      setNote(result.message || 'Installer started. Reopen Cabinet PM when it finishes.');
    } catch (e) {
      setNote(e.message || 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-b border-blue-700/50 bg-blue-950/80 px-4 py-3 text-sm text-blue-50">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Update available — {version}</div>
          {info.remote?.notes && <div className="text-blue-100/80">{info.remote.notes}</div>}
          {note && <div className="text-blue-100/90 mt-1">{note}</div>}
        </div>
        <button
          type="button"
          onClick={install}
          disabled={busy}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {busy ? 'Installing…' : 'Install update'}
        </button>
        <Link to="/sync" className="text-blue-200 hover:text-white underline">
          Details
        </Link>
        <button
          type="button"
          className="text-blue-200/80 hover:text-white"
          onClick={() => {
            sessionStorage.setItem(DISMISS_KEY, '1');
            setDismissed(true);
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
