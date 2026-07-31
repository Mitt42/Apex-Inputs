@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [Apex Inputs] Node.js is not installed.
  echo Download and install the LTS version from https://nodejs.org/
  echo Then run this file again.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo [Apex Inputs] npm was not found.
  echo Reinstall the LTS version of Node.js from https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist "%~dp0node_modules\electron\dist\electron.exe" (
  echo.
  echo [Apex Inputs] Installing the application dependencies...
  echo This is only required on the first run and needs an internet connection.
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [Apex Inputs] Installation failed.
    echo Check the internet connection and run this file again.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo [Apex Inputs] Starting...
call npm start
if errorlevel 1 (
  echo.
  echo [Apex Inputs] The application stopped with an error.
  pause
  exit /b 1
)
