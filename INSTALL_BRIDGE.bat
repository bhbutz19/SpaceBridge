@echo off
setlocal
cd /d "%~dp0"
echo.
echo Bridge Simulator v0.2 - dependency setup
echo ========================================
where node >nul 2>nul || (echo ERROR: Node.js is not installed or not on PATH.& echo Install Node.js, reopen Command Prompt, and run this file again.& pause& exit /b 1)
where npm >nul 2>nul || (echo ERROR: npm is not available on PATH.& pause& exit /b 1)
where git >nul 2>nul || (echo ERROR: Git is not installed or not on PATH.& echo Install Git for Windows, reopen Command Prompt, and run this file again.& pause& exit /b 1)
echo Node:
node -v
echo npm:
npm -v
echo Git:
git --version
echo.
echo Installing dependencies...
call npm install
set EXITCODE=%ERRORLEVEL%
if not "%EXITCODE%"=="0" (
  echo.
  echo INSTALL FAILED. Review the npm error above.
  pause
  exit /b %EXITCODE%
)
echo.
echo Install complete. Run START_BRIDGE.bat to launch the host.
pause
