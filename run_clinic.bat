@echo off
title Retro Clinic OS - Launcher
echo =========================================================
echo       RETRO CLINIC OS // PATIENT & PRESCRIPTION LOG
echo =========================================================
echo.
cd /d "%~dp0"

if exist "clinic.exe" (
    echo [OK] Starting Clinic Server...
    "clinic.exe"
) else if exist "retro_backend\target\release\clinic_backend.exe" (
    echo [OK] Starting Clinic Server from target/release...
    "retro_backend\target\release\clinic_backend.exe"
) else (
    echo [BUILD] Compiling and starting server...
    cd retro_backend
    cargo run --release
)
