require("dotenv").config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const http = require('http');
const multer = require('multer');
const csv = require('csv-parser');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const { Server } = require('socket.io');
const pool = require('./db');
const passport = require('./passport');
const authRoutes = require('./authRoutes');

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5000',
  process.env.FRONTEND_URL
].filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST']
  }
});

// Security headers: X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security, etc.
// CSP and cross-origin policies disabled because this is a JSON API consumed via the Vite proxy.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false
}));

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

// Trust the first proxy hop so req.ip reflects the real client IP (Docker → host)
app.set('trust proxy', 1);

// Session is only used briefly during the OAuth handshake
app.use(
  session({
    secret: process.env.SESSION_SECRET || process.env.JWT_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 10 * 60 * 1000
    }
  })
);

app.use(passport.initialize());
app.use(passport.session());

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in the environment.');
}

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Upload hardening: 10MB cap, and reject anything that isn't a CSV
const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['text/csv', 'application/vnd.ms-excel', 'application/octet-stream'];
    const hasCsvExtension = file.originalname.toLowerCase().endsWith('.csv');
    if (allowedMimes.includes(file.mimetype) && hasCsvExtension) {
      return cb(null, true);
    }
    cb(new Error('Only .csv files are accepted.'));
  }
});

function cleanValue(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

// CSV headers vary between exports — this tries multiple possible names
function getValue(row, possibleHeaders) {
  for (const header of possibleHeaders) {
    if (row[header] !== undefined) {
      return cleanValue(row[header]);
    }
  }
  return null;
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
}

// RBAC: deny if the JWT's role does not match the required role
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: `Forbidden: requires ${role} role.` });
    }
    next();
  };
}

// Auth routes (OAuth + local login)
app.use('/auth', authRoutes);

// Frontend posts login to /api/login — reuse the same handler as /auth/login
app.post('/api/login', (req, res) => {
  req.url = '/login';
  authRoutes.handle(req, res);
});

// CSV import — replaces all rows in the target table (transactional)
async function importReprogramRows(rows) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM meter_reprograms');

    const insertQuery = `
      INSERT INTO meter_reprograms (
        meternumber, newratecode, ccrate, firmwareversion, dcw,
        model, rundate, status, reason, lastupdateddatetime
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `;

    for (const row of rows) {
      await client.query(insertQuery, [
        row.meternumber, row.newratecode, row.ccrate, row.firmwareversion,
        row.dcw, row.model, row.rundate, row.status, row.reason,
        row.lastupdateddatetime
      ]);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function importNotLoggingRows(rows) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM meter_not_logging');

    const insertQuery = `
      INSERT INTO meter_not_logging (
        cccollector, ccmeter, ccsernumber, phxmap, ccstatus,
        ccstatusgroup, ccconfiggroup, ccstatusdate, smtrreason, ameter,
        phxmeter, phxloc, phxoorder, phxforder, phxinst,
        phxpurch, phxslot, research, self_check, known,
        inv, badrng, badrng2, solar, addstatusgrp, in_mif
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26
      )
    `;

    for (const row of rows) {
      await client.query(insertQuery, [
        row.cccollector, row.ccmeter, row.ccsernumber, row.phxmap, row.ccstatus,
        row.ccstatusgroup, row.ccconfiggroup, row.ccstatusdate, row.smtrreason,
        row.ameter, row.phxmeter, row.phxloc, row.phxoorder, row.phxforder,
        row.phxinst, row.phxpurch, row.phxslot, row.research, row.self_check,
        row.known, row.inv, row.badrng, row.badrng2, row.solar,
        row.addstatusgrp, row.in_mif
      ]);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'system-health-hub-api' });
});

