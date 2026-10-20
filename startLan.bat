@echo off
title Arkadia (network)
cd /d "%~dp0"
where node >nul 2>nul || (
  echo Node.js is not installed. Download it from https://nodejs.org and run this again.
  pause
  exit /b 1
)
echo Open the "on your network" address below on your phone (same Wi-Fi as this PC).
echo If Windows asks about the firewall, allow access on Private networks.
echo.
start "" cmd /c "timeout /t 1 >nul & start http://localhost:8080"
node tools\serve.mjs --lan
pause
