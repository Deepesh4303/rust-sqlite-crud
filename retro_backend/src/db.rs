use chrono::Local;
use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Prescription {
    pub id: i64,
    pub patient_name: String,
    pub age: Option<String>,
    pub gender: Option<String>,
    pub phone: Option<String>,
    pub date: String,
    pub time: String,
    pub symptoms: Option<String>,
    pub prescription: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewPrescription {
    pub patient_name: String,
    pub age: Option<String>,
    pub gender: Option<String>,
    pub phone: Option<String>,
    pub date: Option<String>,
    pub time: Option<String>,
    pub symptoms: Option<String>,
    pub prescription: String,
}

pub fn init_db(path: &str) -> Result<Connection> {
    let conn = Connection::open(path)?;

    // Enable WAL mode for better concurrency and write performance
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
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
        ",
    )?;

    Ok(conn)
}

pub fn load_distinct_patient_names(conn: &Connection) -> Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT DISTINCT patient_name FROM prescriptions ORDER BY patient_name ASC")?;
    let names = stmt
        .query_map([], |row| row.get::<_, String>(0))?
        .filter_map(|r| r.ok())
        .collect();
    Ok(names)
}

pub fn insert_prescription(conn: &Connection, new_rx: NewPrescription) -> Result<Prescription> {
    let now = Local::now();
    let date = new_rx.date.unwrap_or_else(|| now.format("%Y-%m-%d").to_string());
    let time = new_rx.time.unwrap_or_else(|| now.format("%H:%M").to_string());
    let created_at = now.format("%Y-%m-%d %H:%M:%S").to_string();

    conn.execute(
        "INSERT INTO prescriptions (patient_name, age, gender, phone, date, time, symptoms, prescription, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            new_rx.patient_name.trim(),
            new_rx.age.as_deref().map(str::trim),
            new_rx.gender.as_deref().map(str::trim),
            new_rx.phone.as_deref().map(str::trim),
            date,
            time,
            new_rx.symptoms.as_deref().map(str::trim),
            new_rx.prescription.trim(),
            created_at,
        ],
    )?;

    let id = conn.last_insert_rowid();

    Ok(Prescription {
        id,
        patient_name: new_rx.patient_name.trim().to_string(),
        age: new_rx.age.map(|s| s.trim().to_string()),
        gender: new_rx.gender.map(|s| s.trim().to_string()),
        phone: new_rx.phone.map(|s| s.trim().to_string()),
        date,
        time,
        symptoms: new_rx.symptoms.map(|s| s.trim().to_string()),
        prescription: new_rx.prescription.trim().to_string(),
        created_at,
    })
}

pub fn get_patient_history(conn: &Connection, patient_name: &str) -> Result<Vec<Prescription>> {
    let mut stmt = conn.prepare(
        "SELECT id, patient_name, age, gender, phone, date, time, symptoms, prescription, created_at
         FROM prescriptions
         WHERE LOWER(patient_name) = LOWER(?1)
         ORDER BY date DESC, time DESC, id DESC",
    )?;

    let records = stmt
        .query_map(params![patient_name.trim()], |row| {
            Ok(Prescription {
                id: row.get(0)?,
                patient_name: row.get(1)?,
                age: row.get(2)?,
                gender: row.get(3)?,
                phone: row.get(4)?,
                date: row.get(5)?,
                time: row.get(6)?,
                symptoms: row.get(7)?,
                prescription: row.get(8)?,
                created_at: row.get(9)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(records)
}

pub fn get_all_prescriptions(
    conn: &Connection,
    limit: Option<usize>,
    search: Option<String>,
    date: Option<String>,
) -> Result<Vec<Prescription>> {
    let limit_val = limit.unwrap_or(200);

    let (sql, params_vec): (String, Vec<Box<dyn rusqlite::ToSql>>) = match (search, date) {
        (Some(s), Some(d)) if !s.is_empty() && !d.is_empty() => (
            "SELECT id, patient_name, age, gender, phone, date, time, symptoms, prescription, created_at
             FROM prescriptions
             WHERE LOWER(patient_name) LIKE LOWER(?1) AND date = ?2
             ORDER BY date DESC, time DESC, id DESC LIMIT ?3".to_string(),
            vec![
                Box::new(format!("%{}%", s.trim())),
                Box::new(d.trim().to_string()),
                Box::new(limit_val as i64),
            ],
        ),
        (Some(s), _) if !s.is_empty() => (
            "SELECT id, patient_name, age, gender, phone, date, time, symptoms, prescription, created_at
             FROM prescriptions
             WHERE LOWER(patient_name) LIKE LOWER(?1)
             ORDER BY date DESC, time DESC, id DESC LIMIT ?2".to_string(),
            vec![
                Box::new(format!("%{}%", s.trim())),
                Box::new(limit_val as i64),
            ],
        ),
        (_, Some(d)) if !d.is_empty() => (
            "SELECT id, patient_name, age, gender, phone, date, time, symptoms, prescription, created_at
             FROM prescriptions
             WHERE date = ?1
             ORDER BY date DESC, time DESC, id DESC LIMIT ?2".to_string(),
            vec![
                Box::new(d.trim().to_string()),
                Box::new(limit_val as i64),
            ],
        ),
        _ => (
            "SELECT id, patient_name, age, gender, phone, date, time, symptoms, prescription, created_at
             FROM prescriptions
             ORDER BY date DESC, time DESC, id DESC LIMIT ?1".to_string(),
            vec![Box::new(limit_val as i64)],
        ),
    };

    let mut stmt = conn.prepare(&sql)?;
    let rusqlite_params = rusqlite::params_from_iter(params_vec.iter().map(|b| &**b));

    let records = stmt
        .query_map(rusqlite_params, |row| {
            Ok(Prescription {
                id: row.get(0)?,
                patient_name: row.get(1)?,
                age: row.get(2)?,
                gender: row.get(3)?,
                phone: row.get(4)?,
                date: row.get(5)?,
                time: row.get(6)?,
                symptoms: row.get(7)?,
                prescription: row.get(8)?,
                created_at: row.get(9)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(records)
}

pub fn get_prescription_by_id(conn: &Connection, id: i64) -> Result<Option<Prescription>> {
    let mut stmt = conn.prepare(
        "SELECT id, patient_name, age, gender, phone, date, time, symptoms, prescription, created_at
         FROM prescriptions
         WHERE id = ?1",
    )?;

    let mut rows = stmt.query(params![id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(Prescription {
            id: row.get(0)?,
            patient_name: row.get(1)?,
            age: row.get(2)?,
            gender: row.get(3)?,
            phone: row.get(4)?,
            date: row.get(5)?,
            time: row.get(6)?,
            symptoms: row.get(7)?,
            prescription: row.get(8)?,
            created_at: row.get(9)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn delete_prescription(conn: &Connection, id: i64) -> Result<bool> {
    let affected = conn.execute("DELETE FROM prescriptions WHERE id = ?1", params![id])?;
    Ok(affected > 0)
}
