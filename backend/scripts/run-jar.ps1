param()

$ErrorActionPreference = 'Stop'
$backendRoot = Split-Path -Parent $PSScriptRoot
$javaDirectory = if ($env:XUYA_JAVA_HOME) { $env:XUYA_JAVA_HOME } else { 'D:\GreenSoft\java\jdk-17.0.14' }
$javaExecutable = Join-Path $javaDirectory 'bin\java.exe'
$jarFile = Join-Path $backendRoot 'dist\xuya-backend.jar'
if (-not (Test-Path -LiteralPath $javaExecutable)) { throw 'Java not found. Set XUYA_JAVA_HOME to Java 17+.' }
$jdkMetadata = Get-Content -LiteralPath (Join-Path $javaDirectory 'release') -Encoding UTF8
$javaVersion = [regex]::Match(($jdkMetadata -join "`n"), 'JAVA_VERSION="(\d+)')
if (-not $javaVersion.Success -or [int]$javaVersion.Groups[1].Value -lt 17) { throw 'This project requires Java 17+, not Java 8.' }
if (-not (Test-Path -LiteralPath $jarFile)) { throw 'Build first: node backend/scripts/build.mjs' }
if (-not $env:XUYA_DATA_DIR) { $env:XUYA_DATA_DIR = Join-Path $backendRoot 'data' }
if (-not $env:XUYA_CONFIG_DIR) { $env:XUYA_CONFIG_DIR = Join-Path $backendRoot 'config' }
if (-not $env:XUYA_BIND_ADDRESS) {
    $networkFile = Join-Path $env:XUYA_CONFIG_DIR 'network.json'
    $shareRequested = (Test-Path -LiteralPath $networkFile) -and ((Get-Content -LiteralPath $networkFile -Raw | ConvertFrom-Json).enabled -eq $true)
    $env:XUYA_BIND_ADDRESS = if ($shareRequested) { '0.0.0.0' } else { '127.0.0.1' }
}
if (-not $env:LOGGING_FILE_NAME) { $env:LOGGING_FILE_NAME = Join-Path $backendRoot 'logs\backend.log' }
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$configurationFile = Join-Path $backendRoot 'config\ports.json'
if (-not (Test-Path -LiteralPath $configurationFile)) { $configurationFile = Join-Path $backendRoot 'config\ports.example.json' }
$defaultPorts = Get-Content -LiteralPath $configurationFile -Raw -Encoding UTF8 | ConvertFrom-Json
$apiPort = if ($env:XUYA_PORT) { [int]$env:XUYA_PORT } else { [int]$defaultPorts.backend }
$runnerPort = if ($env:XUYA_RUNNER_PORT) { [int]$env:XUYA_RUNNER_PORT } else { [int]$defaultPorts.runner }
$selected = & (Join-Path $PSScriptRoot 'ports.ps1') -Mode Select -Ports "$apiPort,$runnerPort" | ConvertFrom-Json
$env:XUYA_PORT = [string]$selected.ports[0]
$env:XUYA_RUNNER_PORT = [string]$selected.ports[1]
Write-Output "Browser: http://127.0.0.1:$env:XUYA_PORT ; Python resources: http://127.0.0.1:$env:XUYA_RUNNER_PORT"
Push-Location $backendRoot
try {
    & $javaExecutable '-Dfile.encoding=UTF-8' '-jar' $jarFile
    exit $LASTEXITCODE
} finally { Pop-Location }
