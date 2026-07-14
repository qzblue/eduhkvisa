@echo off
setlocal
chcp 65001 >nul

for %%I in ("%~dp0.") do set "EXTENSION_DIR=%%~fI"
set "PROFILE_DIR=%LOCALAPPDATA%\EduHKVisaHelper\BrowserProfile"
set "LOGIN_URL=https://pappl.eduhk.hk/VMS/admission/applicant/ImmD/submission"
set "BROWSER="

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"

if not defined BROWSER (
  echo 未找到 Google Chrome 或 Microsoft Edge。
  echo 请先安装其中一个浏览器，再重新运行本脚本。
  pause
  exit /b 1
)

echo 正在启动教大签证进度助手...
echo 首次使用时，请在打开的浏览器中正常登录教大申请系统。
start "" "%BROWSER%" --user-data-dir="%PROFILE_DIR%" --disable-extensions-except="%EXTENSION_DIR%" --load-extension="%EXTENSION_DIR%" "%LOGIN_URL%"

if errorlevel 1 (
  echo 浏览器启动失败。
  pause
  exit /b 1
)

echo 浏览器已启动。登录后，点击工具栏中的“教大签证进度助手”。
timeout /t 4 >nul
endlocal
