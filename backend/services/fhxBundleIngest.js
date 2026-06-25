'use strict';

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { markCustomerRegistryForSync } = require('../utils/registry-version');

function str(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** First matching column with a non-empty value (explicit Excel header variants). */
function firstCharmStr(row, keys) {
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(row, k)) continue;
    const v = str(row[k]);
    if (v !== null) return v;
  }
  return null;
}

/**
 * Handles duplicate truncated headers like two "Charm De" columns next to Definition / Description.
 */
function truncatedCharmPair(row) {
  const keys = Object.keys(row)
    .filter((k) => /^charm\s*de\b/i.test(String(k).trim()))
    .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  const vals = keys.map((k) => str(row[k])).filter((v) => v !== null && v !== '');
  if (vals.length >= 2) return [vals[0], vals[1]];
  if (vals.length === 1) return [vals[0], null];
  return [null, null];
}

function charmDefinitionFromRow(row) {
  const full = firstCharmStr(row, ['Charm Definition']);
  if (full) return full;
  const [a] = truncatedCharmPair(row);
  return a;
}

function charmDescriptionFromRow(row) {
  const full = firstCharmStr(row, ['Charm Description']);
  if (full) return full;
  const [, b] = truncatedCharmPair(row);
  return b;
}

function sheetRows(wb, sheetName) {
  if (!wb.SheetNames.includes(sheetName)) return [];
  return XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '', raw: false });
}

