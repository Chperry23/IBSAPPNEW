/**
 * Session PM timer helpers — pause/resume accumulates into active_seconds.
 */
function parseSqliteDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const s = String(value).trim();
  if (!s) return null;
  // SQLite CURRENT_TIMESTAMP is UTC-ish "YYYY-MM-DD HH:MM:SS"
  const isoish = /T|Z/.test(s) ? s : s.replace(' ', 'T') + 'Z';
  const d = new Date(isoish);
  if (!Number.isNaN(d.getTime())) return d;
  const d2 = new Date(s);
  return Number.isNaN(d2.getTime()) ? null : d2;
}

function computeElapsedSeconds(session, now = Date.now()) {
  let secs = Math.max(0, Number(session?.active_seconds) || 0);
  if (Number(session?.timer_running) === 1 && session?.timer_started_at) {
    const start = parseSqliteDate(session.timer_started_at);
    if (start) secs += Math.max(0, Math.floor((now - start.getTime()) / 1000));
  }
  return secs;
}

function personSeconds(session, now = Date.now()) {
  const crew = Math.max(1, Number(session?.crew_count) || 1);
  return computeElapsedSeconds(session, now) * crew;
}

function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

module.exports = {
  parseSqliteDate,
  computeElapsedSeconds,
  personSeconds,
  formatDuration,
};
