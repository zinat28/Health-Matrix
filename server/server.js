const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT || 4000);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'healthpulse.db');
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS vitals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    timestamp TEXT NOT NULL,
    hr INTEGER NOT NULL,
    sys INTEGER NOT NULL,
    dia INTEGER NOT NULL,
    oxygen INTEGER NOT NULL,
    glucose INTEGER,
    steps INTEGER NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS risk_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    score INTEGER NOT NULL,
    label TEXT NOT NULL,
    summary TEXT NOT NULL,
    factors_json TEXT,
    input_json TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS symptom_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    level TEXT NOT NULL,
    score INTEGER NOT NULL,
    summary TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS medications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    dosage TEXT NOT NULL,
    time TEXT NOT NULL,
    frequency TEXT NOT NULL,
    taken_date TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    doctor TEXT NOT NULL,
    specialty TEXT,
    date TEXT NOT NULL,
    type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    age INTEGER,
    condition TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS diabetes_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    patient_id INTEGER,
    timestamp TEXT NOT NULL,
    glucose INTEGER NOT NULL,
    meal_tag TEXT NOT NULL,
    insulin_units REAL,
    notes TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS habits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date_key TEXT NOT NULL,
    values_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(user_id, date_key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

function hasTableColumn(tableName, columnName) {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return rows.some((row) => row.name === columnName);
}

if (!hasTableColumn('appointments', 'specialty')) {
  db.exec('ALTER TABLE appointments ADD COLUMN specialty TEXT;');
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const parts = String(storedHash).split(':');
  if (parts.length !== 2) return false;

  const [salt, hash] = parts;
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  const hashBuffer = Buffer.from(hash, 'hex');
  const candidateBuffer = Buffer.from(candidate, 'hex');
  if (hashBuffer.length !== candidateBuffer.length) return false;
  return crypto.timingSafeEqual(hashBuffer, candidateBuffer);
}

function sanitizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function toInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(parsed);
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function parseBearerToken(req) {
  const authHeader = String(req.headers.authorization || '');
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  return token || null;
}

function pruneExpiredSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();

  db.prepare(
    'INSERT INTO sessions (user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).run(userId, token, expiresAt, now.toISOString());

  return { token, expiresAt };
}

function getAuthUser(req) {
  pruneExpiredSessions();
  const token = parseBearerToken(req);
  if (!token) {
    throw new ApiError(401, 'Authentication required.');
  }

  const row = db
    .prepare(
      `SELECT u.id, u.name, u.email
       FROM sessions s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`
    )
    .get(token);

  if (!row) {
    throw new ApiError(401, 'Session is invalid or expired.');
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    token
  };
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (_err) {
    return fallback;
  }
}

function validateDateKey(dateKey) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateKey);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';

    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new ApiError(413, 'Payload too large.'));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (_err) {
        reject(new ApiError(400, 'Request body must be valid JSON.'));
      }
    });

    req.on('error', (error) => reject(error));
  });
}