async function ingestFhxBundleWorkbook(db, customerId, xlsxPath) {
  if (!fs.existsSync(xlsxPath)) {
    throw new Error(`FHX workbook not found: ${xlsxPath}`);
  }

  const wb = XLSX.readFile(xlsxPath);
  const counts = {
    simple_io: 0,
    charms: 0,
    modules: 0,
    pid: 0,
    ai: 0,
    ao: 0,
    di: 0,
    do: 0,
  };

  try {
    await db.prepare('BEGIN').run();
  } catch (_) {}

  try {
    await db.prepare('DELETE FROM dv_modules WHERE customer_id = ?').run([customerId]);
    await db.prepare('DELETE FROM dv_pid_modules WHERE customer_id = ?').run([customerId]);
    await db.prepare('DELETE FROM dv_ai_modules WHERE customer_id = ?').run([customerId]);
    await db.prepare('DELETE FROM dv_ao_modules WHERE customer_id = ?').run([customerId]);
    await db.prepare('DELETE FROM dv_di_modules WHERE customer_id = ?').run([customerId]);
    await db.prepare('DELETE FROM dv_do_modules WHERE customer_id = ?').run([customerId]);

    await db.prepare('DELETE FROM sys_io_devices WHERE customer_id = ?').run([customerId]);
    await db.prepare('DELETE FROM sys_charms WHERE customer_id = ?').run([customerId]);

    const insIo = db.prepare(`
      INSERT INTO sys_io_devices (
        customer_id, bus_type, device_type, node, card, device_name, channel,
        fhx_description, fhx_enabled,
        uuid, synced, deleted, updated_at
      ) VALUES (
        ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, CURRENT_TIMESTAMP
      )
    `);

    for (const r of sheetRows(wb, 'SIMPLE_IO')) {
      const dst = str(r.DST);
      const nodeName = str(r.Node);
      const descr = str(r.Description);
      if (!dst && !nodeName && !descr) continue;
      await insIo.run([
        customerId,
        str(r.Type),
        nodeName || '',
        str(r['Card Slot']) != null ? String(r['Card Slot']) : '',
        dst || descr || 'UNKNOWN',
        str(r.Channel) != null ? String(r.Channel) : '',
        descr,
        str(r.Enabled),
        randomUUID(),
      ]);
      counts.simple_io++;
    }

    const insCharm = db.prepare(`
      INSERT INTO sys_charms (
        customer_id, charms_io_card_name, name, model,
        software_revision, hardware_revision, serial_number,
        fhx_dst, fhx_slot, fhx_channel, fhx_charm_definition,
        fhx_io_subsystem, fhx_charm_description, fhx_controller_assignment,
        fhx_redundant, fhx_channel_definition, fhx_channel_description, fhx_enabled,
        uuid, synced, deleted, updated_at
      ) VALUES (
        ?, ?, ?, ?,
        NULL, NULL, NULL,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, 0, 0, CURRENT_TIMESTAMP
      )
    `);

    for (const r of sheetRows(wb, 'CHARMS')) {
      const cioc = firstCharmStr(r, ['CIOC']);
      const dst = firstCharmStr(r, ['DST']);
      const chDef = charmDefinitionFromRow(r);
      const chDesc = charmDescriptionFromRow(r);
      const chan = firstCharmStr(r, ['Channel']);
      const ioSub = firstCharmStr(r, ['IO Subsystem', 'IO Subsys', 'IO Subsystem ', 'IOSubsystem']);
      const ctrlAsg = firstCharmStr(r, [
        'Controller Assignment',
        'Controller assignment',
      ]);
      const redundant = firstCharmStr(r, ['Redundant', 'Redundancy', 'Redundar']);
      const chDefDefn = firstCharmStr(r, ['Channel Definition', 'Channel Defn']);
      const chDefDescr = firstCharmStr(r, ['Channel Description']);
      const enabled = firstCharmStr(r, ['Enabled']);
      const slot = firstCharmStr(r, ['Card Slot', 'Card Slot ']);

      if (!cioc && !dst && !chDef && !chan) continue;
      const name =
        dst || chDef || [cioc, slot, chan].filter(Boolean).join('/') || 'FHX_CHARM';

      await insCharm.run([
        customerId,
        cioc,
        name,
        chDef,
        dst,
        slot,
        chan,
        chDef,
        ioSub,
        chDesc,
        ctrlAsg,
        redundant,
        chDefDefn,
        chDefDescr,
        enabled,
        randomUUID(),
      ]);
      counts.charms++;
    }

    const insMod = db.prepare(`
      INSERT INTO dv_modules (customer_id, module, area, description, assigned_controller, primary_control_display, faceplace_display, detail, type, module_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const r of sheetRows(wb, 'MODULES')) {
      if (!str(r.Module)) continue;
      await insMod.run([
        customerId,
        str(r.Module),
        str(r.Area),
        str(r.Description),
        str(r['Assigned Controller']),
        str(r['Primary Control Display']),
        str(r['Faceplace Display']),
        str(r.Detail),
        str(r.Type),
        str(r['Module Type']),
      ]);
      counts.modules++;
    }

    const insPid = db.prepare(`
      INSERT INTO dv_pid_modules (customer_id, tag_name, module_name, description, area, control_mode, proportional_gain, integral_time, derivative_time, set_point, output_high, output_low, eng_units)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    for (const r of sheetRows(wb, 'PID_MODULES')) {
      if (!str(r.TagName) && !str(r.ModuleName)) continue;
      await insPid.run([
        customerId,
        str(r.TagName),
        str(r.ModuleName),
        str(r.Description),
        str(r.Area),
        str(r.ControlMode),
        str(r.ProportionalGain),
        str(r.IntegralTime),
        str(r.DerivativeTime),
        str(r.SetPoint),
        str(r.OutputHigh),
        str(r.OutputLow),
        str(r.EngUnits),
      ]);
      counts.pid++;
    }

    async function insertAnalog(table, sheet) {
      const safe = ['dv_ai_modules', 'dv_ao_modules'];
      if (!safe.includes(table)) throw new Error('Invalid analog table');
      const stmt = db.prepare(`
        INSERT INTO ${table} (customer_id, tag_name, module_name, description, area, eng_units, range_high, range_low, alarm_high_high, alarm_high, alarm_low, alarm_low_low, deadband, filter_type, filter_time_constant)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `);
      let n = 0;
      for (const r of sheetRows(wb, sheet)) {
        if (!str(r.TagName) && !str(r.ModuleName)) continue;
        await stmt.run([
          customerId,
          str(r.TagName),
          str(r.ModuleName),
          str(r.Description),
          str(r.Area),
          str(r.EngUnits),
          str(r.RangeHigh),
          str(r.RangeLow),
          str(r.AlarmHighHigh),
          str(r.AlarmHigh),
          str(r.AlarmLow),
          str(r.AlarmLowLow),
          str(r.Deadband),
          str(r.FilterType),
          str(r.FilterTimeConstant),
        ]);
        n++;
      }
      return n;
    }

    counts.ai = await insertAnalog('dv_ai_modules', 'AI_MODULES');
    counts.ao = await insertAnalog('dv_ao_modules', 'AO_MODULES');

    const insDi = db.prepare(`
      INSERT INTO dv_di_modules (customer_id, tag_name, module_name, description, area, state0_text, state1_text, alarm_on_state, alarm_priority)
      VALUES (?,?,?,?,?,?,?,?,?)
    `);
    for (const r of sheetRows(wb, 'DI_MODULES')) {
      if (!str(r.TagName) && !str(r.ModuleName)) continue;
      await insDi.run([
        customerId,
        str(r.TagName),
        str(r.ModuleName),
        str(r.Description),
        str(r.Area),
        str(r.State0Text),
        str(r.State1Text),
        str(r.AlarmOnState),
        str(r.AlarmPriority),
      ]);
      counts.di++;
    }

    const insDo = db.prepare(`
      INSERT INTO dv_do_modules (customer_id, tag_name, module_name, description, area, state0_text, state1_text, alarm_on_state, alarm_priority)
      VALUES (?,?,?,?,?,?,?,?,?)
    `);
    for (const r of sheetRows(wb, 'DO_MODULES')) {
      if (!str(r.TagName) && !str(r.ModuleName)) continue;
      await insDo.run([
        customerId,
        str(r.TagName),
        str(r.ModuleName),
        str(r.Description),
        str(r.Area),
        str(r.State0Text),
        str(r.State1Text),
        str(r.AlarmOnState),
        str(r.AlarmPriority),
      ]);
      counts.do++;
    }

    await db.prepare('COMMIT').run();
  } catch (e) {
    try {
      await db.prepare('ROLLBACK').run();
    } catch (_) {}
    throw e;
  }

  await db.prepare(`UPDATE sys_charms SET id = CAST(rowid AS TEXT) WHERE customer_id = ? AND id IS NULL`).run([
    customerId,
  ]);

  await db
    .prepare(
      `
    INSERT INTO dv_fhx_import_meta (
      customer_id, bundle_schema, workbook_path_note,
      simple_io_rows, charms_rows, modules_rows, pid_rows, ai_rows, ao_rows, di_rows, do_rows
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run([
      customerId,
      'cabinet-pm-customer-import-bundle/v1',
      path.basename(xlsxPath),
      counts.simple_io,
      counts.charms,
      counts.modules,
      counts.pid,
      counts.ai,
      counts.ao,
      counts.di,
      counts.do,
    ]);

  if (counts.simple_io > 0 || counts.charms > 0) {
    await markCustomerRegistryForSync(db, customerId);
  }

  return counts;
}

module.exports = { ingestFhxBundleWorkbook, sheetRows };
