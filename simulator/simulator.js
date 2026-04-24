const { Pool } = require('pg');
const { createClient } = require('redis');

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS || '8000', 10);
const FAILURE_RATE = parseFloat(process.env.FAILURE_RATE || '0.15');
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '1', 10);

const pool = new Pool({ connectionString: DATABASE_URL });
const redis = createClient({ url: REDIS_URL });

// ── Realistic data pools ──

const COLLECTORS = [
  'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo',
  'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet'
];

const CONFIG_GROUPS = ['RES G', 'RES E', 'COM G', 'COM E', 'IND G'];

const STATUS_GROUPS = [
  'Normal', 'Known Communication Issue Area',
  'Scheduled Maintenance', 'Under Investigation'
];

const REPROGRAM_STATUSES = ['Completed', 'Same Rate', 'Refer', 'Attempt Zap/Erase'];
const REPROGRAM_REASONS = [
  'Solar', 'Configuration Mismatch', 'Pending Review',
  'Endpoint firmware is not the correct version for this configuration group.',
  'The command cannot be issued to the endpoint when endpoint is in Failed state.',
  'The endpoint for the meter is in inventory state.'
];

const MODELS = [
  'G5 Integrated FOCUS AXe', 'G5IntegratedFocusAXei',
  'RF G5 S4x', 'RF Enhanced Integrated Focus AX'
];

const FIRMWARE_VERSIONS = [
  'S5GS2D-13.61', 'S5GS2D-13.68', 'S5GS2D-13.59',
  'S5GS3B-21.63', 'S5GS24-13.61', '251284-13.59'
];

const RATE_CODES = ['R-001', 'R-002', 'C-001', 'C-002', 'I-001', 'I-002', 'R-003', 'C-003'];

// ── Helpers ──

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomMeterNumber() {
  return String(2000000 + Math.floor(Math.random() * 3000000));
}

function randomSerialNumber() {
  return String(1000000000 + Math.floor(Math.random() * 4000000000));
}

function randomLocation() {
  return String(100000000 + Math.floor(Math.random() * 900000000));
}

