@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js не найден. Установите Node.js 22+ с https://nodejs.org
  pause
  exit /b 1
)

echo Запуск Mess (сервер + клиент)...
node scripts/dev.js
pause
