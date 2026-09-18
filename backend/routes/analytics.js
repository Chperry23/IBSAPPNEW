const express = require('express');
const router = express.Router();
const db = require('../config/database');
const requireAuth = require('../middleware/auth');
const {
  computeElapsedSeconds,
  formatDuration,
} = require('../utils/session-timer');

function weekLabelFromKey(key) {
  // key: YYYY-Www from strftime('%Y-W%W')
  if (!key) return '';
  return String(key).replace('-W', ' W');
}

function hasPsuReading(ps) {
  if (!ps || typeof ps !== 'object') return false;
  const fields = ['dc_reading', 'line_neutral', 'line_ground', 'neutral_ground'];
  return fields.some((f) => String(ps[f] ?? '').trim() !== '');
}

function isPsuFailed(ps) {
  if (!ps || typeof ps !== 'object') return false;
  if (ps.psu_dead === true || ps.psu_dead === 1 || ps.psu_dead === '1') return true;
  const st = String(ps.status || '').toLowerCase();
  return st === 'fail' || st === 'failed';
}

/** Team + customer-valuable PM analytics from local SQLite. */
router.get('/overview', requireAuth, async (req, res) => {
  const weeks = Math.min(26, Math.max(4, parseInt(req.query.weeks, 10) || 12));

  try {
    const kpisRow = await db
      .prepare(
        `
      SELECT
        (SELECT COUNT(*) FROM customers WHERE COALESCE(deleted, 0) = 0) as customers,
        (SELECT COUNT(*) FROM sessions WHERE COALESCE(deleted, 0) = 0) as sessions,
        (SELECT COUNT(*) FROM sessions WHERE status = 'completed' AND COALESCE(deleted, 0) = 0) as completed_sessions,
        (SELECT COUNT(*) FROM sessions WHERE status != 'completed' AND COALESCE(deleted, 0) = 0) as active_sessions,
        (SELECT COUNT(*) FROM cabinets WHERE COALESCE(deleted, 0) = 0) as cabinets,
        (SELECT COUNT(*) FROM cabinets WHERE status = 'completed' AND COALESCE(deleted, 0) = 0) as completed_cabinets,
        (SELECT COUNT(*) FROM cabinets WHERE status != 'completed' AND COALESCE(deleted, 0) = 0) as pending_cabinets,
        (SELECT COUNT(*) FROM session_diagnostics WHERE COALESCE(deleted, 0) = 0) as io_errors
    `
      )
      .get();

    const sessionsByWeek = await db
      .prepare(
        `
      SELECT strftime('%Y-W%W', completed_at) as week_key,
             COUNT(*) as completed
      FROM sessions
      WHERE status = 'completed'
        AND completed_at IS NOT NULL
        AND COALESCE(deleted, 0) = 0
        AND completed_at >= datetime('now', ?)
      GROUP BY week_key
      ORDER BY week_key ASC
    `
      )
      .all([`-${weeks * 7} days`]);

    const cabinetsByWeek = await db
      .prepare(
        `
      SELECT strftime('%Y-W%W', COALESCE(s.completed_at, cab.updated_at)) as week_key,
             COUNT(*) as completed
      FROM cabinets cab
      LEFT JOIN sessions s ON s.id = cab.pm_session_id
      WHERE cab.status = 'completed'
        AND COALESCE(cab.deleted, 0) = 0
        AND COALESCE(s.deleted, 0) = 0
        AND COALESCE(s.completed_at, cab.updated_at) >= datetime('now', ?)
      GROUP BY week_key
      ORDER BY week_key ASC
    `
      )
      .all([`-${weeks * 7} days`]);

    const ioByWeek = await db
      .prepare(
        `
      SELECT strftime('%Y-W%W', d.created_at) as week_key,
             COUNT(*) as errors
      FROM session_diagnostics d
      WHERE COALESCE(d.deleted, 0) = 0
        AND d.created_at >= datetime('now', ?)
      GROUP BY week_key
      ORDER BY week_key ASC
    `
      )
      .all([`-${weeks * 7} days`]);

    const completedWithTimer = await db
      .prepare(
        `
      SELECT id, session_name, customer_id, completed_at, created_at,
             active_seconds, timer_running, timer_started_at, crew_count
      FROM sessions
      WHERE status = 'completed' AND COALESCE(deleted, 0) = 0
        AND completed_at IS NOT NULL
        AND completed_at >= datetime('now', ?)
      ORDER BY completed_at DESC
    `
      )
      .all([`-${weeks * 7} days`]);

    const durationBuckets = new Map();
    let durationSum = 0;
    let durationCount = 0;
    let personHoursSum = 0;

    const weekKeyFor = (completedAt) => {
      const d = new Date(String(completedAt).replace(' ', 'T') + (String(completedAt).includes('Z') ? '' : 'Z'));
      if (Number.isNaN(d.getTime())) return null;
      // ISO week-ish label matching SQLite %W style year-week
      const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      const dayNum = tmp.getUTCDay() || 7;
      tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
      return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
    };

    for (const s of completedWithTimer) {
      let secs = computeElapsedSeconds(s);
      // Fallback wall-clock for older sessions without timer data
      if (secs <= 0 && s.created_at && s.completed_at) {
        const a = new Date(String(s.created_at).replace(' ', 'T') + 'Z').getTime();
        const b = new Date(String(s.completed_at).replace(' ', 'T') + 'Z').getTime();
        if (!Number.isNaN(a) && !Number.isNaN(b) && b > a) {
          // Cap overnight wall clock at 16h so idle nights don't dominate
          secs = Math.min(Math.floor((b - a) / 1000), 16 * 3600);
        }
      }
      if (secs <= 0) continue;
      durationSum += secs;
      durationCount += 1;
      personHoursSum += (secs * Math.max(1, Number(s.crew_count) || 1)) / 3600;

      const wk = weekKeyFor(s.completed_at);
      if (!wk) continue;
      const cur = durationBuckets.get(wk) || { week_key: wk, total_seconds: 0, count: 0 };
      cur.total_seconds += secs;
      cur.count += 1;
      durationBuckets.set(wk, cur);
    }

    const durationByWeek = [...durationBuckets.values()]
      .sort((a, b) => String(a.week_key).localeCompare(String(b.week_key)))
      .map((r) => ({
        week_key: r.week_key,
        label: weekLabelFromKey(r.week_key),
        avg_seconds: r.count ? Math.round(r.total_seconds / r.count) : 0,
        avg_label: formatDuration(r.count ? r.total_seconds / r.count : 0),
        count: r.count,
      }));

    // Power supplies — sample from non-deleted cabinets (parse JSON in Node)
    const cabRows = await db
      .prepare(
        `
      SELECT power_supplies FROM cabinets
      WHERE COALESCE(deleted, 0) = 0
        AND power_supplies IS NOT NULL
        AND TRIM(power_supplies) != ''
        AND TRIM(power_supplies) != '[]'
    `
      )
      .all();

    let psusTotal = 0;
    let psusChecked = 0;
    let psusFailed = 0;
    for (const row of cabRows) {
      let arr = [];
      try {
        arr = JSON.parse(row.power_supplies || '[]');
      } catch {
        continue;
      }
      if (!Array.isArray(arr)) continue;
      for (const ps of arr) {
        psusTotal += 1;
        if (hasPsuReading(ps) || isPsuFailed(ps) || String(ps.status || '').toLowerCase() === 'pass') {
          psusChecked += 1;
        }
        if (isPsuFailed(ps)) psusFailed += 1;
      }
    }

    const topCustomers = await db
      .prepare(
        `
      SELECT c.id as customer_id,
             c.name as customer_name,
             COUNT(cab.id) as cabinet_count,
             SUM(CASE WHEN cab.status = 'completed' THEN 1 ELSE 0 END) as completed_cabinets,
             COUNT(DISTINCT s.id) as session_count
      FROM customers c
      JOIN sessions s ON s.customer_id = c.id AND COALESCE(s.deleted, 0) = 0
      JOIN cabinets cab ON cab.pm_session_id = s.id AND COALESCE(cab.deleted, 0) = 0
      WHERE COALESCE(c.deleted, 0) = 0
      GROUP BY c.id
      ORDER BY completed_cabinets DESC, cabinet_count DESC
      LIMIT 8
    `
      )
      .all();

    const healthTrend = await db
      .prepare(
        `
      SELECT strftime('%Y-%m', recorded_at) as month_key,
             ROUND(AVG(risk_score), 1) as avg_score,
             ROUND(AVG(error_count), 1) as avg_errors,
             COUNT(*) as samples
      FROM customer_metric_history
      WHERE COALESCE(deleted, 0) = 0
        AND recorded_at IS NOT NULL
        AND recorded_at >= datetime('now', '-18 months')
      GROUP BY month_key
      ORDER BY month_key ASC
    `
      )
      .all();

    const recentCompleted = completedWithTimer.slice(0, 10).map((s) => {
      const secs = computeElapsedSeconds(s);
      return {
        id: s.id,
        session_name: s.session_name,
        customer_id: s.customer_id,
        completed_at: s.completed_at,
        duration_seconds: secs,
        duration_label: secs > 0 ? formatDuration(secs) : '—',
        crew_count: Math.max(1, Number(s.crew_count) || 1),
        person_hours:
          secs > 0
            ? Number(((secs * Math.max(1, Number(s.crew_count) || 1)) / 3600).toFixed(1))
            : null,
      };
    });

    // Enrich recent with customer names
    for (const row of recentCompleted) {
      const c = await db
        .prepare(`SELECT name FROM customers WHERE id = ?`)
        .get([row.customer_id]);
      row.customer_name = c?.name || '';
    }

    res.json({
      weeks,
      kpis: {
        customers: kpisRow?.customers || 0,
        sessions: kpisRow?.sessions || 0,
        completed_sessions: kpisRow?.completed_sessions || 0,
        active_sessions: kpisRow?.active_sessions || 0,
        cabinets: kpisRow?.cabinets || 0,
        completed_cabinets: kpisRow?.completed_cabinets || 0,
        pending_cabinets: kpisRow?.pending_cabinets || 0,
        io_errors: kpisRow?.io_errors || 0,
        avg_duration_seconds: durationCount ? Math.round(durationSum / durationCount) : 0,
        avg_duration_label: durationCount
          ? formatDuration(durationSum / durationCount)
          : '—',
        total_person_hours: Number(personHoursSum.toFixed(1)),
        timed_sessions: durationCount,
        psus_total: psusTotal,
        psus_checked: psusChecked,
        psus_failed: psusFailed,
        psu_check_rate: psusTotal ? Math.round((psusChecked / psusTotal) * 100) : 0,
      },
      sessionsByWeek: sessionsByWeek.map((r) => ({
        ...r,
        label: weekLabelFromKey(r.week_key),
      })),
      cabinetsByWeek: cabinetsByWeek.map((r) => ({
        ...r,
        label: weekLabelFromKey(r.week_key),
      })),
      ioErrorsByWeek: ioByWeek.map((r) => ({
        ...r,
        label: weekLabelFromKey(r.week_key),
      })),
      durationByWeek,
      topCustomers,
      healthTrend,
      recentCompleted,
    });
  } catch (error) {
    console.error('Analytics overview error:', error);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

module.exports = router;
