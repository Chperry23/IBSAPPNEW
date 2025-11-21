// Voltage range specifications
const VOLTAGE_RANGES = {
  '24VDC': { min: 22.8, max: 25.2, type: 'DC' },
  '12VDC': { min: 11.4, max: 12.6, type: 'DC' },
  // AC voltage ranges
  'line_neutral': { min: 100, max: 130, type: 'AC', unit: 'V' },
  'line_ground': { min: 100, max: 130, type: 'AC', unit: 'V' },
  'neutral_ground': { min: 0, max: 1000, type: 'AC', unit: 'mV' }
};

function checkVoltageInRange(voltage, voltageType) {
  const numVoltage = parseFloat(voltage);
  if (isNaN(numVoltage)) return { inRange: true, message: '' };
  
  const range = VOLTAGE_RANGES[voltageType];
  if (!range) return { inRange: true, message: '' };
  
  const inRange = numVoltage >= range.min && numVoltage <= range.max;
  const unit = range.unit || 'V';
  const message = inRange ? '' : `${voltageType} reading ${numVoltage}${unit} is outside normal range (${range.min}-${range.max}${unit})`;
  
  return { inRange, message };
}

// Weighted risk scoring system
const RISK_WEIGHTS = {
  // Inspection items
  cabinet_fans: { weight: 8, level: 'MODERATE', description: 'affects controller efficiency and hardware lifetime' },
  controller_leds: { weight: 25, level: 'SUPER CRITICAL', description: 'indicates critical system fault' },
  io_status: { weight: 20, level: 'CRITICAL', description: 'communication failure affects process control' },
  network_status: { weight: 20, level: 'CRITICAL', description: 'network failure affects system connectivity' },
  temperatures: { weight: 4, level: 'SLIGHT', description: 'environmental conditions outside optimal range' },
  is_clean: { weight: 3, level: 'SLIGHT', description: 'cleanliness affects long-term reliability' },
  clean_filter_installed: { weight: 3, level: 'SLIGHT', description: 'filter maintenance affects air quality' },
  ground_inspection: { weight: 10, level: 'MODERATE', description: 'electrical safety concern' },
  
  // Power supply failures
  power_supply_fail: { weight: 8, level: 'MODERATE', description: 'power supply voltage out of spec' },
  voltage_out_of_range: { weight: 12, level: 'MODERATE', description: 'voltage deviation may cause instability' },
  
  // Network equipment specific
  network_equipment_entron: { weight: 20, level: 'CRITICAL', description: 'Entron switch failure is critical' },
  network_equipment_other: { weight: 8, level: 'MODERATE', description: 'network equipment failure' }
};

function getInspectionDescription(key) {
  const descriptions = {
    cabinet_fans: 'Cabinet cooling fans failed',
    controller_leds: 'Controller status LEDs indicate fault',
    io_status: 'I/O module status indicates failure',
    network_status: 'Network equipment status failed',
    temperatures: 'Environmental temperatures out of range',
    is_clean: 'Enclosure cleanliness below standard',
    clean_filter_installed: 'Clean filter not properly installed',
    ground_inspection: 'Ground connection inspection failed'
  };
  return descriptions[key] || key.replace(/_/g, ' ');
}

