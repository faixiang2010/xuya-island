param(
    [ValidateSet('Install', 'Check')][string]$Mode = 'Check',
    [string]$ExtensionId,
    [string]$BaseUrl = 'http://127.0.0.1:43172',
    [string]$DataDir
)
$ErrorActionPreference = 'Stop'
$backendDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (!$DataDir) { $DataDir = Join-Path $backendDirectory 'data/codex' }
$dataDirectory = [IO.Path]::GetFullPath($DataDir)
$bridgeDirectory = Join-Path $dataDirectory 'platform/chrome'
$sourceDirectory = Join-Path $backendDirectory 'src/main/resources/codex/chrome'
$registryPath = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.xuya.codex.chrome'
$manifestPath = Join-Path $bridgeDirectory 'native-host.json'
if ($Mode -eq 'Check') {
    $registered = Test-Path -LiteralPath $registryPath
    $registryManifest = if ($registered) { (Get-Item -LiteralPath $registryPath).GetValue('') } else { $null }
    $result = [ordered]@{ registered = $registered; manifestExists = Test-Path -LiteralPath $manifestPath; registryPointsToManifest = ($registryManifest -eq $manifestPath); hostExists = Test-Path -LiteralPath (Join-Path $bridgeDirectory 'bin/NativeBridge.exe'); secretExists = Test-Path -LiteralPath (Join-Path $bridgeDirectory 'bridge-secret.txt'); extensionDirectory = (Join-Path $sourceDirectory 'extension'); connectionVerified = $false }
    $result | ConvertTo-Json
    Write-Host '实际 Chrome 协议连接需在扩展弹窗点击连接，再检查工作台 Chrome 状态。'
    exit 0
}
if ($ExtensionId -notmatch '^[a-p]{32}$') { throw '请在 chrome://extensions 加载 extension 目录，然后提供真实 ExtensionId。' }
$backendUri = [Uri]$BaseUrl
if ($backendUri.Scheme -ne 'http' -or $backendUri.Host -notin @('127.0.0.1','localhost')) { throw 'BaseUrl 只能指向本机 HTTP 后端。' }
if (!(Test-Path -LiteralPath (Join-Path $bridgeDirectory 'bridge-secret.txt'))) { throw '请先启动后端并打开工作台 Chrome 状态，初始化独立桥密钥。' }
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (!(Test-Path -LiteralPath $compiler)) { $compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework/v4.0.30319/csc.exe' }
if (!(Test-Path -LiteralPath $compiler)) { throw '未找到 .NET Framework C# 编译器，无法安装 Native Host。' }
$binaryDirectory = Join-Path $bridgeDirectory 'bin'
New-Item -ItemType Directory -Path $binaryDirectory -Force | Out-Null
$executable = Join-Path $binaryDirectory 'NativeBridge.exe'
& $compiler /nologo /target:exe /optimize+ /reference:System.Web.Extensions.dll "/out:$executable" (Join-Path $sourceDirectory 'native/NativeBridge.cs')
if ($LASTEXITCODE -ne 0) { throw 'Native Host 编译失败。' }
$utf8 = New-Object Text.UTF8Encoding($false)
$secret = [IO.File]::ReadAllText((Join-Path $bridgeDirectory 'bridge-secret.txt')).Trim()
$configuration = @{ baseUrl = $backendUri.AbsoluteUri; bridgeSecret = $secret } | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $binaryDirectory 'bridge-config.json'), $configuration, $utf8)
$manifest = @{ name = 'com.xuya.codex.chrome'; description = 'Xuya Island Codex Chrome Bridge'; path = $executable; type = 'stdio'; allowed_origins = @("chrome-extension://$ExtensionId/") } | ConvertTo-Json
[IO.File]::WriteAllText($manifestPath, $manifest, $utf8)
# 只为当前用户注册，只允许本次指定的 Chrome 扩展；密钥文件 ACL 不继承其他普通账户。
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
foreach ($privateFile in @((Join-Path $binaryDirectory 'bridge-config.json'), (Join-Path $bridgeDirectory 'bridge-secret.txt'))) {
    $acl = New-Object Security.AccessControl.FileSecurity
    $acl.SetAccessRuleProtection($true, $false)
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'Allow')))
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule('SYSTEM', 'FullControl', 'Allow')))
    Set-Acl -LiteralPath $privateFile -AclObject $acl
}
New-Item -Path $registryPath -Force | Out-Null
Set-Item -LiteralPath $registryPath -Value $manifestPath
Write-Host "Native Host 已为当前用户注册。扩展目录：$(Join-Path $sourceDirectory 'extension')"
Write-Host '请在扩展弹窗点击连接；注册文件存在不等于浏览器已连接。'
