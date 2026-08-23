@echo off
setlocal
cd /d "%~dp0"
echo.
echo Bridge Simulator v0.2
echo =====================
echo Starting authoritative server and browser client...
echo Keep this window open while playing.
echo.
npm run dev
pause
