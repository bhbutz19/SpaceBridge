@echo off
setlocal
cd /d "%~dp0"
echo.
echo SpaceBridge v0.5 alpha
echo =================
echo Starting authoritative server and browser client...
echo Keep this window open while playing.
echo.
echo Bridge stations: http://localhost:5173
echo Host lobby:      http://localhost:5173/host
echo Main viewscreen: http://localhost:5173/viewscreen
echo.
call npm run dev
set EXITCODE=%ERRORLEVEL%
echo.
if not "%EXITCODE%"=="0" echo SpaceBridge stopped with error code %EXITCODE%.
echo Press any key to close this window.
pause >nul
exit /b %EXITCODE%
