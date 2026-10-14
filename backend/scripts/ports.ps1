param(
    [ValidateSet('Inspect', 'Select', 'Guard')]
    [string]$Mode = 'Inspect',
    [string]$Ports = ''
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$workspaceRoot = (Resolve-Path -LiteralPath (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))).Path
$configurationFile = Join-Path $workspaceRoot 'backend\config\ports.json'
if (-not (Test-Path -LiteralPath $configurationFile)) { $configurationFile = Join-Path $workspaceRoot 'backend\config\ports.example.json' }
$defaults = Get-Content -LiteralPath $configurationFile -Raw -Encoding UTF8 | ConvertFrom-Json
$requested = if ($Ports) { @($Ports.Split(',') | ForEach-Object { [int]$_ }) } else { @([int]$defaults.backend, [int]$defaults.runner) }
if (@($requested | Where-Object { $_ -lt 1 -or $_ -gt 65535 }).Count -or @($requested | Select-Object -Unique).Count -ne $requested.Count) {
    throw 'Ports must be different integers from 1 to 65535.'
}

function Get-OwnedKind($ProcessInfo) {
    if (-not $ProcessInfo -or -not $ProcessInfo.CommandLine -or -not $ProcessInfo.ExecutablePath) { return $null }
    $command = $ProcessInfo.CommandLine.Replace('/', '\').ToLowerInvariant()
    $executable = [System.IO.Path]::GetFileName($ProcessInfo.ExecutablePath).ToLowerInvariant()
    if ($executable -eq 'java.exe') {
        # Spring Boot may put its classpath/main class in a Java @argument file.
        foreach ($argument in [regex]::Matches($ProcessInfo.CommandLine, '@(?:"([^"]+)"|([^\s"]+))')) {
            $argumentFile = if ($argument.Groups[1].Success) { $argument.Groups[1].Value } else { $argument.Groups[2].Value }
            try {
                $argumentInfo = Get-Item -LiteralPath $argumentFile -ErrorAction Stop
                if (-not $argumentInfo.PSIsContainer -and $argumentInfo.Length -le 1048576) {
                    $command += ' ' + (Get-Content -LiteralPath $argumentFile -Raw -Encoding UTF8).Replace('\\', '\').Replace('/', '\').ToLowerInvariant()
                }
            } catch { # Unreadable arguments are not proof of ownership.
            }
        }
    }
    $backendPath = "$workspaceRoot\backend\".ToLowerInvariant()
    $packagedJar = "$workspaceRoot\electron\dist\win-unpacked\resources\backend\xuya-backend.jar".ToLowerInvariant()
    $frontendPaths = @("$workspaceRoot\frontend-react\node_modules\") | ForEach-Object { $_.ToLowerInvariant() }
    # 新入口及旧版本主类均须同时匹配本工程路径；旧类名后缀只用于遗留服务兼容。
    if ($executable -eq 'java.exe' -and (($command.Contains($backendPath) -and ($command.Contains('com.xuya.island.xuyaislandapplication') -or $command.Contains('.xuyaapplication') -or $command.Contains('xuya-backend.jar'))) -or $command.Contains($packagedJar))) { return 'backend' }
    if ($executable -eq 'node.exe' -and (@($frontendPaths | Where-Object { $command.Contains($_) }).Count -gt 0) -and $command -match 'vite[\\]bin[\\]vite\.js') { return 'frontend' }
    return $null
}

if ($Mode -eq 'Guard') {
    # Inspect actual processes, including a server on a previously selected alternate port.
    foreach ($processInfo in Get-CimInstance Win32_Process) {
        if ((Get-OwnedKind $processInfo) -eq 'backend') { throw 'Close the project backend or desktop before building or cleaning.' }
    }
    @{ activeBackend = $false } | ConvertTo-Json -Compress
    return
}

$scanPorts = @($requested) + @([int]$defaults.backend, [int]$defaults.runner, [int]$defaults.frontend, 8765, 8766, 5173)
$sessionFile = Join-Path $workspaceRoot 'backend\logs\dev-session.json'
if (Test-Path -LiteralPath $sessionFile) {
    try {
        $session = Get-Content -LiteralPath $sessionFile -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($session.workspace -eq $workspaceRoot) { $scanPorts += @([int]$session.ports.backend, [int]$session.ports.runner, [int]$session.ports.frontend) }
    } catch { # An interrupted or older session file is not proof of process ownership.
    }
}
$scanPorts = @($scanPorts | Where-Object { $_ -gt 0 -and $_ -le 65535 } | Select-Object -Unique)
$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in $scanPorts })
$owners = @()
foreach ($listener in $listeners) {
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
    $kind = Get-OwnedKind $processInfo
    $owners += [pscustomobject]@{ port = [int]$listener.LocalPort; pid = [int]$listener.OwningProcess; owned = [bool]$kind; kind = $kind; created = if ($processInfo) { $processInfo.CreationDate.ToUniversalTime().ToString('o') } else { $null } }
}
if ($Mode -eq 'Inspect') { @{ owners = $owners } | ConvertTo-Json -Depth 4 -Compress; return }

$released = @()
foreach ($owner in @($owners | Where-Object { $_.owned } | Sort-Object pid -Unique)) {
    # Re-read identity immediately before stopping; never trust a cached PID alone.
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $($owner.pid)" -ErrorAction SilentlyContinue
    if ($processInfo -and (Get-OwnedKind $processInfo) -and $processInfo.CreationDate.ToUniversalTime().ToString('o') -eq $owner.created) {
        Stop-Process -Id $owner.pid -Force -ErrorAction Stop
        $released += $owner
    }
}
if ($released.Count) { Start-Sleep -Milliseconds 700 }

$reservations = @()
$selected = @()
try {
    foreach ($preferred in $requested) {
        $available = $false
        for ($candidate = $preferred; $candidate -le [Math]::Min(65535, $preferred + 100); $candidate++) {
            if ($candidate -in $selected) { continue }
            $reservation = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $candidate)
            try {
                $reservation.Start()
                $reservations += $reservation
                $selected += $candidate
                $available = $true
                break
            } catch [System.Net.Sockets.SocketException] { $reservation.Stop() }
        }
        if (-not $available) { throw "No available port near $preferred. Set XUYA_PORT, XUYA_RUNNER_PORT or XUYA_FRONTEND_PORT." }
    }
} finally { foreach ($reservation in $reservations) { $reservation.Stop() } }
@{ ports = $selected; released = $released; retained = @($owners | Where-Object { -not $_.owned }) } | ConvertTo-Json -Depth 4 -Compress
