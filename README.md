# RETRO CLINIC OS // Patient History & Prescription Tracker

A lightweight, self-hosted clinic record management application built with a native **Rust backend (`Axum` + `Rusqlite` + in-memory `Trie`)** and a nostalgic **Cyberpunk / Retro Monospace Web UI**.

Designed specifically for single-doctor clinics requiring zero-latency lookup, local persistence, and zero hosting costs.

---

## 🚀 How to Run (1-Click Launch)

### Option 1: Double-Click the Launcher (Recommended)
Simply double-click **`run_clinic.bat`** (or directly run **`clinic.exe`**).
- It will boot the local backend server.
- Connect to `clinic.db` (creating it automatically if it doesn't exist).
- Automatically open your default browser to **`http://localhost:8080`**.

### Option 2: Run via Cargo (Development Mode)
```bash
cd retro_backend
cargo run --release
```

---

## 💾 How Persistence Works (Solving the Browser Sandbox)

- **The Problem**: WebAssembly running directly inside Chromium browsers is strictly sandboxed and forbidden from modifying files or SQLite databases on the host hard drive.
- **The Solution**: The application runs a lightweight native Rust binary on `localhost:8080`. 
  - All data is securely stored in a local SQLite file: **`clinic.db`**.
  - No database server installation (MySQL, Postgres, etc.) is required—SQLite is compiled directly into the single executable.
  - Safe from accidental browser cache/cookie clears.
  - Includes a 1-click **`[EXPORT BACKUP]`** button to download a timestamped JSON backup anytime.

---

## ⚡ Trie-Based Prefix Search

- Implemented in native Rust (`retro_backend/src/trie.rs`).
- On server startup, all existing patient names from `clinic.db` are loaded into an in-memory prefix Trie.
- When new visits are saved, the patient name is dynamically indexed into the Trie.
- Typing any prefix (e.g. `Al`, `Joh`) performs instant $O(L)$ prefix traversal and suggests matching patient names with zero noticeable latency.

---

## 🖥️ User Interface & Features

1. **Patient Search [Alt+1]**:
   - Live autocomplete powered by the Rust Trie.
   - Selecting a patient immediately displays their full chronological visit history and previous prescriptions.

2. **New Prescription Form [Alt+2]**:
   - Patient name autocomplete with automatic prefilling of known vitals (age, gender, phone).
   - Automatically captures current visit date and time.
   - Text fields for clinical symptoms / diagnosis and detailed prescription instructions.

3. **Patient History [Alt+3]**:
   - Chronological timeline of all consultations.
   - **`[Print Slip (Rx)]`**: Opens a clean medical prescription slip formatted specifically for printing or saving as PDF (`@media print` renders black text on clean white paper, hiding terminal borders).
   - Single-click record deletion if needed.

4. **All Records Log [Alt+4]**:
   - Filterable data table of all clinic visits.
   - Live filter by patient name or consultation date.

5. **Retro Styling & Controls**:
   - Monospace phosphor green (`#00ff99`) on dark background with CRT bevels.
   - **`[CRT: ON/OFF]`** button to toggle scanlines overlay.