app.post('/api/upload', authenticateToken, requireRole('admin'), upload.single('file'), async (req, res) => {
  const uploadType = req.body.uploadType;

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  if (!uploadType) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'No upload type selected' });
  }

  const rows = [];

  fs.createReadStream(req.file.path)
    .pipe(
      csv({
        mapHeaders: ({ header }) => header.trim().replace(/^\uFEFF/, '')
      })
    )
    .on('data', (row) => {
      try {
        if (uploadType === 'reprograms') {
          const cleanedRow = {
            meternumber: getValue(row, ['MeterNumber', 'meternumber']),
            newratecode: getValue(row, ['NewRateCode', 'newratecode']),
            ccrate: getValue(row, ['CCRate', 'ccrate']),
            firmwareversion: getValue(row, ['FirmWareVersion', 'FirmwareVersion', 'firmwareversion']),
            dcw: getValue(row, ['DCW', 'dcw']),
            model: getValue(row, ['Model', 'model']),
            rundate: getValue(row, ['RunDate', 'rundate']),
            status: getValue(row, ['Status', 'status']),
            reason: getValue(row, ['Reason', 'reason']),
            lastupdateddatetime: getValue(row, ['LastUpdatedDateTime', 'lastupdateddatetime'])
          };

          if (!cleanedRow.meternumber && !cleanedRow.status) return;
          rows.push(cleanedRow);
        }

        if (uploadType === 'not_logging') {
          const cleanedRow = {
            cccollector: getValue(row, ['CCCollector', 'cccollector', 'Collector']),
            ccmeter: getValue(row, ['CCMeter', 'ccmeter']),
            ccsernumber: getValue(row, ['CCSerNumber', 'ccsernumber', 'CCSerialNumber', 'SerialNumber']),
            phxmap: getValue(row, ['PHXMap', 'phxmap']),
            ccstatus: getValue(row, ['CCStatus', 'ccstatus']),
            ccstatusgroup: getValue(row, ['CCStatusGroup', 'ccstatusgroup']),
            ccconfiggroup: getValue(row, ['CCConfigGroup', 'ccconfiggroup']),
            ccstatusdate: getValue(row, ['CCStatusDate', 'ccstatusdate']),
            smtrreason: getValue(row, ['SMTRReason', 'smtrreason']),
            ameter: getValue(row, ['AMeter', 'ameter']),
            phxmeter: getValue(row, ['PHXMeter', 'phxmeter']),
            phxloc: getValue(row, ['PHXLoc', 'phxloc', 'Location']),
            phxoorder: getValue(row, ['PHXOOrder', 'phxoorder']),
            phxforder: getValue(row, ['PHXFOrder', 'phxforder']),
            phxinst: getValue(row, ['PHXInst', 'phxinst']),
            phxpurch: getValue(row, ['PHXPurch', 'phxpurch']),
            phxslot: getValue(row, ['PHXSlot', 'phxslot']),
            research: getValue(row, ['Research', 'research']),
            self_check: getValue(row, ['Self Check', 'Self_Check', 'self_check']),
            known: getValue(row, ['Known', 'known']),
            inv: getValue(row, ['Inv', 'INV', 'inv']),
            badrng: getValue(row, ['BadRng', 'badrng']),
            badrng2: getValue(row, ['BadRng2', 'badrng2']),
            solar: getValue(row, ['Solar', 'solar']),
            addstatusgrp: getValue(row, ['AddStatusGrp', 'addstatusgrp', 'AdditionalStatusGroup']),
            in_mif: getValue(row, ['In MIF', 'In_MIF', 'in_mif'])
          };

          const hasCoreData =
            cleanedRow.cccollector || cleanedRow.ccmeter ||
            cleanedRow.ccsernumber || cleanedRow.phxloc;

          if (!hasCoreData) return;
          rows.push(cleanedRow);
        }
      } catch (error) {
        console.error('Row processing error:', error);
      }
    })
    .on('end', async () => {
      try {
        if (!rows.length) {
          fs.unlink(req.file.path, () => {});
          return res.status(400).json({ error: 'No valid rows found in CSV' });
        }

        if (uploadType === 'reprograms') {
          await importReprogramRows(rows);
        } else if (uploadType === 'not_logging') {
          await importNotLoggingRows(rows);
        } else {
          fs.unlink(req.file.path, () => {});
          return res.status(400).json({ error: 'Invalid upload type' });
        }

        fs.unlink(req.file.path, () => {});

        // Notify all connected dashboards
        io.emit('dataUpdated', {
          uploadType,
          rowsImported: rows.length,
          timestamp: new Date().toISOString(),
          message: `Upload successful. ${rows.length} rows imported into ${uploadType}.`
        });

        res.json({
          message: `Upload successful. ${rows.length} rows imported into ${uploadType}.`
        });
      } catch (error) {
        fs.unlink(req.file.path, () => {});
        console.error('Upload import failed:', error);
        res.status(500).json({ error: 'Upload import failed' });
      }
    })
    .on('error', (error) => {
      fs.unlink(req.file.path, () => {});
      console.error('CSV read error:', error);
      res.status(500).json({ error: 'Failed to read CSV file' });
    });
});

