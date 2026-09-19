// Local Persistent Database using browser-native IndexedDB (LevelDB on Android)
// 100% persistent across app closures, phone restarts, and offline use.

const DB_NAME = 'RetroClinicDB';
const DB_VERSION = 1;
const STORE_NAME = 'prescriptions';

let dbInstance = null;

export function openDatabase() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('patient_name', 'patient_name', { unique: false });
        store.createIndex('date', 'date', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject(new Error('IndexedDB open error: ' + event.target.error));
    };
  });
}

export async function insertPrescription(payload) {
  const db = await openDatabase();
  const now = new Date();
  const dateStr = payload.date || now.toISOString().split('T')[0];
  const timeStr = payload.time || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const createdAt = `${dateStr} ${timeStr}`;

  const record = {
    patient_name: payload.patient_name.trim(),
    age: payload.age ? payload.age.trim() : null,
    gender: payload.gender ? payload.gender.trim() : null,
    phone: payload.phone ? payload.phone.trim() : null,
    date: dateStr,
    time: timeStr,
    symptoms: payload.symptoms ? payload.symptoms.trim() : null,
    prescription: payload.prescription.trim(),
    created_at: createdAt,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.add(record);

    req.onsuccess = (e) => {
      record.id = e.target.result;
      resolve(record);
    };

    req.onerror = (e) => reject(e.target.error);
  });
}

export async function getPatientHistory(patientName) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    req.onsuccess = () => {
      const records = req.result || [];
      const filtered = records
        .filter(r => r.patient_name.toLowerCase() === patientName.trim().toLowerCase())
        .sort((a, b) => {
          const dtA = `${a.date} ${a.time}`;
          const dtB = `${b.date} ${b.time}`;
          return dtB.localeCompare(dtA) || (b.id - a.id);
        });
      resolve(filtered);
    };

    req.onerror = () => reject(req.error);
  });
}

export async function getAllPrescriptions(limit = 250, search = '', date = '') {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    req.onsuccess = () => {
      let records = req.result || [];

      if (search && search.trim()) {
        const s = search.trim().toLowerCase();
        records = records.filter(r => r.patient_name.toLowerCase().includes(s));
      }
      if (date && date.trim()) {
        records = records.filter(r => r.date === date.trim());
      }

      records.sort((a, b) => {
        const dtA = `${a.date} ${a.time}`;
        const dtB = `${b.date} ${b.time}`;
        return dtB.localeCompare(dtA) || (b.id - a.id);
      });

      resolve(records.slice(0, limit));
    };

    req.onerror = () => reject(req.error);
  });
}

export async function deletePrescription(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(Number(id));

    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export async function getDistinctPatientNames() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    req.onsuccess = () => {
      const records = req.result || [];
      const set = new Set();
      records.forEach(r => {
        if (r.patient_name) set.add(r.patient_name.trim());
      });
      const list = Array.from(set).sort((a, b) => a.localeCompare(b));
      resolve(list);
    };

    req.onerror = () => reject(req.error);
  });
}

export async function exportAll() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function importAll(records) {
  if (!Array.isArray(records)) throw new Error('Invalid records array');
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    let count = 0;

    for (const r of records) {
      if (!r.patient_name || !r.prescription) continue;
      store.add({
        patient_name: r.patient_name.trim(),
        age: r.age || null,
        gender: r.gender || null,
        phone: r.phone || null,
        date: r.date || new Date().toISOString().split('T')[0],
        time: r.time || '12:00',
        symptoms: r.symptoms || null,
        prescription: r.prescription,
        created_at: r.created_at || new Date().toISOString(),
      });
      count++;
    }

    tx.oncomplete = () => resolve(count);
    tx.onerror = () => reject(tx.error);
  });
}
