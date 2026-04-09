/**
 * Risk assessment for PM session PDF.
 *
 * Produces two independent outputs:
 *   riskScore  — normalized 0-100 weighted failure-rate score (comparable across site sizes)
 *   riskLevel  — severity badge driven by worst issue present (CRITICAL / MODERATE / LOW / GOOD)
 *
 * Score formula per check:
 *   C_i = weight_i × (bad_i / applicable_i)
 *   riskScore = 100 × ΣC_i / Σweight_i   (denominator only includes checks that were applicable)
 *
 * Domain subscores use the same formula filtered to each domain category.
 * Coverage tracks how many check-points were actually recorded vs expected.
 */

// Voltage range specifications
const VOLTAGE_RANGES = {
  '24VDC':         { min: 22.8,  max: 25.2,   type: 'DC' },
  '12VDC':         { min: 11.4,  max: 12.6,   type: 'DC' },
  'line_neutral':  { min: 100,   max: 130,     type: 'AC', unit: 'V' },
  'line_ground':   { min: 100,   max: 130,     type: 'AC', unit: 'V' },
  'neutral_ground':{ min: 0,     max: 1000,    type: 'AC', unit: 'mV' }
};

function checkVoltageInRange(voltage, voltageType) {
  const numVoltage = parseFloat(voltage);
  if (isNaN(numVoltage)) return { inRange: true, message: '' };

  const range = VOLTAGE_RANGES[voltageType];
  if (!range) return { inRange: true, message: '' };

  const inRange = numVoltage >= range.min && numVoltage <= range.max;
  const unit = range.unit || 'V';
  const message = inRange
    ? ''
    : `${voltageType} reading ${numVoltage}${unit} is outside normal range (${range.min}-${range.max}${unit})`;

  return { inRange, message };
}

/**
 * RISK_CHECKS — canonical check definitions.
 *
 * scoring_type:
 *   per_cabinet   — denominator = cabinets where the inspection key was recorded
 *   per_component — denominator = total items in the relevant component array
 *   per_node      — denominator = nodes evaluated with that performance type
 *
 * badge_escalation: 'critical_if_any'
 *   Any failure of this check pushes the site badge to CRITICAL regardless of rate.
 *   (Implemented by setting level to CRITICAL/SUPER_CRITICAL so failures flow into criticalIssues.)
 */
/**
 * TIER ALLOCATIONS — control what share of the 0-100 score each severity class can influence.
 *
 * Critical checks (controller faults, I/O failures, network failures) → 70 pts max
 * Moderate checks (power, node maintenance, cabinet fans, ground)      → 20 pts max
 * Slight checks   (temps, cleanliness, filter, AC voltage)             → 10 pts max
 *
 * Within each tier: score = weighted failure rate × 2, capped at the tier's allocation.
 * (×2 means 50% failure rate within a tier = that tier's full allocation.)
 * Total is always 0–100.
 */
const TIER_ALLOCATIONS = { CRITICAL: 70, MODERATE: 20, SLIGHT: 10 };

