param(
    [ValidateSet('Check', 'Install', 'Start', 'Stop')][string]$Mode = 'Check'
)
$ErrorActionPreference = 'Stop'
$backendDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$composeFile = Join-Path $backendDirectory 'config/studio/compose.yml'
$dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
if (!$dockerCommand) {
    if ($Mode -eq 'Check') {
        @{ installed = $false; running = $false; version = '1.0.9'; url = 'http://localhost:3000'; optional = $true } | ConvertTo-Json
        exit 0
    }
    throw '未检测到 Docker。Studio 为独立可选工具，工作台仍可正常使用。'
}
switch ($Mode) {
    'Check' {
        & $dockerCommand.Source compose --file $composeFile ps --format json
        if ($LASTEXITCODE -ne 0) { throw 'Studio 状态读取失败，请检查 Docker 服务。' }
    }
    'Install' {
        & $dockerCommand.Source compose --file $composeFile build studio
        if ($LASTEXITCODE -ne 0) { throw 'Studio 1.0.9 独立镜像构建失败，未修改产品运行环境。' }
    }
    'Start' {
        & $dockerCommand.Source compose --file $composeFile up --detach --no-build studio
        if ($LASTEXITCODE -ne 0) { throw 'Studio 启动失败，请先执行 Install 并确认本机 3000 端口可用。' }
        Write-Host 'Studio：http://localhost:3000。工作台设置显示的项目、Run ID 可用于关联本次观测。'
    }
    'Stop' {
        & $dockerCommand.Source compose --file $composeFile stop studio
        if ($LASTEXITCODE -ne 0) { throw 'Studio 停止失败。只操作 xuya-codex-studio 的独立服务。' }
    }
}
