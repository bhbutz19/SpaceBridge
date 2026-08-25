@echo off
setlocal
cd /d "%~dp0"
echo.
echo SpaceBridge v0.5 alpha - production build
echo ==================================
echo Building authoritative server and browser client...
echo.
call npm run build
set EXITCODE=%ERRORLEVEL%
echo.
if not "%EXITCODE%"=="0" (
  echo BUILD FAILED. Review the error above.
  pause
  exit /b %EXITCODE%
)
echo Build complete.
echo You can now run START_BUILT_BRIDGE.bat for a single-port host on port 2567.
pause