const RISK_CHECKS = {
  // ── Controllers (own domain — critical: controls live processes) ───────────
  controller_leds: {
    weight: 25, level: 'CRITICAL', domain: 'controllers',
    scoring_type: 'per_cabinet', badge_escalation: 'critical_if_any',
    description: 'indicates critical system fault'
  },
  io_status: {
    weight: 20, level: 'CRITICAL', domain: 'controllers',
    scoring_type: 'per_cabinet', badge_escalation: 'critical_if_any',
    description: 'communication failure affects process control'
  },

  // ── Network (critical-class) ───────────────────────────────────────────────
  network_status: {
    weight: 20, level: 'CRITICAL', domain: 'network',
    scoring_type: 'per_cabinet', badge_escalation: 'critical_if_any',
    description: 'network failure affects system connectivity'
  },
  network_equipment_entron: {
    weight: 20, level: 'CRITICAL', domain: 'network',
    scoring_type: 'per_component', badge_escalation: 'critical_if_any',
    description: 'Entron switch failure is critical'
  },
  network_equipment_other: {
    weight: 8, level: 'MODERATE', domain: 'network',
    scoring_type: 'per_component',
    description: 'network equipment failure'
  },

  // ── Cabinet Condition (physical cabinet state, excluding controllers) ──────
  cabinet_fans: {
    weight: 8, level: 'MODERATE', domain: 'cabinet_condition',
    scoring_type: 'per_cabinet',
    description: 'affects controller efficiency and hardware lifetime'
  },
  ground_inspection: {
    weight: 10, level: 'MODERATE', domain: 'cabinet_condition',
    scoring_type: 'per_cabinet',
    description: 'electrical safety concern'
  },

  // ── Environmental (hygiene and environment) ────────────────────────────────
  temperatures: {
    weight: 4, level: 'SLIGHT', domain: 'environmental',
    scoring_type: 'per_cabinet',
    description: 'environmental conditions outside optimal range'
  },
  is_clean: {
    weight: 3, level: 'SLIGHT', domain: 'environmental',
    scoring_type: 'per_cabinet',
    description: 'cleanliness affects long-term reliability'
  },
  clean_filter_installed: {
    weight: 3, level: 'SLIGHT', domain: 'environmental',
    scoring_type: 'per_cabinet',
    description: 'filter maintenance affects air quality'
  },

  // ── Per-component: power supplies ─────────────────────────────────────────
  power_supply_fail: {
    weight: 8, level: 'MODERATE', domain: 'power',
    scoring_type: 'per_component',
    description: 'power supply status out of spec'
  },
  voltage_out_of_range: {
    weight: 12, level: 'MODERATE', domain: 'power',
    scoring_type: 'per_component',
    description: 'DC voltage deviation may cause instability'
  },
  ac_voltage_out_of_range: {
    weight: 3, level: 'SLIGHT', domain: 'power',
    scoring_type: 'per_component',
    description: 'AC voltage deviation'
  },

  // ── Per-component: other power hardware ───────────────────────────────────
  distribution_block_fail: {
    weight: 8, level: 'MODERATE', domain: 'power',
    scoring_type: 'per_component',
    description: 'distribution block voltage out of spec'
  },
  diode_fail: {
    weight: 6, level: 'MODERATE', domain: 'power',
    scoring_type: 'per_component',
    description: 'diode voltage out of spec'
  },
  media_converter_fail: {
    weight: 6, level: 'MODERATE', domain: 'power',
    scoring_type: 'per_component',
    description: 'media converter voltage out of spec'
  },
  pib_fail: {
    weight: 8, level: 'MODERATE', domain: 'power',
    scoring_type: 'per_component',
    description: 'power injected baseplate voltage out of spec'
  },

  // ── Per-node: node maintenance ────────────────────────────────────────────
  perf_index_poor: {
    weight: 15, level: 'MODERATE', domain: 'node_maintenance',
    scoring_type: 'per_node',
    description: 'poor performance index indicates degraded controller performance'
  },
  free_time_low: {
    weight: 12, level: 'MODERATE', domain: 'node_maintenance',
    scoring_type: 'per_node',
    description: 'low free time indicates high controller utilization'
  }
};

function getInspectionDescription(key) {
  const descriptions = {
    cabinet_fans:           'Cabinet cooling fans failed',
    controller_leds:        'Controller status LEDs indicate fault',
    io_status:              'I/O module status indicates failure',
    network_status:         'Network equipment status failed',
    temperatures:           'Environmental temperatures out of range',
    is_clean:               'Enclosure cleanliness below standard',
    clean_filter_installed: 'Clean filter not properly installed',
    ground_inspection:      'Ground connection inspection failed'
  };
  return descriptions[key] || key.replace(/_/g, ' ');
}

// Keys that map to per-cabinet inspection flags
const INSPECTION_CHECK_KEYS = Object.keys(RISK_CHECKS).filter(
  k => RISK_CHECKS[k].scoring_type === 'per_cabinet'
);

