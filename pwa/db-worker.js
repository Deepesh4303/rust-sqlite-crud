// SQLite WASM + OPFS Database Web Worker
// Uses official @sqlite.org/sqlite-wasm with opfs or fallback to in-memory/kvvfs/opfs-sahpool

let db = null;
let sqlite3 = null;

const SQLITE_WASM_JS = "https://cdn.jsdelivr.net/npm/@sqlite.org/sqlite-wasm@3.46.1-build1/sqlite-wasm/jswasm/sqlite3.js";

async function initSqlite() {
  try {
    importScripts(SQLITE_WASM_JS);
  } catch (err) {
    throw new Error("Failed to load sqlite-wasm from CDN: " + err.message);
  }

  sqlite3 = await self.sqlite3InitModule({
    print: console.log,
    printErr: console.error,
  });

  // Try OPFS (Origin Private File System) persistence first
  if ('opfs' in sqlite3) {
    try {
      db = new sqlite3.oo1.OpfsDb('/clinic.db');
      console.log("[Worker] Opened persistent OPFS database: /clinic.db");
    } catch (e) {
      console.warn("[Worker] OPFS direct open failed, trying standard DB:", e);
    }
  }

  // Fallback to standard DB if OPFS unavailable or restricted
  if (!db) {
    db = new sqlite3.oo1.DB('/clinic.db', 'ct');
    console.log("[Worker] Opened standard sqlite database");
  }

  // Create tables and indexes
  db.exec(`
    CREATE TABLE IF NOT EXISTS prescriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_name TEXT NOT NULL,
      age TEXT,
      gender TEXT,
      phone TEXT,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      symptoms TEXT,
      prescription TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_name);
    CREATE INDEX IF NOT EXISTS idx_prescriptions_date ON prescriptions(date);
  `);
}

function handleGetAll(limit = 250, search = '', date = '') {
  let sql = `SELECT id, patient_name, age, gender, phone, date, time, symptoms, prescription, created_at FROM prescriptions`;
  const conditions = [];
  const binds = [];

  if (search && search.trim()) {
    conditions.push(`LOWER(patient_name) LIKE ?`);
    binds.push(`%${search.trim().toLowerCase()}%`);
  }
  if (date && date.trim()) {
    conditions.push(`date = ?`);
    binds.push(date.trim());
  }

  if (conditions.length > 0) {
    sql += ` WHERE ` + conditions.join(' AND ');
  }
  sql += ` ORDER BY date DESC, time DESC, id DESC LIMIT ?`;
  binds.push(limit);

  const rows = [];
  db.exec({
    sql,
    bind: binds,
    rowMode: 'object',
    callback: (row) => rows.push(row),
  });
  return rows;
}

function handleGetHistory(patientName) {
  const rows = [];
  db.exec({
    sql: `SELECT id, patient_name, age, gender, phone, date, time, symptoms, prescription, created_at 
          FROM prescriptions 
          WHERE LOWER(patient_name) = LOWER(?) 
          ORDER BY date DESC, time DESC, id DESC`,
    bind: [patientName.trim()],
    rowMode: 'object',
    callback: (row) => rows.push(row),
  });
  return rows;
}

function handleGetNames() {
  const names = [];
  db.exec({
    sql: `SELECT DISTINCT patient_name FROM prescriptions ORDER BY patient_name ASC`,
    callback: (row) => names.push(row[0]),
  });
  return names;
}

function handleInsert(payload) {
  const now = new Date();
  const dateStr = payload.date || now.toISOString().split('T')[0];
  const timeStr = payload.time || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const createdAt = `${dateStr} ${timeStr}`;

  db.exec({
    sql: `INSERT INTO prescriptions (patient_name, age, gender, phone, date, time, symptoms, prescription, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    bind: [
      payload.patient_name.trim(),
      payload.age ? payload.age.trim() : null,
      payload.gender ? payload.gender.trim() : null,
      payload.phone ? payload.phone.trim() : null,
      dateStr,
      timeStr,
      payload.symptoms ? payload.symptoms.trim() : null,
      payload.prescription.trim(),
      createdAt,
    ],
  });

  const lastId = db.selectValue("SELECT last_insert_rowid()");
  return {
    id: lastId,
    patient_name: payload.patient_name.trim(),
    age: payload.age || null,
    gender: payload.gender || null,
    phone: payload.phone || null,
    date: dateStr,
    time: timeStr,
    symptoms: payload.symptoms || null,
    prescription: payload.prescription.trim(),
    created_at: createdAt,
  };
}

function handleDelete(id) {
  db.exec({
    sql: `DELETE FROM prescriptions WHERE id = ?`,
    bind: [id],
  });
  return true;
}

function handleExport() {
  const rows = [];
  db.exec({
    sql: `SELECT id, patient_name, age, gender, phone, date, time, symptoms, prescription, created_at FROM prescriptions ORDER BY date DESC, time DESC, id DESC`,
    rowMode: 'object',
    callback: (row) => rows.push(row),
  });
  return rows;
}

function handleImport(records) {
  if (!Array.isArray(records)) throw new Error("Invalid records array");
  let count = 0;
  db.exec("BEGIN TRANSACTION");
  try {
    for (const r of records) {
      if (!r.patient_name || !r.prescription) continue;
      db.exec({
        sql: `INSERT INTO prescriptions (patient_name, age, gender, phone, date, time, symptoms, prescription, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        bind: [
          r.patient_name,
          r.age || null,
          r.gender || null,
          r.phone || null,
          r.date || new Date().toISOString().split('T')[0],
          r.time || '12:00',
          r.symptoms || null,
          r.prescription,
          r.created_at || new Date().toISOString(),
        ],
      });
      count++;
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return count;
}

// Event Dispatcher
self.onmessage = async (e) => {
  const { id, cmd, payload } = e.data;

  try {
    if (!db && cmd !== 'init') {
      await initSqlite();
    }

    let result;
    switch (cmd) {
      case 'init':
        if (!db) await initSqlite();
        result = { ready: true, names: handleGetNames() };
        break;
      case 'getNames':
        result = handleGetNames();
        break;
      case 'getAll':
        result = handleGetAll(payload?.limit, payload?.search, payload?.date);
        break;
      case 'getHistory':
        result = handleGetHistory(payload.patientName);
        break;
      case 'insert':
        result = handleInsert(payload);
        break;
      case 'delete':
        result = handleDelete(payload.id);
        break;
      case 'export':
        result = handleExport();
        break;
      case 'import':
        result = handleImport(payload);
        break;
      default:
        throw new Error(`Unknown command: ${cmd}`);
    }

    self.postMessage({ id, success: true, result });
  } catch (err) {
    console.error("[Worker Error]", err);
    self.postMessage({ id, success: false, error: err.message });
  }
};
