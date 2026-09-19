mod db;
mod trie;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use db::{
    delete_prescription, get_all_prescriptions, get_patient_history, get_prescription_by_id,
    init_db, insert_prescription, load_distinct_patient_names, NewPrescription, Prescription,
};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex, RwLock};
use std::time::Duration;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;
use trie::PatientTrie;

#[derive(Clone)]
pub struct AppState {
    db: Arc<Mutex<rusqlite::Connection>>,
    trie: Arc<RwLock<PatientTrie>>,
}

#[derive(Deserialize)]
struct SuggestQuery {
    q: Option<String>,
    limit: Option<usize>,
}

#[derive(Deserialize)]
struct ListQuery {
    search: Option<String>,
    date: Option<String>,
    limit: Option<usize>,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

fn internal_error<E: std::fmt::Display>(err: E) -> (StatusCode, Json<ErrorResponse>) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorResponse {
            error: err.to_string(),
        }),
    )
}

async fn handle_suggest(
    State(state): State<AppState>,
    Query(params): Query<SuggestQuery>,
) -> Json<Vec<String>> {
    let prefix = params.q.unwrap_or_default();
    let limit = params.limit.unwrap_or(10);
    let trie = state.trie.read().unwrap();
    let suggestions = trie.suggest(&prefix, limit);
    Json(suggestions)
}

async fn handle_list_prescriptions(
    State(state): State<AppState>,
    Query(params): Query<ListQuery>,
) -> Result<Json<Vec<Prescription>>, (StatusCode, Json<ErrorResponse>)> {
    let conn = state.db.lock().map_err(internal_error)?;
    let list = get_all_prescriptions(&conn, params.limit, params.search, params.date)
        .map_err(internal_error)?;
    Ok(Json(list))
}

async fn handle_patient_history(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Result<Json<Vec<Prescription>>, (StatusCode, Json<ErrorResponse>)> {
    let conn = state.db.lock().map_err(internal_error)?;
    let history = get_patient_history(&conn, &name).map_err(internal_error)?;
    Ok(Json(history))
}

async fn handle_get_prescription(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Response, (StatusCode, Json<ErrorResponse>)> {
    let conn = state.db.lock().map_err(internal_error)?;
    match get_prescription_by_id(&conn, id).map_err(internal_error)? {
        Some(item) => Ok(Json(item).into_response()),
        None => Ok(StatusCode::NOT_FOUND.into_response()),
    }
}

async fn handle_create_prescription(
    State(state): State<AppState>,
    Json(payload): Json<NewPrescription>,
) -> Result<(StatusCode, Json<Prescription>), (StatusCode, Json<ErrorResponse>)> {
    if payload.patient_name.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Patient name cannot be empty".to_string(),
            }),
        ));
    }
    if payload.prescription.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Prescription details cannot be empty".to_string(),
            }),
        ));
    }

    let patient_name = payload.patient_name.clone();
    let prescription = {
        let conn = state.db.lock().map_err(internal_error)?;
        insert_prescription(&conn, payload).map_err(internal_error)?
    };

    // Update the in-memory Trie with the patient name
    {
        let mut trie = state.trie.write().unwrap();
        trie.insert(&patient_name);
    }

    Ok((StatusCode::CREATED, Json(prescription)))
}

async fn handle_delete_prescription(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    let conn = state.db.lock().map_err(internal_error)?;
    let success = delete_prescription(&conn, id).map_err(internal_error)?;
    if success {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Ok(StatusCode::NOT_FOUND)
    }
}

async fn handle_export(
    State(state): State<AppState>,
) -> Result<Json<Vec<Prescription>>, (StatusCode, Json<ErrorResponse>)> {
    let conn = state.db.lock().map_err(internal_error)?;
    let all = get_all_prescriptions(&conn, Some(100000), None, None).map_err(internal_error)?;
    Ok(Json(all))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("--------------------------------------------------");
    println!("  [CLINIC OS] Local Patient & Prescription System");
    println!("--------------------------------------------------");

    // Determine paths based on execution directory
    let (db_path, static_path) = if std::path::Path::new("static").exists() {
        ("clinic.db", "static")
    } else if std::path::Path::new("../static").exists() {
        ("../clinic.db", "../static")
    } else {
        ("clinic.db", ".")
    };

    println!("[DB] Connecting to SQLite database at: {}", db_path);
    let conn = init_db(db_path)?;

    // Initialize Trie and pre-load all existing patient names
    let mut trie = PatientTrie::new();
    let existing_names = load_distinct_patient_names(&conn)?;
    let count = existing_names.len();
    for name in existing_names {
        trie.insert(&name);
    }
    println!("[TRIE] Indexed {} unique patient names in memory.", count);

    let state = AppState {
        db: Arc::new(Mutex::new(conn)),
        trie: Arc::new(RwLock::new(trie)),
    };

    println!("[STATIC] Serving frontend assets from: {}", static_path);

    let api_routes = Router::new()
        .route("/suggest", get(handle_suggest))
        .route("/prescriptions", get(handle_list_prescriptions).post(handle_create_prescription))
        .route("/prescriptions/{id}", get(handle_get_prescription).delete(handle_delete_prescription))
        .route("/patients/{name}/history", get(handle_patient_history))
        .route("/export", get(handle_export));

    let app = Router::new()
        .nest("/api", api_routes)
        .fallback_service(ServeDir::new(static_path).append_index_html_on_directories(true))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = "127.0.0.1:8080";
    let listener = tokio::net::TcpListener::bind(addr).await?;
    println!("[READY] Server running at: http://{}", addr);
    println!("Press Ctrl+C to shut down.");

    // Launch default browser on Windows in background
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(500)).await;
        #[cfg(target_os = "windows")]
        {
            let _ = std::process::Command::new("cmd")
                .args(["/C", "start", "http://localhost:8080"])
                .spawn();
        }
    });

    axum::serve(listener, app).await?;
    Ok(())
}