app.get('/api/meters-not-logging', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM meter_not_logging ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

app.get('/api/reprograms', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM meter_reprograms ORDER BY id DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching reprograms:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/reprograms-summary', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE meternumber IS NOT NULL AND TRIM(meternumber) <> ''
        ) AS total_reprograms,
        COUNT(*) FILTER (
          WHERE meternumber IS NOT NULL AND TRIM(meternumber) <> ''
            AND status IS NOT NULL
            AND TRIM(status) NOT IN ('Completed', 'Same Rate')
        ) AS active_reprograms
      FROM meter_reprograms;
    `);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching reprogram summary:', error);
    res.status(500).json({ error: 'Failed to fetch reprogram summary' });
  }
});

app.get('/api/meters-not-logging-summary', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE (ccmeter IS NOT NULL AND TRIM(ccmeter) <> '')
            AND (research = 'YES' OR self_check = 'YES' OR known = 'YES' OR
                 inv = 'YES' OR badrng = 'YES' OR badrng2 = 'YES' OR
                 solar = 'YES' OR addstatusgrp = 'YES' OR in_mif = 'YES')
        ) AS total_not_logging,
        COUNT(*) FILTER (WHERE (ccmeter IS NOT NULL AND TRIM(ccmeter) <> '') AND research = 'YES') AS research,
        COUNT(*) FILTER (WHERE (ccmeter IS NOT NULL AND TRIM(ccmeter) <> '') AND self_check = 'YES') AS self_check,
        COUNT(*) FILTER (WHERE (ccmeter IS NOT NULL AND TRIM(ccmeter) <> '') AND known = 'YES') AS known,
        COUNT(*) FILTER (WHERE (ccmeter IS NOT NULL AND TRIM(ccmeter) <> '') AND inv = 'YES') AS inv,
        COUNT(*) FILTER (WHERE (ccmeter IS NOT NULL AND TRIM(ccmeter) <> '') AND badrng = 'YES') AS badrng,
        COUNT(*) FILTER (WHERE (ccmeter IS NOT NULL AND TRIM(ccmeter) <> '') AND badrng2 = 'YES') AS badrng2,
        COUNT(*) FILTER (WHERE (ccmeter IS NOT NULL AND TRIM(ccmeter) <> '') AND solar = 'YES') AS solar,
        COUNT(*) FILTER (WHERE (ccmeter IS NOT NULL AND TRIM(ccmeter) <> '') AND addstatusgrp = 'YES') AS addstatusgrp,
        COUNT(*) FILTER (WHERE (ccmeter IS NOT NULL AND TRIM(ccmeter) <> '') AND in_mif = 'YES') AS in_mif
      FROM meter_not_logging;
    `);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// Error handler for upload rejections (file too large, wrong type) — returns 400 instead of 500
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload rejected: ${err.message}` });
  }
  if (err && typeof err.message === 'string' && err.message.includes('.csv')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

// Redis subscriber — bridges simulator events to Socket.IO so dashboards update in real time
const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';

async function startRedisSubscriber() {
  try {
    const { createClient } = require('redis');
    const subscriber = createClient({ url: REDIS_URL });

    subscriber.on('error', (err) => {
      console.error('Redis subscriber error:', err.message);
    });

    await subscriber.connect();
    console.log('✓ Redis subscriber connected');

    await subscriber.subscribe('meter-events', (message) => {
      try {
        const payload = JSON.parse(message);

        // Emit separate events per type so each dashboard page can filter
        if (payload.notLoggingAdded > 0) {
          io.emit('dataUpdated', {
            uploadType: 'not_logging',
            rowsImported: payload.notLoggingAdded,
            timestamp: payload.timestamp,
            message: payload.message
          });
        }

        if (payload.reprogramsAdded > 0) {
          io.emit('dataUpdated', {
            uploadType: 'reprograms',
            rowsImported: payload.reprogramsAdded,
            timestamp: payload.timestamp,
            message: payload.message
          });
        }
      } catch (err) {
        console.error('Failed to parse Redis message:', err.message);
      }
    });
  } catch (err) {
    console.error('⚠ Redis subscriber failed to connect:', err.message);
    console.log('  Real-time simulator updates will not be available.');
    console.log('  Manual CSV uploads will still broadcast via Socket.IO.');
  }
}

// Ensure audit table exists on already-provisioned databases (schema.sql only runs on first boot)
async function ensureLoginAttemptsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS login_attempts (
        id SERIAL PRIMARY KEY,
        username TEXT,
        ip_address TEXT,
        user_agent TEXT,
        success BOOLEAN NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_login_attempts_created_at ON login_attempts(created_at DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address)');
  } catch (err) {
    console.error('Failed to ensure login_attempts table:', err.message);
  }
}

ensureLoginAttemptsTable();
startRedisSubscriber();

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});