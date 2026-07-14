@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-visa-helper.ps1" %*
set "LAUNCH_EXIT_CODE=%ERRORLEVEL%"

if not "%LAUNCH_EXIT_CODE%"=="0" (
  echo.
  echo Launcher failed. Please read the Chinese error message above.
  pause
)

exit /b %LAUNCH_EXIT_CODE%