async function handleApiRoute(req, res, pathname) {
  if (pathname === '/api/health' && req.method === 'GET') {
    sendJson(res, 200, {
      ok: true,
      message: 'API is running',
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (pathname === '/api/auth/register' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const name = String(body.name || '').trim();
    const email = sanitizeEmail(body.email);
    const password = String(body.password || '');

    if (!name) {
      throw new ApiError(400, 'Name is required.');
    }
    if (!email || !email.includes('@')) {
      throw new ApiError(400, 'A valid email is required.');
    }
    if (password.length < 6) {
      throw new ApiError(400, 'Password must be at least 6 characters.');
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      throw new ApiError(409, 'An account with this email already exists.');
    }

    const now = new Date().toISOString();
    const insert = db
      .prepare('INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(name, email, hashPassword(password), now);

    const session = createSession(insert.lastInsertRowid);

    sendJson(res, 201, {
      token: session.token,
      user: {
        id: Number(insert.lastInsertRowid),
        name,
        email
      }
    });
    return;
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const email = sanitizeEmail(body.email);
    const password = String(body.password || '');

    if (!email || !password) {
      throw new ApiError(400, 'Email and password are required.');
    }

    const user = db
      .prepare('SELECT id, name, email, password_hash FROM users WHERE email = ?')
      .get(email);

    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new ApiError(401, 'Invalid email or password.');
    }

    const session = createSession(user.id);
    sendJson(res, 200, {
      token: session.token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
    return;
  }

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const user = getAuthUser(req);
    sendJson(res, 200, { user: { id: user.id, name: user.name, email: user.email } });
    return;
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const token = parseBearerToken(req);
    if (token) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === '/api/vitals' && req.method === 'GET') {
    const user = getAuthUser(req);
    const vitals = db
      .prepare(
        `SELECT id, timestamp, hr, sys, dia, oxygen, glucose, steps, notes
         FROM vitals
         WHERE user_id = ?
         ORDER BY datetime(timestamp) ASC, id ASC`
      )
      .all(user.id);

    sendJson(res, 200, { vitals });
    return;
  }

  if (pathname === '/api/vitals' && req.method === 'POST') {
    const user = getAuthUser(req);
    const body = await readJsonBody(req);
    const timestamp = body.timestamp ? new Date(body.timestamp).toISOString() : new Date().toISOString();

    if (Number.isNaN(new Date(timestamp).getTime())) {
      throw new ApiError(400, 'Timestamp is invalid.');
    }

    const entry = {
      timestamp,
      hr: toInt(body.hr, 0),
      sys: toInt(body.sys, 0),
      dia: toInt(body.dia, 0),
      oxygen: toInt(body.oxygen, 0),
      glucose: body.glucose === null || body.glucose === undefined || body.glucose === '' ? null : toInt(body.glucose, 0),
      steps: toInt(body.steps, 0),
      notes: String(body.notes || '').trim()
    };

    if (!entry.hr || !entry.sys || !entry.dia || !entry.oxygen) {
      throw new ApiError(400, 'HR, BP, and oxygen values are required.');
    }

    const now = new Date().toISOString();
    const result = db
      .prepare(
        `INSERT INTO vitals
         (user_id, timestamp, hr, sys, dia, oxygen, glucose, steps, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        user.id,
        entry.timestamp,
        entry.hr,
        entry.sys,
        entry.dia,
        entry.oxygen,
        entry.glucose,
        entry.steps,
        entry.notes,
        now
      );

    db.prepare(
      `DELETE FROM vitals
       WHERE user_id = ?
       AND id NOT IN (
         SELECT id FROM vitals WHERE user_id = ? ORDER BY datetime(timestamp) DESC, id DESC LIMIT 80
       )`
    ).run(user.id, user.id);

    sendJson(res, 201, {
      entry: {
        id: Number(result.lastInsertRowid),
        ...entry
      }
    });
    return;
  }

  if (pathname === '/api/vitals' && req.method === 'DELETE') {
    const user = getAuthUser(req);
    db.prepare('DELETE FROM vitals WHERE user_id = ?').run(user.id);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === '/api/risk/latest' && req.method === 'GET') {
    const user = getAuthUser(req);
    const row = db
      .prepare(
        `SELECT id, score, label, summary, factors_json, input_json, created_at
         FROM risk_results
         WHERE user_id = ?
         ORDER BY datetime(created_at) DESC, id DESC
         LIMIT 1`
      )
      .get(user.id);

    if (!row) {
      sendJson(res, 200, { result: null });
      return;
    }

    sendJson(res, 200, {
      result: {
        id: row.id,
        score: row.score,
        label: row.label,
        summary: row.summary,
        factors: safeJsonParse(row.factors_json || '[]', []),
        inputs: safeJsonParse(row.input_json || '{}', {}),
        timestamp: row.created_at
      }
    });
    return;
  }

  if (pathname === '/api/risk' && req.method === 'POST') {
    const user = getAuthUser(req);
    const body = await readJsonBody(req);

    const score = toInt(body.score, 0);
    const label = String(body.label || '').trim();
    const summary = String(body.summary || '').trim();
    const factors = Array.isArray(body.factors) ? body.factors : [];
    const inputs = body.inputs && typeof body.inputs === 'object' ? body.inputs : {};

    if (!label || !summary) {
      throw new ApiError(400, 'Risk label and summary are required.');
    }

    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO risk_results (user_id, score, label, summary, factors_json, input_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(user.id, score, label, summary, JSON.stringify(factors), JSON.stringify(inputs), now);

    db.prepare(
      `DELETE FROM risk_results
       WHERE user_id = ?
       AND id NOT IN (
         SELECT id FROM risk_results WHERE user_id = ? ORDER BY datetime(created_at) DESC, id DESC LIMIT 30
       )`
    ).run(user.id, user.id);

    sendJson(res, 201, { ok: true, timestamp: now });
    return;
  }

  if (pathname === '/api/symptoms' && req.method === 'GET') {
    const user = getAuthUser(req);
    const logs = db
      .prepare(
        `SELECT id, level, score, summary, created_at
         FROM symptom_logs
         WHERE user_id = ?
         ORDER BY datetime(created_at) ASC, id ASC`
      )
      .all(user.id)
      .map((row) => ({
        id: row.id,
        level: row.level,
        score: row.score,
        summary: row.summary,
        timestamp: row.created_at
      }));

    sendJson(res, 200, { logs });
    return;
  }

  if (pathname === '/api/symptoms' && req.method === 'POST') {
    const user = getAuthUser(req);
    const body = await readJsonBody(req);
    const level = String(body.level || '').trim() || 'Monitor';
    const score = toInt(body.score, 0);
    const summary = String(body.summary || '').trim() || 'No symptom detail provided';
    const timestamp = body.timestamp ? new Date(body.timestamp).toISOString() : new Date().toISOString();

    if (Number.isNaN(new Date(timestamp).getTime())) {
      throw new ApiError(400, 'Timestamp is invalid.');
    }

    db.prepare(
      'INSERT INTO symptom_logs (user_id, level, score, summary, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(user.id, level, score, summary, timestamp);

    db.prepare(
      `DELETE FROM symptom_logs
       WHERE user_id = ?
       AND id NOT IN (
         SELECT id FROM symptom_logs WHERE user_id = ? ORDER BY datetime(created_at) DESC, id DESC LIMIT 20
       )`
    ).run(user.id, user.id);

    sendJson(res, 201, { ok: true });
    return;
  }

  if (pathname === '/api/symptoms' && req.method === 'DELETE') {
    const user = getAuthUser(req);
    db.prepare('DELETE FROM symptom_logs WHERE user_id = ?').run(user.id);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === '/api/care/medications' && req.method === 'GET') {
    const user = getAuthUser(req);
    const medications = db
      .prepare(
        `SELECT id, name, dosage, time, frequency, taken_date
         FROM medications
         WHERE user_id = ?
         ORDER BY datetime(created_at) ASC, id ASC`
      )
      .all(user.id)
      .map((row) => ({
        id: String(row.id),
        name: row.name,
        dosage: row.dosage,
        time: row.time,
        frequency: row.frequency,
        takenDate: row.taken_date
      }));

    sendJson(res, 200, { medications });
    return;
  }

  if (pathname === '/api/care/medications' && req.method === 'POST') {
    const user = getAuthUser(req);
    const body = await readJsonBody(req);

    const name = String(body.name || '').trim();
    const dosage = String(body.dosage || '').trim();
    const time = String(body.time || '').trim();
    const frequency = String(body.frequency || '').trim() || 'Daily';

    if (!name || !dosage || !time) {
      throw new ApiError(400, 'Medication name, dosage, and time are required.');
    }

    const now = new Date().toISOString();
    const result = db
      .prepare(
        `INSERT INTO medications (user_id, name, dosage, time, frequency, taken_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(user.id, name, dosage, time, frequency, null, now);

    sendJson(res, 201, {
      medication: {
        id: String(result.lastInsertRowid),
        name,
        dosage,
        time,
        frequency,
        takenDate: null
      }
    });
    return;
  }

  const medicationToggleMatch = pathname.match(/^\/api\/care\/medications\/(\d+)\/toggle$/);
  if (medicationToggleMatch && req.method === 'PATCH') {
    const user = getAuthUser(req);
    const medId = Number(medicationToggleMatch[1]);
    const row = db
      .prepare('SELECT id, taken_date FROM medications WHERE id = ? AND user_id = ?')
      .get(medId, user.id);

    if (!row) {
      throw new ApiError(404, 'Medication not found.');
    }

    const nextTakenDate = row.taken_date === getTodayKey() ? null : getTodayKey();
    db.prepare('UPDATE medications SET taken_date = ? WHERE id = ? AND user_id = ?').run(nextTakenDate, medId, user.id);

    sendJson(res, 200, { ok: true, takenDate: nextTakenDate });
    return;
  }

  const medicationDeleteMatch = pathname.match(/^\/api\/care\/medications\/(\d+)$/);
  if (medicationDeleteMatch && req.method === 'DELETE') {
    const user = getAuthUser(req);
    const medId = Number(medicationDeleteMatch[1]);
    db.prepare('DELETE FROM medications WHERE id = ? AND user_id = ?').run(medId, user.id);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === '/api/care/appointments' && req.method === 'GET') {
    const user = getAuthUser(req);
    const appointments = db
      .prepare(
        `SELECT id, title, doctor, specialty, date, type
         FROM appointments
         WHERE user_id = ?
         ORDER BY datetime(date) ASC, id ASC`
      )
      .all(user.id)
      .map((row) => ({
        id: String(row.id),
        title: row.title,
        doctor: row.doctor,
        specialty: row.specialty || '',
        date: row.date,
        type: row.type
      }));

    sendJson(res, 200, { appointments });
    return;
  }

  if (pathname === '/api/care/appointments' && req.method === 'POST') {
    const user = getAuthUser(req);
    const body = await readJsonBody(req);

    const title = String(body.title || '').trim();
    const doctor = String(body.doctor || '').trim();
    const specialty = String(body.specialty || '').trim();
    const type = String(body.type || '').trim() || 'In-person';
    const date = body.date ? new Date(body.date).toISOString() : '';

    if (!title || !doctor || !date || Number.isNaN(new Date(date).getTime())) {
      throw new ApiError(400, 'Appointment title, doctor, and valid date are required.');
    }

    const now = new Date().toISOString();
    const result = db
      .prepare(
        `INSERT INTO appointments (user_id, title, doctor, specialty, date, type, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(user.id, title, doctor, specialty || null, date, type, now);

    sendJson(res, 201, {
      appointment: {
        id: String(result.lastInsertRowid),
        title,
        doctor,
        specialty,
        date,
        type
      }
    });
    return;
  }

  const appointmentDeleteMatch = pathname.match(/^\/api\/care\/appointments\/(\d+)$/);
  if (appointmentDeleteMatch && req.method === 'DELETE') {
    const user = getAuthUser(req);
    const appointmentId = Number(appointmentDeleteMatch[1]);
    db.prepare('DELETE FROM appointments WHERE id = ? AND user_id = ?').run(appointmentId, user.id);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === '/api/care/patients' && req.method === 'GET') {
    const user = getAuthUser(req);
    const patients = db
      .prepare(
        `SELECT id, name, age, condition, notes
         FROM patients
         WHERE user_id = ?
         ORDER BY datetime(created_at) DESC, id DESC`
      )
      .all(user.id)
      .map((row) => ({
        id: String(row.id),
        name: row.name,
        age: row.age === null || row.age === undefined ? null : Number(row.age),
        condition: row.condition || '',
        notes: row.notes || ''
      }));

    sendJson(res, 200, { patients });
    return;
  }

  if (pathname === '/api/care/patients' && req.method === 'POST') {
    const user = getAuthUser(req);
    const body = await readJsonBody(req);

    const name = String(body.name || '').trim();
    const ageRaw = body.age;
    const age = ageRaw === '' || ageRaw === null || ageRaw === undefined ? null : toInt(ageRaw, null);
    const condition = String(body.condition || '').trim();
    const notes = String(body.notes || '').trim();

    if (!name) {
      throw new ApiError(400, 'Patient name is required.');
    }

    if (age !== null && (age < 0 || age > 130)) {
      throw new ApiError(400, 'Patient age must be between 0 and 130.');
    }

    const now = new Date().toISOString();
    const result = db
      .prepare(
        `INSERT INTO patients (user_id, name, age, condition, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(user.id, name, age, condition, notes, now);

    sendJson(res, 201, {
      patient: {
        id: String(result.lastInsertRowid),
        name,
        age,
        condition,
        notes
      }
    });
    return;
  }

  const patientDeleteMatch = pathname.match(/^\/api\/care\/patients\/(\d+)$/);
  if (patientDeleteMatch && req.method === 'DELETE') {
    const user = getAuthUser(req);
    const patientId = Number(patientDeleteMatch[1]);

    db.prepare('UPDATE diabetes_logs SET patient_id = NULL WHERE patient_id = ? AND user_id = ?').run(patientId, user.id);
    db.prepare('DELETE FROM patients WHERE id = ? AND user_id = ?').run(patientId, user.id);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === '/api/care/diabetes' && req.method === 'GET') {
    const user = getAuthUser(req);
    const logs = db
      .prepare(
        `SELECT d.id, d.patient_id, d.timestamp, d.glucose, d.meal_tag, d.insulin_units, d.notes, p.name AS patient_name
         FROM diabetes_logs d
         LEFT JOIN patients p ON p.id = d.patient_id AND p.user_id = d.user_id
         WHERE d.user_id = ?
         ORDER BY datetime(d.timestamp) DESC, d.id DESC
         LIMIT 200`
      )
      .all(user.id)
      .map((row) => ({
        id: String(row.id),
        patientId: row.patient_id === null || row.patient_id === undefined ? null : String(row.patient_id),
        patientName: row.patient_name || '',
        timestamp: row.timestamp,
        glucose: Number(row.glucose),
        mealTag: row.meal_tag,
        insulinUnits: row.insulin_units === null || row.insulin_units === undefined ? null : Number(row.insulin_units),
        notes: row.notes || ''
      }));

    sendJson(res, 200, { logs });
    return;
  }

  if (pathname === '/api/care/diabetes' && req.method === 'POST') {
    const user = getAuthUser(req);
    const body = await readJsonBody(req);

    const timestamp = body.timestamp ? new Date(body.timestamp).toISOString() : new Date().toISOString();
    const glucose = toInt(body.glucose, 0);
    const mealTag = String(body.mealTag || '').trim() || 'Fasting';
    const insulinRaw = body.insulinUnits;
    const insulinUnits = insulinRaw === '' || insulinRaw === null || insulinRaw === undefined ? null : Number(insulinRaw);
    const notes = String(body.notes || '').trim();
    const patientIdRaw = body.patientId;
    const patientId = patientIdRaw === '' || patientIdRaw === null || patientIdRaw === undefined ? null : Number(patientIdRaw);

    if (Number.isNaN(new Date(timestamp).getTime())) {
      throw new ApiError(400, 'Timestamp is invalid.');
    }
    if (!glucose || glucose < 30 || glucose > 700) {
      throw new ApiError(400, 'Glucose must be between 30 and 700 mg/dL.');
    }
    if (insulinUnits !== null && (!Number.isFinite(insulinUnits) || insulinUnits < 0 || insulinUnits > 200)) {
      throw new ApiError(400, 'Insulin units must be between 0 and 200.');
    }

    if (patientId !== null) {
      const patient = db.prepare('SELECT id FROM patients WHERE id = ? AND user_id = ?').get(patientId, user.id);
      if (!patient) {
        throw new ApiError(400, 'Selected patient does not exist.');
      }
    }

    const now = new Date().toISOString();
    const result = db
      .prepare(
        `INSERT INTO diabetes_logs (user_id, patient_id, timestamp, glucose, meal_tag, insulin_units, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(user.id, patientId, timestamp, glucose, mealTag, insulinUnits, notes, now);

    sendJson(res, 201, {
      log: {
        id: String(result.lastInsertRowid),
        patientId: patientId === null ? null : String(patientId),
        timestamp,
        glucose,
        mealTag,
        insulinUnits,
        notes
      }
    });
    return;
  }

  const diabetesDeleteMatch = pathname.match(/^\/api\/care\/diabetes\/(\d+)$/);
  if (diabetesDeleteMatch && req.method === 'DELETE') {
    const user = getAuthUser(req);
    const logId = Number(diabetesDeleteMatch[1]);
    db.prepare('DELETE FROM diabetes_logs WHERE id = ? AND user_id = ?').run(logId, user.id);
    sendJson(res, 200, { ok: true });
    return;
  }

  const habitsMatch = pathname.match(/^\/api\/care\/habits\/(\d{4}-\d{2}-\d{2})$/);
  if (habitsMatch && req.method === 'GET') {
    const user = getAuthUser(req);
    const dateKey = habitsMatch[1];

    if (!validateDateKey(dateKey)) {
      throw new ApiError(400, 'Habit date key is invalid.');
    }

    const row = db
      .prepare('SELECT values_json FROM habits WHERE user_id = ? AND date_key = ?')
      .get(user.id, dateKey);

    const values = row ? safeJsonParse(row.values_json, {}) : {};
    sendJson(res, 200, { dateKey, values });
    return;
  }

  if (habitsMatch && req.method === 'PUT') {
    const user = getAuthUser(req);
    const dateKey = habitsMatch[1];

    if (!validateDateKey(dateKey)) {
      throw new ApiError(400, 'Habit date key is invalid.');
    }

    const body = await readJsonBody(req);
    const values = body && typeof body.values === 'object' && body.values !== null ? body.values : {};
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO habits (user_id, date_key, values_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, date_key)
       DO UPDATE SET values_json = excluded.values_json, updated_at = excluded.updated_at`
    ).run(user.id, dateKey, JSON.stringify(values), now, now);

    sendJson(res, 200, { ok: true, dateKey, values });
    return;
  }

  throw new ApiError(404, 'API route not found.');
}

function serveStaticFile(res, pathname) {
  const requestPath = pathname === '/' ? '/index.html' : pathname;
  const decodedPath = decodeURIComponent(requestPath);
  const filePath = path.resolve(ROOT_DIR, `.${decodedPath}`);

  if (!filePath.toLowerCase().startsWith(ROOT_DIR.toLowerCase())) {
    sendJson(res, 403, { error: 'Forbidden path.' });
    return;
  }

  if (filePath.toLowerCase().includes(`${path.sep}server${path.sep}`)) {
    sendJson(res, 404, { error: 'Not found.' });
    return;
  }

  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon'
  };

  const extension = path.extname(filePath).toLowerCase();
  if (!contentTypes[extension]) {
    sendJson(res, 404, { error: 'Not found.' });
    return;
  }

  fs.readFile(filePath, (error, buffer) => {
    if (error) {
      sendJson(res, 404, { error: 'File not found.' });
      return;
    }

    res.writeHead(200, { 'Content-Type': contentTypes[extension] });
    res.end(buffer);
  });
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const baseUrl = `http://${req.headers.host || `localhost:${PORT}`}`;
  const url = new URL(req.url || '/', baseUrl);

  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApiRoute(req, res, url.pathname);
      return;
    }

    serveStaticFile(res, url.pathname);
  } catch (error) {
    if (error instanceof ApiError) {
      sendJson(res, error.status, { error: error.message });
      return;
    }

    console.error(error);
    sendJson(res, 500, { error: 'Unexpected server error.' });
  }
});

server.listen(PORT, () => {
  console.log(`HealthPulse server running on http://localhost:${PORT}`);
});
