@echo off
setlocal
cd /d "%~dp0server"
title HUGPONG Backend Sync Server
:: Check if port 3000 is already in use and free it
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr /r /c:":3000 .*LISTENING"') do (
  echo Port 3000 is currently in use by PID %%a. Freeing port 3000...
  taskkill /F /PID %%a >nul 2>&1
  timeout /t 1 /nobreak >nul
)

echo Starting HUGPONG Backend Server on http://localhost:3000...
node server.js
pause

