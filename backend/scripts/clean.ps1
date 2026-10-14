param([switch]$WebOnly)

$ErrorActionPreference = 'Stop'
$workspaceRoot = (Resolve-Path -LiteralPath (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))).Path
& (Join-Path $PSScriptRoot 'ports.ps1') -Mode Guard | Out-Null

# Explicit intermediate paths only. Learning data and final dist packages are preserved.
$intermediatePaths = @(
    'backend\target',
    'backend\.tmp',
    'frontend-react\test-results',
    'frontend-react\playwright-report',
    'frontend-react\coverage',
    'frontend-react\.tmp',
    'frontend-react\node_modules\.vite',
    'frontend-react\node_modules\.vite-temp'
)
if (-not $WebOnly) { $intermediatePaths += @('electron\build', 'electron\.tmp') }
foreach ($relativePath in $intermediatePaths) {
    $absolutePath = [System.IO.Path]::GetFullPath((Join-Path $workspaceRoot $relativePath))
    if (-not $absolutePath.StartsWith("$workspaceRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Cleanup path is outside the workspace: $relativePath"
    }
    if (-not (Test-Path -LiteralPath $absolutePath)) { continue }
    $resolvedPath = (Resolve-Path -LiteralPath $absolutePath).Path
    if (-not $resolvedPath.Equals($absolutePath, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Unexpected cleanup target: $relativePath"
    }
    $targetItem = Get-Item -LiteralPath $absolutePath -Force
    if ($targetItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        throw "Refusing to clean a linked directory: $relativePath"
    }
    $linkedChild = Get-ChildItem -LiteralPath $absolutePath -Recurse -Force |
        Where-Object { $_.Attributes -band [System.IO.FileAttributes]::ReparsePoint } |
        Select-Object -First 1
    if ($linkedChild) { throw "Refusing to clean a directory containing links: $relativePath" }
    Remove-Item -LiteralPath $absolutePath -Recurse -Force
    Write-Output "Cleaned $relativePath"
}
Write-Output 'Cleanup complete. Source files, dependencies, learning data, logs, and dist packages were preserved.'
