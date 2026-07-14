param(
    [switch]$Check
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$extensionDirectory = [System.IO.Path]::GetFullPath($PSScriptRoot)
$profileDirectory = Join-Path $env:LOCALAPPDATA "EduHKVisaHelper\BrowserProfile"
$loginPage = "https://pappl.eduhk.hk/VMS/admission/applicant/ImmD/submission"

$browserCandidates = @(
    if ($env:ProgramFiles) {
        Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"
        Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"
    }
    if (${env:ProgramFiles(x86)}) {
        Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"
        Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"
    }
    if ($env:LOCALAPPDATA) {
        Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe"
    }
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

if ($browserCandidates.Count -eq 0) {
    Write-Host ""
    Write-Host "[错误] 没有找到 Google Chrome 或 Microsoft Edge。" -ForegroundColor Red
    Write-Host "请先安装其中一个浏览器，然后重新双击启动文件。"
    exit 1
}

$browser = $browserCandidates[0]

if ($Check) {
    Write-Host "启动程序检查成功。" -ForegroundColor Green
    Write-Host "浏览器：$browser"
    Write-Host "插件目录：$extensionDirectory"
    exit 0
}

Write-Host ""
Write-Host "正在启动教大签证查询助手..." -ForegroundColor Cyan
Write-Host "首次使用时，请在打开的浏览器中正常登录教大申请系统。"
Write-Host ""

$browserArguments = @(
    "--user-data-dir=`"$profileDirectory`"",
    "--disable-extensions-except=`"$extensionDirectory`"",
    "--load-extension=`"$extensionDirectory`"",
    $loginPage
)

try {
    Start-Process -FilePath $browser -ArgumentList $browserArguments | Out-Null
} catch {
    Write-Host "[错误] 浏览器启动失败。" -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host "请按照 README 中的教程手动安装插件。"
    exit 1
}

Write-Host "浏览器已成功启动。" -ForegroundColor Green
Write-Host "登录教大官网后，请点击浏览器右上角的扩展图标。"
Write-Host "然后打开“教大签证进度助手”，点击“查询我的签证资料”。"
Start-Sleep -Seconds 5
exit 0
