import api from '../services/api';

export async function checkAppUpdate() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      ok: true,
      reachable: false,
      updateAvailable: false,
      message: 'Offline — update check skipped.',
    };
  }
  return api.request('/api/updates/check');
}

export async function applyAppUpdate(installerUrl) {
  return api.request('/api/updates/apply', {
    method: 'POST',
    body: JSON.stringify(installerUrl ? { installerUrl } : {}),
  });
}
