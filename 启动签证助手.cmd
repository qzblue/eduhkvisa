@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul

for %%I in ("%~dp0.") do set "EXTENSION_DIR=%%~fI"
set "PROFILE_DIR=%LOCALAPPDATA%\EduHKVisaHelper\BrowserProfile"
set "LOGIN_PAGE=https://pappl.eduhk.hk/VMS/admission/applicant/ImmD/submission"
set "BROWSER_EXE="

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  set "BROWSER_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  goto browser_found
)

if exist "%SystemDrive%\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
  set "BROWSER_EXE=%SystemDrive%\Program Files (x86)\Google\Chrome\Application\chrome.exe"
  goto browser_found
)

if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
  set "BROWSER_EXE=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
  goto browser_found
)

if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
  set "BROWSER_EXE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
  goto browser_found
)

if exist "%SystemDrive%\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
  set "BROWSER_EXE=%SystemDrive%\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
  goto browser_found
)

echo.
echo [错误] 没有找到 Google Chrome 或 Microsoft Edge。
echo 请先安装其中一个浏览器，然后重新双击本文件。
echo.
pause
exit /b 1

:browser_found
if /I "%~1"=="--check" goto check_ok

echo.
echo 正在启动教大签证查询助手...
echo 首次使用时，请在打开的浏览器中正常登录教大申请系统。
echo.

start "" "%BROWSER_EXE%" --user-data-dir="%PROFILE_DIR%" --disable-extensions-except="%EXTENSION_DIR%" --load-extension="%EXTENSION_DIR%" "%LOGIN_PAGE%"

if errorlevel 1 (
  echo.
  echo [错误] 浏览器启动失败，请尝试按照 README 手动安装插件。
  echo.
  pause
  exit /b 1
)

echo 浏览器已成功启动。
echo 登录教大官网后，请点击浏览器右上角的扩展图标，打开“教大签证进度助手”。
timeout /t 5 /nobreak >nul
exit /b 0

:check_ok
echo CMD_CHECK_OK
echo BROWSER=%BROWSER_EXE%
echo EXTENSION=%EXTENSION_DIR%
exit /b 0
