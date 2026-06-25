'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const multer = require('multer');
const AdmZip = require('adm-zip');

const db = require('../config/database');
const requireAuth = require('../middleware/auth');
const systemRegistryRouter = require('../routes/systemRegistry');
const { ingestFhxBundleWorkbook } = require('../services/fhxBundleIngest');

const router = express.Router();

const uploadRoot = path.join(os.tmpdir(), 'cabinet-pm-bundle-uploads');
try {
  if (!fs.existsSync(uploadRoot)) fs.mkdirSync(uploadRoot, { recursive: true });
} catch (_) {}

const storage = multer.diskStorage({
  destination: uploadRoot,
  filename: (_req, file, cb) => {
    const clean = path.basename(file.originalname || 'bundle.zip').replace(/[^\w.-]+/g, '_');
    cb(null, `bundle_${Date.now()}_${crypto.randomBytes(8).toString('hex')}_${clean}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 300 * 1024 * 1024 },
});

function rmrf(p) {
  try {
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
  } catch (_) {}
}

function stripBom(s) {
  if (!s) return '';
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function locateBundleAssets(extractedRoot) {
  const registrationCandidates = [
    path.join(extractedRoot, 'registration', 'SystemRegistration.xml'),
    path.join(extractedRoot, 'SystemRegistration.xml'),
    path.join(extractedRoot, 'Registration', 'SystemRegistration.xml'),
  ];
  const registrationPath = registrationCandidates.find((p) => fs.existsSync(p));

  const fhxDir = fs.existsSync(path.join(extractedRoot, 'fhx'))
    ? path.join(extractedRoot, 'fhx')
    : extractedRoot;

  const xlsxCandidates = [
    path.join(fhxDir, 'AllExtracts.xlsx'),
    path.join(extractedRoot, 'AllExtracts.xlsx'),
  ];
  const xlsxPath = xlsxCandidates.find((p) => fs.existsSync(p));

  let manifestParsed = null;
  const mj = path.join(extractedRoot, 'manifest.json');
  if (fs.existsSync(mj)) {
    try {
      manifestParsed = JSON.parse(fs.readFileSync(mj, 'utf8'));
    } catch (_) {
      manifestParsed = { parseError: true };
    }
  }

  return { registrationPath, fhxDir, xlsxPath, manifestParsed };
}

/**
 * POST /api/customers/:customerId/import-bundle
 * multipart field name: bundle (ZIP: cabinet-pm-customer-import-bundle/v1 compatible)
 */
router.post('/:customerId/import-bundle', requireAuth, upload.single('bundle'), async (req, res) => {
  const customerId = parseInt(req.params.customerId, 10);
  if (!customerId || Number.isNaN(customerId)) {
    if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch (_) {}
    return res.status(400).json({ error: 'Invalid customer id' });
  }

  const zipPath = req.file?.path;
  const ext = (zipPath ? path.extname(zipPath) : '').toLowerCase();
  if (!zipPath || ext !== '.zip') {
    if (zipPath) try { fs.unlinkSync(zipPath); } catch (_) {}
    return res.status(400).json({ error: 'Upload a ZIP file (field name: bundle).' });
  }

  const extractedDir = path.join(uploadRoot, `extract_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`);

  const result = {
    success: false,
    customerId,
    registration: null,
    fhx: null,
    manifest: null,
    errors: [],
  };

  try {
    fs.mkdirSync(extractedDir, { recursive: true });

    try {
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(extractedDir, true);
    } catch (zerr) {
      result.errors.push(zerr.message || 'Failed to unzip');
      try { fs.unlinkSync(zipPath); } catch (_) {}
      rmrf(extractedDir);
      return res.status(400).json(result);
    }

    const assets = locateBundleAssets(extractedDir);
    result.manifest = assets.manifestParsed;

    if (!assets.registrationPath && !assets.xlsxPath) {
      result.errors.push('ZIP must contain registration/SystemRegistration.xml and/or fhx/AllExtracts.xlsx');
      try { fs.unlinkSync(zipPath); } catch (_) {}
      rmrf(extractedDir);
      return res.status(400).json(result);
    }

    if (assets.registrationPath) {
      const xmlData = stripBom(fs.readFileSync(assets.registrationPath, 'utf8'));
      const regOut = await systemRegistryRouter.performSystemRegistryImport(customerId, xmlData);
      if (!regOut.success) {
        result.registration = { ok: false, statusCode: regOut.statusCode, body: regOut.payload };
        result.errors.push('System registration XML import reported an error.');
        rmrf(extractedDir);
        try {
          fs.unlinkSync(zipPath);
        } catch (_) {}
        return res.status(regOut.statusCode || 422).json({ ...result, success: false });
      }
      result.registration = {
        ok: true,
        stats: regOut.payload.stats,
        newCount: regOut.payload.newCount,
        updatedCount: regOut.payload.updatedCount,
      };
    } else {
      result.registration = { skipped: true, note: 'No registration/SystemRegistration.xml in ZIP' };
    }

    if (!assets.xlsxPath) {
      result.fhx = { skipped: true, note: 'No AllExtracts.xlsx — FHX ingest skipped.' };
      result.success = true;
      rmrf(extractedDir);
      try {
        fs.unlinkSync(zipPath);
      } catch (_) {}
      return res.json(result);
    }

    try {
      const counts = await ingestFhxBundleWorkbook(db, customerId, assets.xlsxPath);
      result.fhx = { ok: true, counts };
    } catch (fhxErr) {
      console.error('[IMPORT-BUNDLE] FHX ingest failed:', fhxErr);
      result.fhx = { ok: false, error: fhxErr.message };
      result.errors.push(fhxErr.message || 'FHX ingest failed');
      rmrf(extractedDir);
      try {
        fs.unlinkSync(zipPath);
      } catch (_) {}
      const code = assets.registrationPath && result.registration?.ok ? 422 : 500;
      return res.status(code).json({ ...result, success: false, partialRegistration: !!(result.registration && result.registration.ok) });
    }

    result.success = true;

    rmrf(extractedDir);
    try {
      fs.unlinkSync(zipPath);
    } catch (_) {}

    return res.json(result);
  } catch (err) {
    console.error('[IMPORT-BUNDLE]', err);
    result.errors.push(err.message || String(err));
    rmrf(extractedDir);
    try { fs.unlinkSync(zipPath); } catch (_) {}
    return res.status(500).json({ ...result, success: false });
  }
});

module.exports = router;
