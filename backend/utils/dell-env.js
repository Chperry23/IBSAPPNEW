/**
 * Load KEY=value from DELL.env (repo root). Never commit that file.
 */
const fs = require('fs');
const path = require('path');

let cached = null;
let cachedMtime = null;

function envPath() {
  return process.env.DELL_ENV_PATH || path.resolve(__dirname, '../../DELL.env');
}

function loadDellEnv(force = false) {
  const file = envPath();
  if (!fs.existsSync(file)) {
    cached = {};
    return cached;
  }
  const mtime = fs.statSync(file).mtimeMs;
  if (!force && cached && cachedMtime === mtime) return cached;

  const env = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  cached = env;
  cachedMtime = mtime;
  return env;
}

/**
 * Default contact / ship-to for Dell SDSR dispatches.
 * Field techs usually self-replace; parts ship to ECI (Lawrence, PA).
 * Override via DELL.env if needed.
 */
function getDellDispatchDefaults() {
  const env = loadDellEnv();
  return {
    primary_contact_name: env.DELL_DISPATCH_PRIMARY_NAME || 'Cole Perry',
    primary_contact_phone: env.DELL_DISPATCH_PRIMARY_PHONE || '7249143764',
    primary_contact_email: env.DELL_DISPATCH_PRIMARY_EMAIL || 'cole.perry@eci.us',
    ship_address_line1: env.DELL_DISPATCH_SHIP_ADDRESS || '8 Park Dr',
    ship_address_line2: env.DELL_DISPATCH_SHIP_ADDRESS2 || '',
    ship_city: env.DELL_DISPATCH_SHIP_CITY || 'Lawrence',
    ship_state: env.DELL_DISPATCH_SHIP_STATE || 'PA',
    ship_zip: env.DELL_DISPATCH_SHIP_ZIP || '15055',
    ship_country: env.DELL_DISPATCH_SHIP_COUNTRY || 'United States',
    ship_timezone: env.DELL_DISPATCH_SHIP_TIMEZONE || 'US/Eastern',
    // Self-replace: do not request onsite Dell tech by default
    request_onsite_technician: false,
    request_complete_care: false,
    request_return_to_depot: false,
  };
}

module.exports = { loadDellEnv, envPath, getDellDispatchDefaults };
