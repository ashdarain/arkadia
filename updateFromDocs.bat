@echo off
title Arkadia - Update from docs
cd /d "%~dp0"
where node >nul 2>nul || (
  echo Node.js is not installed. Download it from https://nodejs.org and run this again.
  pause
  exit /b 1
)
echo Updating site data from your Obsidian notes...
echo.
node tools\convert-all.mjs
if errorlevel 1 (
  echo.
  echo Something went wrong. Check the messages above.
) else (
  echo.
  echo Done. Refresh the site in your browser to see the changes.
)
pause
