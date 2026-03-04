/**
 * Sync Performance Benchmark
 * 
 * Measures the four key sync operations independently:
 *   1. SQLite read  — getUnsyncedLocalRecords (all tables)
 *   2. SQLite write — markRecordsAsSynced bulk vs single  (simulated)
 *   3. Pull timing  — reads from server log after a real pull call
 *   4. Push timing  — reads from server log after a real push call
 * 
 * Usage (from project root, with server already running):
 *   node benchmark-sync.js
 * 
 * Or run against a specific server URL:
 *   node benchmark-sync.js --url http://localhost:3001
 */

const path = require('path');
const http = require('http');

const BASE_URL = (() => {
  const idx = process.argv.indexOf('--url');
  return idx !== -1 ? process.argv[idx + 1] : 'http://localhost:3000';
})();

// ─── helpers ────────────────────────────────────────────────────────────────

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(BASE_URL);
    const data = body ? JSON.stringify(body) : undefined;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: urlPath,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };
    const req = http.request(options, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function sep(label) {
  console.log('\n' + '─'.repeat(60));
  console.log(`  ${label}`);
  console.log('─'.repeat(60));
}

function row(label, value) {
  console.log(`  ${label.padEnd(32)} ${value}`);
}

// ─── SQLite local benchmarks ─────────────────────────────────────────────────

async function benchmarkSQLite() {
  sep('SQLite Local Benchmarks');

  let sqlite3, db;
  try {
    sqlite3 = require('sqlite3').verbose();
  } catch {
    console.log('  sqlite3 not available in this context — skipping local benchmarks.');
    return;
  }

  const dbPath = process.env.DB_PATH ||
    path.resolve(__dirname, 'data/cabinet_pm_tablet.db');

  db = new sqlite3.Database(dbPath);

  const tables = [
    'users','customers','sessions','cabinets','nodes',
    'session_node_maintenance','cabinet_locations','session_pm_notes',
    'session_ii_documents','session_ii_equipment','session_ii_checklist',
    'session_ii_equipment_used','sys_workstations','sys_smart_switches',
    'sys_io_devices','sys_controllers','sys_charms_io_cards',
    'sys_charms','sys_ams_systems','customer_metric_history'
  ];

  // Check PRAGMA journal_mode
  const journalMode = await new Promise((res, rej) =>
    db.get('PRAGMA journal_mode', (err, row) => err ? rej(err) : res(row))
  );
  row('journal_mode', journalMode ? journalMode.journal_mode : 'unknown');

  // Count unsynced per table
  let totalUnsynced = 0;
  let totalRows = 0;
  const t0 = Date.now();

  for (const tbl of tables) {
    try {
      const [unsyncedRow, totalRow] = await Promise.all([
        new Promise((res, rej) =>
          db.get(`SELECT COUNT(*) as c FROM ${tbl} WHERE synced = 0 OR synced IS NULL`,
            (err, r) => err ? rej(err) : res(r))
        ),
        new Promise((res, rej) =>
          db.get(`SELECT COUNT(*) as c FROM ${tbl}`, (err, r) => err ? rej(err) : res(r))
        )
      ]);
      const unsynced = unsyncedRow ? unsyncedRow.c : 0;
      const total    = totalRow    ? totalRow.c    : 0;
      totalUnsynced += unsynced;
      totalRows     += total;
      if (unsynced > 0) row(`  ${tbl}`, `${unsynced} unsynced / ${total} total`);
    } catch {
      // table may not exist on this device
    }
  }

  const countMs = Date.now() - t0;
  row('Total unsynced records', String(totalUnsynced));
  row('Total rows across tables', String(totalRows));
  row('Time to count all tables', `${countMs}ms`);

  // Bulk markRecordsAsSynced simulation — compare single vs bulk
  // We create a temp table, insert N rows, then time the two strategies.
  const N = 500;
  await new Promise((res, rej) => db.run(
    `CREATE TEMP TABLE _bench (id INTEGER PRIMARY KEY, synced INTEGER DEFAULT 0)`,
    err => err ? rej(err) : res()
  ));

  // Insert N rows
  await new Promise((res, rej) => {
    db.serialize(() => {
      db.run('BEGIN');
      for (let i = 1; i <= N; i++) db.run(`INSERT INTO _bench VALUES (${i}, 0)`);
      db.run('COMMIT', err => err ? rej(err) : res());
    });
  });

  // Strategy A: N individual UPDATEs (old way)
  const idsA = Array.from({ length: N }, (_, i) => i + 1);
  const tA = Date.now();
  for (const id of idsA) {
    await new Promise((res, rej) =>
      db.run(`UPDATE _bench SET synced = 0 WHERE id = ?`, [id], err => err ? rej(err) : res())
    );
  }
  const msA = Date.now() - tA;

  // Strategy B: single UPDATE ... WHERE id IN (...)
  // Reset first
  await new Promise((res, rej) => db.run(`UPDATE _bench SET synced = 0`, err => err ? rej(err) : res()));
  const placeholders = idsA.map(() => '?').join(',');
  const tB = Date.now();
  await new Promise((res, rej) =>
    db.run(`UPDATE _bench SET synced = 1 WHERE id IN (${placeholders})`, idsA,
      err => err ? rej(err) : res())
  );
  const msB = Date.now() - tB;

  sep(`markRecordAsSynced — ${N} records`);
  row('Strategy A: N individual UPDATEs', `${msA}ms`);
  row('Strategy B: bulk WHERE id IN (...)', `${msB}ms`);
  row('Speedup', `${(msA / Math.max(msB, 1)).toFixed(1)}×`);

  await new Promise((res, rej) => db.run('DROP TABLE _bench', err => err ? rej(err) : res()));
  db.close();
}

// ─── API sync benchmarks ─────────────────────────────────────────────────────

async function benchmarkSyncAPI() {
  sep('Sync API Benchmarks (live server)');

  // Check server is up
  try {
    const ping = await request('GET', '/api/version');
    if (ping.status !== 200) throw new Error(`status ${ping.status}`);
    row('Server', `${BASE_URL} (v${ping.body.version || '?'})`);
  } catch (e) {
    console.log(`  ⚠️  Server not reachable at ${BASE_URL}: ${e.message}`);
    console.log('  Start the app first, then re-run this benchmark.');
    return;
  }

  // Pull benchmark
  try {
    const t0 = Date.now();
    const res = await request('POST', '/api/sync/enhanced-merge/pull', {});
    const elapsed = Date.now() - t0;
    if (res.body && res.body.success !== undefined) {
      row('Pull round-trip', `${elapsed}ms`);
      row('  server-reported pull time', `${res.body.totalMs ?? '?'}ms`);
      row('  records pulled', String(res.body.totalPulled ?? '?'));
      row('  conflicts', String(res.body.totalConflicts ?? '?'));
    } else {
      row('Pull', `HTTP ${res.status} — ${JSON.stringify(res.body).slice(0, 80)}`);
    }
  } catch (e) {
    row('Pull', `error: ${e.message}`);
  }

  // Push benchmark
  try {
    const t0 = Date.now();
    const res = await request('POST', '/api/sync/enhanced-merge/push', {});
    const elapsed = Date.now() - t0;
    if (res.body && res.body.success !== undefined) {
      row('Push round-trip', `${elapsed}ms`);
      row('  server-reported push time', `${res.body.totalMs ?? '?'}ms`);
      row('  records pushed', String(res.body.totalPushed ?? '?'));
      row('  records deleted', String(res.body.totalDeleted ?? '?'));
    } else {
      row('Push', `HTTP ${res.status} — ${JSON.stringify(res.body).slice(0, 80)}`);
    }
  } catch (e) {
    row('Push', `error: ${e.message}`);
  }

  // Full sync benchmark
  try {
    const t0 = Date.now();
    const res = await request('POST', '/api/sync/enhanced-merge/full', {});
    const elapsed = Date.now() - t0;
    if (res.body && res.body.success !== undefined) {
      row('Full merge sync round-trip', `${elapsed}ms`);
      row('  server-reported total time', `${res.body.totalMs ?? '?'}ms`);
      row('  pulled', String(res.body.totalPulled ?? '?'));
      row('  pushed', String(res.body.totalPushed ?? '?'));
    } else {
      row('Full sync', `HTTP ${res.status} — ${JSON.stringify(res.body).slice(0, 80)}`);
    }
  } catch (e) {
    row('Full sync', `error: ${e.message}`);
  }
}

// ─── main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n🏁 Cabinet PM — Sync Performance Benchmark');
  console.log(`   ${new Date().toLocaleString()}`);

  await benchmarkSQLite();
  await benchmarkSyncAPI();

  console.log('\n' + '─'.repeat(60));
  console.log('  Done.\n');
})().catch(err => {
  console.error('Benchmark failed:', err.message);
  process.exit(1);
});
