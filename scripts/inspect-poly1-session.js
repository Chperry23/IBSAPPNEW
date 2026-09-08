process.env.DB_PATH = require('path').resolve(__dirname, '../data/cabinet_pm_tablet.db');
const db = require('../backend/config/database');

setTimeout(async () => {
  const cust = await db
    .prepare(
      `SELECT id, name, alias FROM customers
       WHERE name LIKE ? OR alias LIKE ? OR name LIKE ?`
    )
    .all(['%0001-0002-1166%', '%Poly%', '%1166%']);
  console.log('customers', cust);

  const sess = await db
    .prepare(
      `SELECT id, session_name, customer_id, status FROM sessions
       WHERE COALESCE(deleted,0)!=1
         AND (session_name LIKE ? OR session_name LIKE ? OR session_name LIKE ?)`
    )
    .all(['%Poly1%', '%7/22/2026%', '%7/22%']);
  console.log('sessions', sess);

  for (const s of sess) {
    console.log('\n===', s.session_name, s.id, '===');
    const custId = s.customer_id;
    const ctrls = await db
      .prepare(
        `SELECT id, name, model, deleted FROM sys_controllers
         WHERE customer_id = ? ORDER BY name`
      )
      .all([custId]);
    console.log('sys_controllers', ctrls.length);
    ctrls.forEach((c) =>
      console.log(
        `  id=${c.id} synth=${2000000 + c.id} name=${c.name} model=${c.model} del=${c.deleted}`
      )
    );

    const named = await db
      .prepare(
        `SELECT id, name, model FROM sys_controllers
         WHERE customer_id = ? AND (name LIKE ? OR name LIKE ? OR model LIKE ?)`
      )
      .all([custId, '%devnet%', '%DevNet%', '%devnet%']);
    console.log('devnet-named controllers', named);

    const excl = await db
      .prepare(
        `SELECT id, node_id, node_name, node_type, deleted, is_custom_node, has_io_errors
         FROM session_node_maintenance WHERE session_id = ? ORDER BY node_name`
      )
      .all([s.id]);
    console.log('maintenance rows', excl.length);
    excl.forEach((m) =>
      console.log(
        `  mid=${m.id} node_id=${m.node_id} name=${m.node_name} type=${m.node_type} del=${m.deleted} custom=${m.is_custom_node}`
      )
    );

    const diag = await db
      .prepare(
        `SELECT DISTINCT controller_name, COUNT(*) as cnt FROM session_diagnostics
         WHERE session_id = ? AND COALESCE(deleted,0)!=1
         GROUP BY controller_name ORDER BY controller_name`
      )
      .all([s.id]);
    console.log('diagnostics by controller', diag);
  }
  process.exit(0);
}, 2000);
