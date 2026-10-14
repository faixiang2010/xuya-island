param(
    [ValidateSet('run', 'test', 'build', 'clean')]
    [string]$Task = 'run'
)

$ErrorActionPreference = 'Stop'
$backendRoot = Split-Path -Parent $PSScriptRoot
$javaDirectory = if ($env:XUYA_JAVA_HOME) { $env:XUYA_JAVA_HOME } else { 'D:\GreenSoft\java\jdk-17.0.14' }
$mavenDirectory = if ($env:XUYA_MAVEN_HOME) { $env:XUYA_MAVEN_HOME } else { 'D:\GreenSoft\apache-maven-3.9.11' }
$javaExecutable = Join-Path $javaDirectory 'bin\java.exe'
$mavenExecutable = Join-Path $mavenDirectory 'bin\mvn.cmd'
if (-not (Test-Path -LiteralPath $javaExecutable)) { throw 'Java not found. Set XUYA_JAVA_HOME to a Java 17+ installation.' }
if (-not (Test-Path -LiteralPath $mavenExecutable)) { throw 'Maven not found. Set XUYA_MAVEN_HOME.' }
$jdkMetadata = Get-Content -LiteralPath (Join-Path $javaDirectory 'release') -Encoding UTF8
$javaVersion = [regex]::Match(($jdkMetadata -join "`n"), 'JAVA_VERSION="(\d+)')
if (-not $javaVersion.Success -or [int]$javaVersion.Groups[1].Value -lt 17) { throw 'This project requires Java 17+, not Java 8.' }
$env:JAVA_HOME = $javaDirectory
$env:JAVA_TOOL_OPTIONS = '-Dfile.encoding=UTF-8 -Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8'
if ($Task -in @('test', 'build', 'clean')) { $env:JAVA_TOOL_OPTIONS += ' -XX:-UsePerfData' }
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
if (-not $env:XUYA_DATA_DIR) { $env:XUYA_DATA_DIR = Join-Path $backendRoot 'data' }
if (-not $env:XUYA_CONFIG_DIR) { $env:XUYA_CONFIG_DIR = Join-Path $backendRoot 'config' }
if ($Task -eq 'run' -and -not $env:XUYA_BIND_ADDRESS) {
    $networkFile = Join-Path $env:XUYA_CONFIG_DIR 'network.json'
    $shareRequested = (Test-Path -LiteralPath $networkFile) -and ((Get-Content -LiteralPath $networkFile -Raw | ConvertFrom-Json).enabled -eq $true)
    $env:XUYA_BIND_ADDRESS = if ($shareRequested) { '0.0.0.0' } else { '127.0.0.1' }
}
if ($Task -eq 'run' -and -not $env:LOGGING_FILE_NAME) { $env:LOGGING_FILE_NAME = Join-Path $backendRoot 'logs\backend.log' }
if ($Task -eq 'run' -and $env:XUYA_PORTS_PREPARED -ne '1') {
    $configurationFile = Join-Path $backendRoot 'config\ports.json'
    if (-not (Test-Path -LiteralPath $configurationFile)) { $configurationFile = Join-Path $backendRoot 'config\ports.example.json' }
    $defaultPorts = Get-Content -LiteralPath $configurationFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $apiPort = if ($env:XUYA_PORT) { [int]$env:XUYA_PORT } else { [int]$defaultPorts.backend }
    $runnerPort = if ($env:XUYA_RUNNER_PORT) { [int]$env:XUYA_RUNNER_PORT } else { [int]$defaultPorts.runner }
    $selected = & (Join-Path $PSScriptRoot 'ports.ps1') -Mode Select -Ports "$apiPort,$runnerPort" | ConvertFrom-Json
    $env:XUYA_PORT = [string]$selected.ports[0]
    $env:XUYA_RUNNER_PORT = [string]$selected.ports[1]
    Write-Output "Backend: http://127.0.0.1:$env:XUYA_PORT ; Python resources: http://127.0.0.1:$env:XUYA_RUNNER_PORT"
}
if ($Task -ne 'clean') {
    if ($Task -in @('test', 'build')) {
        $testTemporaryDirectory = Join-Path $backendRoot 'target\test-tmp'
        New-Item -ItemType Directory -Path $testTemporaryDirectory -Force | Out-Null
        $env:TEMP = $testTemporaryDirectory
        $env:TMP = $testTemporaryDirectory
    }
    & node '--experimental-strip-types' (Join-Path (Split-Path -Parent $backendRoot) 'frontend-react/scripts/prepare-learning-catalog.mjs')
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $frontendModule = 'frontend-react'
    if ($env:XUYA_FRONTEND_MODULE -and $env:XUYA_FRONTEND_MODULE -ne 'frontend-react') { throw 'XUYA_FRONTEND_MODULE 仅支持 frontend-react；frontend-vue 已删除。' }
    $prepareRuntime = Join-Path (Split-Path -Parent $backendRoot) "$frontendModule\scripts\prepare-runtime.mjs"
    & node $prepareRuntime
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
Push-Location $backendRoot
try {
    switch ($Task) {
        'run' { & $mavenExecutable '-B' 'spring-boot:run' }
        'test' { & $mavenExecutable '-B' 'test' }
        'build' {
            # XUYA_SKIP_TESTS=1 仅用于发布打包：跳过测试执行，避免偶发测试（如 AI agent 时序）阻断产物构建；
            # 测试仍由 verify 流水线单独运行。本地/日常构建不设置该变量，行为不变。
            if ($env:XUYA_SKIP_TESTS -eq '1') {
                & $mavenExecutable '-B' 'verify' '-DskipTests'
            } else {
                & $mavenExecutable '-B' 'verify'
            }
        }
        'clean' { & $mavenExecutable '-B' 'clean' }
    }
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally { Pop-Location }