const DOMAINS = ['controllers', 'network', 'power', 'cabinet_condition', 'environmental', 'node_maintenance'];

function generateRiskAssessment(cabinets, nodeMaintenanceData = []) {
  // bad_i / applicable_i counters for every defined check
  const tally = {};
  Object.keys(RISK_CHECKS).forEach(key => { tally[key] = { bad: 0, applicable: 0 }; });

  // Badge issue lists (unchanged semantics)
  const criticalIssues  = [];
  const moderateIssues  = [];
  const slightIssues    = [];
  const riskBreakdown   = [];

  // Backward-compatible component counts
  let totalComponents  = 0;
  let failedComponents = 0;

  // Coverage: completed = observations actually recorded; total = expected observations
  // For per_cabinet checks, total = cabinets.length × INSPECTION_CHECK_KEYS.length
  // For per_component / per_node checks, total = completed (every submitted item was recorded)
  let coverageCompleted = 0;
  let coverageTotal     = 0;

  // ── Helpers ────────────────────────────────────────────────────────────────

  function observe(checkKey, isBad) {
    tally[checkKey].applicable++;
    if (isBad) tally[checkKey].bad++;
  }

  function addIssue(checkKey, message) {
    const level = RISK_CHECKS[checkKey].level;
    if (level === 'SUPER_CRITICAL' || level === 'CRITICAL') {
      criticalIssues.push(message);
    } else if (level === 'MODERATE') {
      moderateIssues.push(message);
    } else {
      slightIssues.push(message);
    }
  }

  // ── Node maintenance ───────────────────────────────────────────────────────
  // perf_index 0-5: ≤ 2 is risky.  free_time 0-100%: ≤ 28% is risky.
  // Values 1-5 stored as free_time are treated as mis-stored perf index; skip.
  nodeMaintenanceData.forEach(maintenance => {
    const nodeName = maintenance.node_name || `Node ${maintenance.node_id}`;
    if (maintenance.performance_value == null || !maintenance.performance_type) return;
    const pv = Number(maintenance.performance_value);

    if (maintenance.performance_type === 'perf_index') {
      const isBad = pv <= 2;
      observe('perf_index_poor', isBad);
      coverageCompleted++;
      coverageTotal++;
      if (isBad) {
        riskBreakdown.push(`${nodeName}: Poor performance index (${maintenance.performance_value}/5)`);
        addIssue('perf_index_poor', `${nodeName}: Performance index ${maintenance.performance_value}/5 indicates degraded controller performance`);
      }
    } else if (maintenance.performance_type === 'free_time') {
      if (pv >= 1 && pv <= 5) return; // mis-stored perf index value — skip
      const isBad = pv <= 28;
      observe('free_time_low', isBad);
      coverageCompleted++;
      coverageTotal++;
      if (isBad) {
        riskBreakdown.push(`${nodeName}: Low free time (${maintenance.performance_value}%)`);
        addIssue('free_time_low', `${nodeName}: Free time ${maintenance.performance_value}% indicates high controller utilization`);
      }
    }

    // HDD replacement is informational only — not scored, slight note only
    if (maintenance.hdd_replaced) {
      riskBreakdown.push(`${nodeName}: HDD replaced`);
      slightIssues.push(`${nodeName}: Hard drive was replaced during this PM`);
    }
  });

  // ── Cabinets ───────────────────────────────────────────────────────────────
  cabinets.forEach((cabinet, cabinetIndex) => {
    const cabinetName = cabinet.cabinet_name || cabinet.cabinet_location || `Cabinet ${cabinetIndex + 1}`;
    const inspection  = cabinet.inspection || {};

    // Per-cabinet inspection checks
    // coverage_total increases for every cabinet × every defined inspection key
    // coverage_completed increases only when the value was actually recorded (pass or fail)
    INSPECTION_CHECK_KEYS.forEach(key => {
      coverageTotal++;
      const val = inspection[key];
      const wasRecorded = val === 'pass' || val === 'fail';
      if (wasRecorded) {
        coverageCompleted++;
        totalComponents++;
        const isFail = val === 'fail';
        observe(key, isFail);
        if (isFail) {
          failedComponents++;
          const check = RISK_CHECKS[key];
          riskBreakdown.push(`${cabinetName}: ${key.replace(/_/g, ' ')} failed inspection`);
          addIssue(key, `${cabinetName}: ${getInspectionDescription(key)} - ${check.description}`);
        }
      }
    });

    // Power supplies
    if (cabinet.power_supplies) {
      cabinet.power_supplies.forEach((ps, psIndex) => {
        totalComponents++;
        // Status
        observe('power_supply_fail', ps.status === 'fail');
        coverageCompleted++;
        coverageTotal++;
        if (ps.status === 'fail') {
          failedComponents++;
          riskBreakdown.push(`${cabinetName}: Power Supply ${psIndex + 1} voltage out of spec`);
          addIssue('power_supply_fail', `${cabinetName}: Power Supply ${psIndex + 1} (${ps.voltage_type}) voltage out of spec`);
        }
        // DC voltage range
        if (ps.dc_reading !== undefined && ps.dc_reading !== '') {
          const voltageCheck = checkVoltageInRange(ps.dc_reading, ps.voltage_type);
          observe('voltage_out_of_range', !voltageCheck.inRange);
          coverageCompleted++;
          coverageTotal++;
          if (!voltageCheck.inRange) {
            riskBreakdown.push(`${cabinetName}: DC voltage out of range`);
            addIssue('voltage_out_of_range', `${cabinetName}: ${voltageCheck.message}`);
          }
        }
        // AC voltage readings
        ['line_neutral', 'line_ground', 'neutral_ground'].forEach(measurement => {
          if (ps[measurement] !== undefined && ps[measurement] !== '') {
            const voltageCheck = checkVoltageInRange(ps[measurement], measurement);
            observe('ac_voltage_out_of_range', !voltageCheck.inRange);
            coverageCompleted++;
            coverageTotal++;
            if (!voltageCheck.inRange) {
              riskBreakdown.push(`${cabinetName}: ${measurement.replace(/_/g, ' ')} out of range`);
              addIssue('ac_voltage_out_of_range', `${cabinetName}: ${voltageCheck.message}`);
            }
          }
        });
      });
    }

    // Distribution blocks
    if (cabinet.distribution_blocks) {
      cabinet.distribution_blocks.forEach((db, dbIndex) => {
        totalComponents++;
        let isFail = db.status === 'fail';
        if (!isFail && db.dc_reading !== undefined && db.dc_reading !== '') {
          const check = checkVoltageInRange(db.dc_reading, db.voltage_type || '24VDC');
          isFail = !check.inRange;
        }
        observe('distribution_block_fail', isFail);
        coverageCompleted++;
        coverageTotal++;
        if (isFail) {
          failedComponents++;
          riskBreakdown.push(`${cabinetName}: Distribution Block ${dbIndex + 1} voltage out of spec`);
          addIssue('distribution_block_fail', `${cabinetName}: Distribution Block ${dbIndex + 1} voltage out of spec`);
        }
      });
    }

    // Diodes
    if (cabinet.diodes) {
      cabinet.diodes.forEach((diode, diodeIndex) => {
        totalComponents++;
        let isFail = diode.status === 'fail';
        if (!isFail && diode.dc_reading !== undefined && diode.dc_reading !== '') {
          const check = checkVoltageInRange(diode.dc_reading, diode.voltage_type || '24VDC');
          isFail = !check.inRange;
        }
        observe('diode_fail', isFail);
        coverageCompleted++;
        coverageTotal++;
        if (isFail) {
          failedComponents++;
          riskBreakdown.push(`${cabinetName}: Diode ${diodeIndex + 1} voltage out of spec`);
          addIssue('diode_fail', `${cabinetName}: Diode ${diodeIndex + 1} voltage out of spec`);
        }
      });
    }

    // Media converters
    if (cabinet.media_converters) {
      cabinet.media_converters.forEach((mc, mcIndex) => {
        totalComponents++;
        let isFail = mc.status === 'fail';
        if (!isFail && mc.dc_reading !== undefined && mc.dc_reading !== '') {
          const check = checkVoltageInRange(mc.dc_reading, mc.voltage_type || '24VDC');
          isFail = !check.inRange;
        }
        observe('media_converter_fail', isFail);
        coverageCompleted++;
        coverageTotal++;
        if (isFail) {
          failedComponents++;
          riskBreakdown.push(`${cabinetName}: Media Converter ${mc.mc_name || mcIndex + 1} voltage out of spec`);
          addIssue('media_converter_fail', `${cabinetName}: Media Converter ${mc.mc_name || mcIndex + 1} voltage out of spec`);
        }
      });
    }

    // Power injected baseplates
    if (cabinet.power_injected_baseplates) {
      cabinet.power_injected_baseplates.forEach((pib, pibIndex) => {
        totalComponents++;
        let isFail = pib.status === 'fail';
        if (!isFail && pib.dc_reading !== undefined && pib.dc_reading !== '') {
          const check = checkVoltageInRange(pib.dc_reading, pib.voltage_type || '24VDC');
          isFail = !check.inRange;
        }
        observe('pib_fail', isFail);
        coverageCompleted++;
        coverageTotal++;
        if (isFail) {
          failedComponents++;
          riskBreakdown.push(`${cabinetName}: PI Baseplate ${pib.pib_name || pibIndex + 1} voltage out of spec`);
          addIssue('pib_fail', `${cabinetName}: PI Baseplate ${pib.pib_name || pibIndex + 1} voltage out of spec`);
        }
      });
    }

    // Network equipment (Entron vs other treated as separate check types)
    if (cabinet.network_equipment) {
      cabinet.network_equipment.forEach((ne, neIndex) => {
        totalComponents++;
        const isEntron   = ne.model_number && ne.model_number.toLowerCase().includes('entron');
        const checkKey   = isEntron ? 'network_equipment_entron' : 'network_equipment_other';
        const isFail     = ne.status === 'fail';
        observe(checkKey, isFail);
        coverageCompleted++;
        coverageTotal++;
        if (isFail) {
          failedComponents++;
          riskBreakdown.push(`${cabinetName}: ${ne.equipment_type} ${ne.model_number || ''} failed`);
          addIssue(checkKey, isEntron
            ? `${cabinetName}: Entron switch (${ne.model_number || ''}) failed - Critical network infrastructure failure`
            : `${cabinetName}: ${ne.equipment_type} ${ne.model_number || ''} failed`
          );
        }
      });
    }
  });

  // ── Compute tier accumulators and domain accumulators ──────────────────────
  //
  // Site score uses a tier-blended model so controller/network faults always
  // have guaranteed impact regardless of how many other observations exist:
  //
  //   CRITICAL tier (controllers, network critical checks) → 70 pts max
  //   MODERATE tier (power, node maintenance, fans, ground) → 20 pts max
  //   SLIGHT tier   (temps, cleanliness, filter, AC voltage) → 10 pts max
  //
  // Within each tier: weighted failure rate × 2, capped at tier allocation.
  // (×2 scale means 50% failure rate within a tier = full tier allocation.)
  //
  // Domain scores use the same formula (weighted failure rate × 2, capped 0-100)
  // applied independently within each domain.

  const tierAccum = { CRITICAL: { contribution: 0, applicableWeight: 0 },
                      MODERATE: { contribution: 0, applicableWeight: 0 },
                      SLIGHT:   { contribution: 0, applicableWeight: 0 } };
  const domainAccum = {};
  DOMAINS.forEach(d => { domainAccum[d] = { contribution: 0, applicableWeight: 0 }; });

  Object.entries(RISK_CHECKS).forEach(([key, check]) => {
    const t = tally[key];
    if (t.applicable === 0) return; // not inspected — skip

    const rate         = t.bad / t.applicable;
    const contribution = check.weight * rate;

    // Tier accumulation (SUPER_CRITICAL maps to CRITICAL bucket)
    const tierKey = (check.level === 'SUPER_CRITICAL') ? 'CRITICAL' : check.level;
    const ta = tierAccum[tierKey];
    if (ta) {
      ta.contribution     += contribution;
      ta.applicableWeight += check.weight;
    }

    // Domain accumulation
    const da = domainAccum[check.domain];
    if (da) {
      da.contribution     += contribution;
      da.applicableWeight += check.weight;
    }
  });

  // Tier score: weighted failure rate (0-1) × 2, capped at 1, × tier allocation (pts)
  function computeTierContribution(tierKey) {
    const ta = tierAccum[tierKey];
    if (ta.applicableWeight === 0) return 0;
    const rate = ta.contribution / ta.applicableWeight; // 0–1 weighted avg failure rate
    return TIER_ALLOCATIONS[tierKey] * Math.min(1, rate * 2);
  }

  const riskScore = Math.round(
    computeTierContribution('CRITICAL') +
    computeTierContribution('MODERATE') +
    computeTierContribution('SLIGHT')
  );

  // Domain scores: independent 0-100, weighted failure rate × 2, capped at 100
  const domainScores = {};
  DOMAINS.forEach(domain => {
    const da = domainAccum[domain];
    if (da.applicableWeight === 0) {
      domainScores[domain] = null; // domain not inspected
    } else {
      const rate = da.contribution / da.applicableWeight;
      domainScores[domain] = Math.min(100, Math.round(rate * 200));
    }
  });

  // ── Badge (severity-driven, independent of score) ─────────────────────────
  let riskLevel = 'GOOD';
  let riskColor = '#28a745';
  const recommendations = [];

  const hasCriticalIssues = criticalIssues.length > 0;
  const hasModerateIssues = moderateIssues.length > 0;
  const hasSlightIssues   = slightIssues.length > 0;

  if (hasCriticalIssues) {
    riskLevel = 'CRITICAL';
    riskColor = '#dc3545';
    recommendations.push('Critical issues identified - Schedule priority maintenance');
    recommendations.push('Address critical items within 1-2 weeks');
    recommendations.push('Monitor affected systems closely until resolved');
  } else if (hasModerateIssues) {
    riskLevel = 'MODERATE';
    riskColor = '#fd7e14';
    recommendations.push('Moderate issues identified - Schedule maintenance');
    recommendations.push('Address issues within 30-60 days');
    recommendations.push('Continue normal system monitoring');
  } else if (hasSlightIssues) {
    riskLevel = 'LOW';
    riskColor = '#ffc107';
    recommendations.push('Minor issues identified - Include in next maintenance cycle');
    recommendations.push('Continue regular maintenance schedule');
    recommendations.push('Monitor for any developing issues');
  } else {
    recommendations.push('System is operating within acceptable parameters');
    recommendations.push('Continue regular maintenance schedule');
    recommendations.push('Monitor for any developing issues');
  }

  return {
    riskScore,       // 0-100 normalized weighted failure rate
    riskLevel,       // CRITICAL / MODERATE / LOW / GOOD
    riskColor,
    criticalIssues,
    warnings: moderateIssues,
    slightIssues,
    recommendations,
    totalComponents,
    failedComponents,
    riskBreakdown,
    domainScores,       // { power, network, environmental, cabinet_condition, node_maintenance } — null if not inspected
    coverageCompleted,  // actual check-points recorded
    coverageTotal       // expected check-points (cabinet inspection coverage gap is visible here)
  };
}

module.exports = {
  generateRiskAssessment,
  checkVoltageInRange,
  getInspectionDescription,
  VOLTAGE_RANGES,
  RISK_CHECKS
};
