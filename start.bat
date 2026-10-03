@echo off
title Arkadia
cd /d "%~dp0"
where node >nul 2>nul || (
  echo Node.js is not installed. Download it from https://nodejs.org and run this again.
  pause
  exit /b 1
)
start "" cmd /c "timeout /t 1 >nul & start http://localhost:8080"
node tools\serve.mjs
pause
