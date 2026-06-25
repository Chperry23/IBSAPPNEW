/**
 * Mongo connection helpers.
 * Single-node replica sets often advertise 127.0.0.1 — directConnection avoids
 * remote clients being redirected to localhost.
 */
const DEFAULT_MONGO_URI =
  'mongodb://172.16.10.124:27017/cabinet_pm_db?directConnection=true';

function normalizeMongoUri(uri) {
  if (!uri) return DEFAULT_MONGO_URI;
  if (/directConnection=/i.test(uri)) return uri;
  return uri.includes('?') ? `${uri}&directConnection=true` : `${uri}?directConnection=true`;
}

function getDefaultMongoUri() {
  return normalizeMongoUri(process.env.MONGODB_URI || DEFAULT_MONGO_URI);
}

module.exports = { DEFAULT_MONGO_URI, normalizeMongoUri, getDefaultMongoUri };