function generateRiskAssessment(cabinets, nodeMaintenanceData = []) {
  let riskScore = 0;
  let criticalIssues = [];
  let warnings = [];
  let moderateIssues = [];
  let slightIssues = [];
  let totalComponents = 0;
  let failedComponents = 0;
  let riskBreakdown = [];
  
  // Performance risk assessment from node maintenance data
  nodeMaintenanceData.forEach(maintenance => {
    if (maintenance.performance_value && maintenance.performance_type) {
      const nodeName = maintenance.node_name || `Node ${maintenance.node_id}`;
      
      if (maintenance.performance_type === 'perf_index' && maintenance.performance_value <= 2) {
        const weight = 15; // High risk for poor performance index
        riskScore += weight;
        riskBreakdown.push(`${nodeName}: Poor performance index (${maintenance.performance_value}/5)`);
        moderateIssues.push(`${nodeName}: Performance index ${maintenance.performance_value}/5 indicates degraded controller performance`);
       } else if (maintenance.performance_type === 'free_time' && maintenance.performance_value <= 28) {
         const weight = 12; // Moderate risk for low free time
         riskScore += weight;
         riskBreakdown.push(`${nodeName}: Low free time (${maintenance.performance_value}%)`);
        moderateIssues.push(`${nodeName}: Free time ${maintenance.performance_value}% indicates high controller utilization`);
      }
    }
  });
  
  cabinets.forEach((cabinet, cabinetIndex) => {
    const cabinetName = cabinet.cabinet_location || `Cabinet ${cabinetIndex + 1}`;
    
    // Check power supplies
    if (cabinet.power_supplies) {
      cabinet.power_supplies.forEach((ps, psIndex) => {
        totalComponents++;
        
        // Check status
        if (ps.status === 'fail') {
          failedComponents++;
          const weight = RISK_WEIGHTS.power_supply_fail.weight;
          riskScore += weight;
          riskBreakdown.push(`${cabinetName}: Power Supply ${psIndex + 1} voltage out of spec`);
          moderateIssues.push(`${cabinetName}: Power Supply ${psIndex + 1} (${ps.voltage_type}) voltage out of spec`);
        }
        
        // Check DC voltage ranges
        if (ps.dc_reading) {
          const voltageCheck = checkVoltageInRange(ps.dc_reading, ps.voltage_type);
          if (!voltageCheck.inRange) {
            const weight = RISK_WEIGHTS.voltage_out_of_range.weight;
            riskScore += weight;
            riskBreakdown.push(`${cabinetName}: DC voltage out of range`);
            moderateIssues.push(`${cabinetName}: ${voltageCheck.message}`);
          }
        }
        
        // Check AC voltage ranges (slight risk)
        ['line_neutral', 'line_ground', 'neutral_ground'].forEach(measurement => {
          if (ps[measurement] !== undefined && ps[measurement] !== '') {
            const voltageCheck = checkVoltageInRange(ps[measurement], measurement);
            if (!voltageCheck.inRange) {
              const weight = 3; // Slight risk for AC voltage issues
              riskScore += weight;
              riskBreakdown.push(`${cabinetName}: ${measurement.replace('_', ' ')} out of range`);
              slightIssues.push(`${cabinetName}: ${voltageCheck.message}`);
            }
          }
        });
      });
    }
    
    // Check distribution blocks
    if (cabinet.distribution_blocks) {
      cabinet.distribution_blocks.forEach((db, dbIndex) => {
        totalComponents++;
        if (db.status === 'fail') {
          failedComponents++;
          const weight = 8; // Moderate risk
          riskScore += weight;
          riskBreakdown.push(`${cabinetName}: Distribution Block ${dbIndex + 1} voltage out of spec`);
          moderateIssues.push(`${cabinetName}: Distribution Block ${dbIndex + 1} voltage out of spec`);
        }
      });
    }
    
    // Check diodes
    if (cabinet.diodes) {
      cabinet.diodes.forEach((diode, diodeIndex) => {
        totalComponents++;
        if (diode.status === 'fail') {
          failedComponents++;
          const weight = 6; // Moderate risk
          riskScore += weight;
          riskBreakdown.push(`${cabinetName}: Diode ${diodeIndex + 1} voltage out of spec`);
          moderateIssues.push(`${cabinetName}: Diode ${diodeIndex + 1} voltage out of spec`);
        }
      });
    }
    
    // Check network equipment with special Entron handling
    if (cabinet.network_equipment) {
      cabinet.network_equipment.forEach((ne, neIndex) => {
        totalComponents++;
        if (ne.status === 'fail') {
          failedComponents++;
          const isEntron = ne.model_number && ne.model_number.toLowerCase().includes('entron');
          const weight = isEntron ? RISK_WEIGHTS.network_equipment_entron.weight : RISK_WEIGHTS.network_equipment_other.weight;
          riskScore += weight;
          riskBreakdown.push(`${cabinetName}: ${ne.equipment_type} ${ne.model_number || ''} voltage out of spec`);
          
          if (isEntron) {
            criticalIssues.push(`${cabinetName}: Entron switch voltage out of spec - Critical network infrastructure failure`);
          } else {
            moderateIssues.push(`${cabinetName}: ${ne.equipment_type} ${ne.model_number || ''} voltage out of spec`);
          }
        }
      });
    }
    
    // Check inspection items with weighted scoring
    const inspection = cabinet.inspection || {};
    
    Object.keys(RISK_WEIGHTS).forEach(key => {
      if (key.startsWith('power_supply') || key.startsWith('network_equipment') || key === 'voltage_out_of_range') return;
      
      if (inspection[key] === 'fail') {
        totalComponents++; // Count inspection items as components
        failedComponents++;
        const riskItem = RISK_WEIGHTS[key];
        const weight = riskItem.weight;
        riskScore += weight;
        riskBreakdown.push(`${cabinetName}: ${key.replace(/_/g, ' ')} failed inspection`);
        
        const message = `${cabinetName}: ${getInspectionDescription(key)} - ${riskItem.description}`;
        
        switch (riskItem.level) {
          case 'SUPER CRITICAL':
          case 'CRITICAL':
            criticalIssues.push(message);
            break;
          case 'MODERATE':
            moderateIssues.push(message);
            break;
          case 'SLIGHT':
            slightIssues.push(message);
            break;
        }
      } else if (inspection[key] === 'pass') {
        totalComponents++; // Count passing inspection items too
      }
    });
  });
  
  // Determine risk level based on actual issue severity, not just score
  let riskLevel = 'LOW';
  let riskColor = '#28a745';
  let recommendations = [];
  
  // Check if we actually have critical issues
  const hasCriticalIssues = criticalIssues.length > 0;
  const hasModerateIssues = moderateIssues.length > 0;
  const hasSlightIssues = slightIssues.length > 0;
  
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
    riskScore,
    riskLevel,
    riskColor,
    criticalIssues,
    warnings: moderateIssues, // Rename for consistency
    slightIssues,
    recommendations,
    totalComponents,
    failedComponents,
    riskBreakdown
  };
}

module.exports = {
  generateRiskAssessment,
  checkVoltageInRange,
  getInspectionDescription,
  VOLTAGE_RANGES,
  RISK_WEIGHTS
};

