@echo off
title HUGPONG Web Console ^& Server
cd /d "%~dp0server"

echo ========================================================
echo   Starting HUGPONG Backend Server ^& Web Console...
echo ========================================================
:: Check if port 3000 is already in use and free it
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr /r /c:":3000 .*LISTENING"') do (
  echo Port 3000 is currently in use by PID %%a. Freeing port 3000...
  taskkill /F /PID %%a >nul 2>&1
  timeout /t 1 /nobreak >nul
)

echo Opening Web Browser at http://localhost:3000 ...
start "" "http://localhost:3000"

echo Starting server with Node.js on http://localhost:3000 ...
echo (Keep this window OPEN while using HUGPONG)
echo.
node server.js

echo.
echo Server has stopped.
pause

