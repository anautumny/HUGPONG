@echo off
title HUGPONG Web Console ^& Server
cd /d "%~dp0"

echo ========================================================
echo   Starting HUGPONG Backend Server ^& Web Console...
echo ========================================================
echo.
echo Building the React/Vite web application...
call npm.cmd run build:web
if errorlevel 1 (
  echo React web build failed. The server was not started.
  pause
  exit /b 1
)
echo.
echo Opening Web Browser at http://localhost:3000/ ...
start "" "http://localhost:3000/"

echo Starting server with Node.js on http://localhost:3000 ...
echo (Keep this window OPEN while using HUGPONG)
echo.
node server/server.js

echo.
echo Server has stopped.
pause
