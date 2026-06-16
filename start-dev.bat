@echo off
cd /d "%~dp0"

echo.
echo   Blazz FM - Dev Launcher
echo   [1] Vite dev server (port 5173)
echo   [2] Electron main process
echo.

:: Terminal 1: Vite
start "Blazz FM Vite" cmd /k "title Blazz FM && npm run dev"

pause
