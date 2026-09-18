/**
 * In-app update check — reads a version feed (HTTPS or UNC) and compares to local build.
 * Never touches the tablet database; upgrades replace program files via the installer only.
 *
 * Env:
 *   CABINET_PM_UPDATE_URL — base URL or folder containing version.json
 *     e.g. https://updates.example.com/cabinet-pm
 *          \\\\office-share\\CabinetPM\\updates
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const requireAuth = require('../middleware/auth');

const router = express.Router();

function appRoot() {
  const isPackaged = typeof process.pkg !== 'undefined';
  return isPackaged ? path.dirname(process.execPath) : path.resolve(__dirname, '../..');
}

function localVersion() {
  const infoPath = path.join(appRoot(), 'build-info.json');
  try {
    if (fs.existsSync(infoPath)) {
      return JSON.parse(fs.readFileSync(infoPath, 'utf8'));
    }
  } catch (_) {
    /* fall through */
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(appRoot(), 'package.json'), 'utf8'));
    return { version: pkg.version, buildId: 'dev', buildDate: null };
  } catch (_) {
    return { version: '0.0.0', buildId: 'unknown', buildDate: null };
  }
}

function updateBase() {
  return String(process.env.CABINET_PM_UPDATE_URL || '').trim().replace(/\/$/, '');
}

function compareSemver(a, b) {
  const pa = String(a || '0')
    .replace(/^v/i, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0')
    .replace(/^v/i, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

async function fetchVersionFeed(base) {
  if (!base) {
    return { ok: false, error: 'CABINET_PM_UPDATE_URL is not configured' };
  }

  // UNC / local folder
  if (base.startsWith('\\\\') || /^[A-Za-z]:\\/.test(base)) {
    const feedPath = path.join(base, 'version.json');
    if (!fs.existsSync(feedPath)) {
      return { ok: false, error: `version.json not found at ${feedPath}` };
    }
    const feed = JSON.parse(fs.readFileSync(feedPath, 'utf8'));
    return { ok: true, feed, source: feedPath };
  }

  const url = `${base}/version.json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    return { ok: false, error: `Feed HTTP ${res.status} from ${url}` };
  }
  const feed = await res.json();
  return { ok: true, feed, source: url };
}

/** GET /api/updates/check — compare local build to feed (offline → soft skip). */
router.get('/api/updates/check', requireAuth, async (req, res) => {
  const local = localVersion();
  const base = updateBase();
  if (!base) {
    return res.json({
      ok: true,
      configured: false,
      updateAvailable: false,
      local,
      message: 'Update feed not configured (set CABINET_PM_UPDATE_URL).',
    });
  }

  try {
    const result = await fetchVersionFeed(base);
    if (!result.ok) {
      return res.json({
        ok: true,
        configured: true,
        reachable: false,
        updateAvailable: false,
        local,
        message: result.error,
      });
    }

    const remote = result.feed;
    const newer =
      compareSemver(remote.version, local.version) > 0 ||
      (remote.buildId && local.buildId && remote.buildId !== local.buildId &&
        compareSemver(remote.version, local.version) >= 0 &&
        String(remote.buildId) > String(local.buildId));

    res.json({
      ok: true,
      configured: true,
      reachable: true,
      updateAvailable: Boolean(newer),
      local,
      remote: {
        version: remote.version,
        buildId: remote.buildId || null,
        buildDate: remote.buildDate || null,
        notes: remote.notes || null,
        installerUrl: remote.installerUrl || remote.installer || null,
      },
      source: result.source,
      message: newer
        ? `Update available: ${remote.version}`
        : 'You are on the latest version.',
    });
  } catch (e) {
    // Offline / unreachable — quiet skip for field techs
    res.json({
      ok: true,
      configured: true,
      reachable: false,
      updateAvailable: false,
      local,
      message: `Update check skipped (offline or unreachable): ${e.message}`,
    });
  }
});

/**
 * POST /api/updates/apply — download installer to temp and launch quiet upgrade.
 * Body: { installerUrl?: string }
 * Does not modify AppData DB.
 */
router.post('/api/updates/apply', requireAuth, async (req, res) => {
  const base = updateBase();
  let installerUrl = String(req.body?.installerUrl || '').trim();

  try {
    if (!installerUrl) {
      const feed = await fetchVersionFeed(base);
      if (!feed.ok) {
        return res.status(400).json({ ok: false, error: feed.error });
      }
      installerUrl = String(feed.feed.installerUrl || feed.feed.installer || '').trim();
    }
    if (!installerUrl) {
      return res.status(400).json({ ok: false, error: 'No installerUrl in update feed' });
    }

    const tmpDir = path.join(require('os').tmpdir(), 'CabinetPM-updates');
    fs.mkdirSync(tmpDir, { recursive: true });
    const fileName = path.basename(installerUrl.split('?')[0]) || 'CabinetPM-Setup.exe';
    const dest = path.join(tmpDir, fileName);

    if (installerUrl.startsWith('\\\\') || /^[A-Za-z]:\\/.test(installerUrl)) {
      fs.copyFileSync(installerUrl, dest);
    } else if (/^https?:\/\//i.test(installerUrl)) {
      const r = await fetch(installerUrl, { signal: AbortSignal.timeout(300000) });
      if (!r.ok) {
        return res.status(502).json({ ok: false, error: `Download failed HTTP ${r.status}` });
      }
      const buf = Buffer.from(await r.arrayBuffer());
      fs.writeFileSync(dest, buf);
    } else if (base && (base.startsWith('\\\\') || /^[A-Za-z]:\\/.test(base))) {
      fs.copyFileSync(path.join(base, installerUrl), dest);
    } else {
      return res.status(400).json({ ok: false, error: 'Unsupported installerUrl scheme' });
    }

    // Inno Setup quiet upgrade flags — DB stays in AppData
    const child = spawn(dest, ['/VERYSILENT', '/NORESTART', '/SUPPRESSMSGBOXES'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();

    res.json({
      ok: true,
      message: 'Installer started. Cabinet PM will restart after upgrade. Database in AppData is not replaced.',
      installer: dest,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
