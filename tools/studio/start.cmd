@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0..\.."
title Guiyihan Studio

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install Node.js first.
  pause
  exit /b 1
)

if not exist "node_modules\astro\astro.js" (
  echo [*] Installing dependencies...
  where bun >nul 2>nul
  if errorlevel 1 (
    call npm install
  ) else (
    call bun install
  )
)

node "tools\studio\server.mjs"
echo.
echo [*] Studio stopped.
pause
