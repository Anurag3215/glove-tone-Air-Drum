@echo off
REM GloveTone GUI - NPM Helper

REM Try common Node.js paths
if exist "C:\Program Files\nodejs\npm.cmd" (
    "C:\Program Files\nodejs\npm.cmd" %*
    exit /b
)

if exist "C:\Program Files (x86)\nodejs\npm.cmd" (
    "C:\Program Files (x86)\nodejs\npm.cmd" %*
    exit /b
)

if exist "%LOCALAPPDATA%\Programs\nodejs\npm.cmd" (
    "%LOCALAPPDATA%\Programs\nodejs\npm.cmd" %*
    exit /b
)

echo Node.js not found in common locations!
echo Please install from https://nodejs.org/
echo.
echo Or run with execution policy bypass:
echo PowerShell -ExecutionPolicy Bypass -Command "npm %*"
pause