function todayString() {
  const d = new Date();
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function randomFlag(probability) {
  return Math.random() < probability ? 'YES' : null;
}

// ── Simulation generators ──

function generateNotLoggingMeter() {
  const meter = randomMeterNumber();
  const isFailure = Math.random() < FAILURE_RATE;

  return {
    cccollector: randomFrom(COLLECTORS),
    ccmeter: meter,
    ccsernumber: randomSerialNumber(),
    phxmap: `${String.fromCharCode(65 + Math.floor(Math.random() * 5))}${String.fromCharCode(65 + Math.floor(Math.random() * 10))}${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`,
    ccstatus: isFailure ? 'Failed' : 'Normal',
    ccstatusgroup: randomFrom(STATUS_GROUPS),
    ccconfiggroup: randomFrom(CONFIG_GROUPS),
    ccstatusdate: todayString(),
    smtrreason: null,
    ameter: meter,
    phxmeter: meter,
    phxloc: randomLocation(),
    phxoorder: Math.random() < 0.3 ? 'TNONFO' : null,
    phxforder: null,
    phxinst: todayString(),
    phxpurch: todayString(),
    phxslot: '1',
    research: randomFlag(0.6),
    self_check: randomFlag(0.05),
    known: randomFlag(0.08),
    inv: randomFlag(0.15),
    badrng: randomFlag(0.03),
    badrng2: randomFlag(0.02),
    solar: randomFlag(0.04),
    addstatusgrp: randomFlag(0.01),
    in_mif: randomFlag(0.02)
  };
}

function generateReprogram() {
  return {
    meternumber: randomMeterNumber(),
    newratecode: randomFrom(RATE_CODES),
    ccrate: randomFrom(RATE_CODES),
    firmwareversion: randomFrom(FIRMWARE_VERSIONS),
    dcw: (Math.random() * 10).toFixed(2),
    model: randomFrom(MODELS),
    rundate: todayString(),
    status: randomFrom(REPROGRAM_STATUSES),
    reason: randomFrom(REPROGRAM_REASONS),
    lastupdateddatetime: new Date().toISOString()
  };
}

// ── Database insert functions ──

async function insertNotLoggingMeter(meter) {
  const query = `
    INSERT INTO meter_not_logging (
      cccollector, ccmeter, ccsernumber, phxmap, ccstatus,
      ccstatusgroup, ccconfiggroup, ccstatusdate, smtrreason, ameter,
      phxmeter, phxloc, phxoorder, phxforder, phxinst,
      phxpurch, phxslot, research, self_check, known,
      inv, badrng, badrng2, solar, addstatusgrp, in_mif
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
      $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
      $21,$22,$23,$24,$25,$26
    )
  `;

  await pool.query(query, [
    meter.cccollector, meter.ccmeter, meter.ccsernumber, meter.phxmap, meter.ccstatus,
    meter.ccstatusgroup, meter.ccconfiggroup, meter.ccstatusdate, meter.smtrreason, meter.ameter,
    meter.phxmeter, meter.phxloc, meter.phxoorder, meter.phxforder, meter.phxinst,
    meter.phxpurch, meter.phxslot, meter.research, meter.self_check, meter.known,
    meter.inv, meter.badrng, meter.badrng2, meter.solar, meter.addstatusgrp, meter.in_mif
  ]);
}

async function insertReprogram(reprogram) {
  const query = `
    INSERT INTO meter_reprograms (
      meternumber, newratecode, ccrate, firmwareversion,
      dcw, model, rundate, status, reason, lastupdateddatetime
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
  `;

  await pool.query(query, [
    reprogram.meternumber, reprogram.newratecode, reprogram.ccrate, reprogram.firmwareversion,
    reprogram.dcw, reprogram.model, reprogram.rundate, reprogram.status, reprogram.reason,
    reprogram.lastupdateddatetime
  ]);
}

// ── Main simulation loop ──

async function simulate() {
  let nlCount = 0;
  let rpCount = 0;

  try {
    for (let i = 0; i < BATCH_SIZE; i++) {
      const eventType = Math.random() < 0.6 ? 'not_logging' : 'reprograms';

      if (eventType === 'not_logging') {
        const meter = generateNotLoggingMeter();
        await insertNotLoggingMeter(meter);
        nlCount++;
      } else {
        const reprogram = generateReprogram();
        await insertReprogram(reprogram);
        rpCount++;
      }
    }

    const parts = [];
    if (nlCount > 0) parts.push(`${nlCount} not-logging`);
    if (rpCount > 0) parts.push(`${rpCount} reprogram`);

    const payload = {
      type: 'meter_event',
      uploadType: nlCount >= rpCount ? 'not_logging' : 'reprograms',
      batchSize: BATCH_SIZE,
      notLoggingAdded: nlCount,
      reprogramsAdded: rpCount,
      timestamp: new Date().toISOString(),
      message: `Simulator added ${parts.join(' + ')} records`
    };

    await redis.publish('meter-events', JSON.stringify(payload));
    console.log(`[SIM] ${payload.message}`);
  } catch (err) {
    console.error('[SIM] Error:', err.message);
  }
}

async function start() {
  console.log('Meter Simulator starting...');
  console.log(`  Interval: ${INTERVAL_MS}ms`);
  console.log(`  Batch size: ${BATCH_SIZE} records per tick`);
  console.log(`  Failure rate: ${(FAILURE_RATE * 100).toFixed(0)}%`);
  console.log(`  Database: ${DATABASE_URL ? 'configured' : 'missing!'}`);
  console.log(`  Redis: ${REDIS_URL}`);

  try {
    await redis.connect();
    console.log('Redis connected');

    await pool.query('SELECT 1');
    console.log('Database connected');

    console.log('Simulation running. Generating meter events...\n');

    setInterval(simulate, INTERVAL_MS);
    simulate();
  } catch (err) {
    console.error('Startup failed:', err.message);
    process.exit(1);
  }
}

start();