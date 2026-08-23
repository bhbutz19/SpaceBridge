@echo off
setlocal
cd /d "%~dp0"
echo.
echo SpaceBridge v0.4 - built host
echo ===============================
if not exist "dist\index.html" (
  echo ERROR: No production client build found.
  echo Run BUILD_BRIDGE.bat first.
  pause
  exit /b 1
)
if not exist "dist-server\server\index.js" (
  echo ERROR: No production server build found.
  echo Run BUILD_BRIDGE.bat first.
  pause
  exit /b 1
)
echo Starting one-process host on port 2567...
echo Stations:   http://localhost:2567/
echo Host lobby: http://localhost:2567/host
echo Viewscreen: http://localhost:2567/viewscreen
echo Keep this window open while playing.
echo.
call npm start
set EXITCODE=%ERRORLEVEL%
echo.
if not "%EXITCODE%"=="0" echo SpaceBridge stopped with error code %EXITCODE%.
echo Press any key to close this window.
pause >nul
exit /b %EXITCODE%
