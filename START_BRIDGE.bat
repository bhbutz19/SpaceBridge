@echo off
setlocal
cd /d "%~dp0"
echo.
echo Bridge Simulator v0.2
echo =====================
echo Starting authoritative server and browser client...
echo Keep this window open while playing.
echo.
call npm run dev
set EXITCODE=%ERRORLEVEL%
echo.
if not "%EXITCODE%"=="0" echo Bridge Simulator stopped with error code %EXITCODE%.
echo Press any key to close this window.
pause >nul
exit /b %EXITCODE%
