@echo off
chcp 65001 >nul
setlocal
title PicBed · 简易图床

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install Node.js first.
  pause
  exit /b 1
)

start "" http://127.0.0.1:7790
node "%~dp0server.mjs"
echo.
echo [*] PicBed stopped.
pause
