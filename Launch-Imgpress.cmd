@echo off
chcp 65001 >nul
REM Production build; do not use cargo run / tauri dev
set "EXE=%~dp0src-tauri\target\release\imgpress_tauri.exe"

if exist "%EXE%" (
  start "" "%EXE%"
  exit /b 0
)

set "INST=%LocalAppData%\Programs\轻图\imgpress_tauri.exe"

if exist "%INST%" (
  start "" "%INST%"
  exit /b 0
)

echo imgpress_tauri.exe not found. Run: npm run build:client
pause
