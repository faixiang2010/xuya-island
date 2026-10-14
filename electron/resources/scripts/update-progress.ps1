# update-progress.ps1
# 静默 NSIS 升级期间显示的无边框 WinForms 过渡窗。
# 由 update.cts 在 app.quit() 前通过隐藏中转器 launch-update-progress.vbs 拉起，
# 使用隐藏 VBS 中转是为了同时避免控制台闪烁和 detached PowerShell 宿主初始化失败。
#
# 关闭策略（满足任一即关闭）：
#   1) 重启后的应用进程出现可见主窗口 —— 新应用就绪后立刻关闭。
#   2) NSIS 安装器进程（-InstallerPath）已退出，且经过短暂淡出间隔 —— 作为
#      无法检测应用窗口时的兜底。
#   3) 在 -TimeoutSeconds 内始终未观察到安装器 —— 安装器未启动时的防御。
#   4) 绝对上限 -MaxInstallSeconds —— 安装器永久卡死时的防御。
#
# -TimeoutSeconds 不得在安装器仍在运行时关闭窗口：慢盘或杀软扫描可能超时，
# 提前关闭会让用户误以为升级完成，手动启动应用时 NSIS 可能仍在覆盖文件。

param(
    [string]$InstallerPath = "",
    [string]$AppProcessName = "",
    [int]$OldAppProcessId = 0,
    [string]$Title = "正在更新叙芽岛",
    [string]$Message = "更新即将完成，叙芽岛会自动重新打开……",
    [string]$Caption = "正在安装…",
    [int]$TimeoutSeconds = 120,
    [int]$MaxInstallSeconds = 600,
    # 窗口出现后再等待这么久才开始轮询安装器状态，避免"安装器尚未启动"的
    # 竞态（此时 Get-Process 返回空会被误判为安装已完成）。
    [int]$DetectStartSeconds = 3,
    # 安装器进程消失后继续保留窗口的时间，留给新应用主窗口渲染并获取焦点。
    [int]$FadeMs = 3000
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Forms.Application]::EnableVisualStyles()

# 预先推导安装器进程名（去掉扩展名）；按名称匹配比每 tick 重扫路径便宜得多。
$installerName = if ($InstallerPath) {
    [System.IO.Path]::GetFileNameWithoutExtension($InstallerPath)
} else {
    ""
}

function Test-NewAppWindowReady {
    if (-not $AppProcessName) {
        return $false
    }

    try {
        $readyApp = Get-Process -Name $AppProcessName -ErrorAction SilentlyContinue |
            Where-Object { $_.Id -ne $OldAppProcessId -and $_.MainWindowHandle -ne [IntPtr]::Zero } |
            Select-Object -First 1
        return $null -ne $readyApp
    } catch {
        return $false
    }
}

$form = New-Object System.Windows.Forms.Form
$form.Text = $Title
# 无边框窗口只在右上角保留一个最小化按钮，32px 头部替代原生标题栏高度。
$form.ClientSize = New-Object System.Drawing.Size(420, 232)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "None"
$form.ControlBox = $false
# 无边框窗口露出的 1px 背景即为窗口描边。
$form.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#b7bec8")
$form.ShowInTaskbar = $true
$form.TopMost = $false

# 尝试沿用随应用分发的图标；找不到时退回系统默认图标，不影响升级。
$iconCandidates = @(
    (Join-Path $PSScriptRoot 'icon.ico')
    (Join-Path (Split-Path -Parent $PSScriptRoot) 'icon.ico')
    (Join-Path (Split-Path -Parent $PSScriptRoot) 'art/icon.ico')
)
$windowIcon = $null
foreach ($candidate in $iconCandidates) {
    if (-not [System.IO.File]::Exists($candidate)) { continue }
    try {
        $windowIcon = [System.Drawing.Icon]::new($candidate, 32, 32)
        $form.Icon = $windowIcon
        break
    } catch {
        # 安装器可能已替换该资源，忽略并保留默认图标。
        if ($windowIcon) { $windowIcon.Dispose(); $windowIcon = $null }
    }
}

$headerPanel = New-Object System.Windows.Forms.Panel
$headerPanel.Size = New-Object System.Drawing.Size(418, 32)
$headerPanel.Location = New-Object System.Drawing.Point(1, 1)
$headerPanel.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#f8f7f3")

$headerTitle = New-Object System.Windows.Forms.Label
$headerTitle.Text = $Title
$headerTitle.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 9, [System.Drawing.FontStyle]::Bold)
$headerTitle.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#243b53")
$headerTitle.AutoSize = $false
$headerTitle.Size = New-Object System.Drawing.Size(360, 32)
$headerTitle.Location = New-Object System.Drawing.Point(12, 0)
$headerTitle.TextAlign = "MiddleLeft"
$headerPanel.Controls.Add($headerTitle)

$minimizeButton = New-Object System.Windows.Forms.Label
$minimizeButton.Text = [char]0x2500
$minimizeButton.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 10, [System.Drawing.FontStyle]::Bold)
$minimizeButton.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#6b7280")
$minimizeButton.AutoSize = $false
$minimizeButton.Size = New-Object System.Drawing.Size(40, 32)
$minimizeButton.Location = New-Object System.Drawing.Point(378, 0)
$minimizeButton.TextAlign = "MiddleCenter"
$minimizeButton.Cursor = [System.Windows.Forms.Cursors]::Hand
$minimizeButton.Add_Click({ $form.WindowState = "Minimized" })
$minimizeButton.Add_MouseEnter({ $minimizeButton.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#e5e7eb") })
$minimizeButton.Add_MouseLeave({ $minimizeButton.BackColor = $headerPanel.BackColor })
$headerPanel.Controls.Add($minimizeButton)
$form.Controls.Add($headerPanel)

# WinForms 子控件鼠标事件不会冒泡到面板；把同一套拖拽处理同时挂到空白头部和标题，
# 最小化按钮保持可点击。
$script:dragging = $false
$startDrag = {
    param($sender, $eventArgs)
    if ($eventArgs.Button -ne [System.Windows.Forms.MouseButtons]::Left) { return }
    $script:dragging = $true
    $script:dragCursor = [System.Windows.Forms.Control]::MousePosition
    $script:dragOrigin = $form.Location
}
$moveDrag = {
    if (-not $script:dragging) { return }
    if (-not ([System.Windows.Forms.Control]::MouseButtons -band [System.Windows.Forms.MouseButtons]::Left)) {
        $script:dragging = $false
        return
    }
    $cursor = [System.Windows.Forms.Control]::MousePosition
    $newX = $script:dragOrigin.X + $cursor.X - $script:dragCursor.X
    $newY = $script:dragOrigin.Y + $cursor.Y - $script:dragCursor.Y
    $form.Location = [System.Drawing.Point]::new($newX, $newY)
}
$endDrag = { $script:dragging = $false }
$headerPanel.Add_MouseDown($startDrag)
$headerPanel.Add_MouseMove($moveDrag)
$headerPanel.Add_MouseUp($endDrag)
$headerTitle.Add_MouseDown($startDrag)
$headerTitle.Add_MouseMove($moveDrag)
$headerTitle.Add_MouseUp($endDrag)

$separatorPanel = New-Object System.Windows.Forms.Panel
$separatorPanel.Size = New-Object System.Drawing.Size(418, 1)
$separatorPanel.Location = New-Object System.Drawing.Point(1, 33)
$separatorPanel.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#e5e7eb")
$form.Controls.Add($separatorPanel)

$bodyPanel = New-Object System.Windows.Forms.Panel
$bodyPanel.Size = New-Object System.Drawing.Size(418, 197)
$bodyPanel.Location = New-Object System.Drawing.Point(1, 34)
$bodyPanel.BackColor = [System.Drawing.Color]::White
$form.Controls.Add($bodyPanel)

$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Text = $Title
$titleLabel.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 16, [System.Drawing.FontStyle]::Bold)
$titleLabel.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#243b53")
$titleLabel.AutoSize = $false
$titleLabel.Size = New-Object System.Drawing.Size(380, 36)
$titleLabel.Location = New-Object System.Drawing.Point(20, 30)
$titleLabel.TextAlign = "MiddleCenter"
$bodyPanel.Controls.Add($titleLabel)

$msgLabel = New-Object System.Windows.Forms.Label
$msgLabel.Text = $Message
$msgLabel.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 10)
$msgLabel.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#6b7280")
$msgLabel.AutoSize = $false
$msgLabel.Size = New-Object System.Drawing.Size(380, 40)
$msgLabel.Location = New-Object System.Drawing.Point(20, 72)
$msgLabel.TextAlign = "MiddleCenter"
$bodyPanel.Controls.Add($msgLabel)

$progressBar = New-Object System.Windows.Forms.ProgressBar
$progressBar.Style = "Marquee"
$progressBar.MarqueeAnimationSpeed = 30
$progressBar.Size = New-Object System.Drawing.Size(380, 8)
$progressBar.Location = New-Object System.Drawing.Point(20, 130)
$bodyPanel.Controls.Add($progressBar)

$captionLabel = New-Object System.Windows.Forms.Label
$captionLabel.Text = $Caption
$captionLabel.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 9)
$captionLabel.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#9ca3af")
$captionLabel.AutoSize = $false
$captionLabel.Size = New-Object System.Drawing.Size(380, 24)
$captionLabel.Location = New-Object System.Drawing.Point(20, 148)
$captionLabel.TextAlign = "MiddleCenter"
$bodyPanel.Controls.Add($captionLabel)

$script:startTime = [DateTime]::Now
$script:installerSeen = $false  # 观察到安装器运行后置为 true
$script:closing = $false        # 防止重入

# Form.Close() 也会上报 UserClosing，用已有标志区分定时器关闭；同时屏蔽 Alt+F4。
$form.Add_FormClosing({
    param($sender, $eventArgs)
    if ($eventArgs.CloseReason -eq [System.Windows.Forms.CloseReason]::UserClosing -and -not $script:closing) {
        $eventArgs.Cancel = $true
    }
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 1000

$timer.Add_Tick({
    if ($script:closing) { return }
    $elapsed = ([DateTime]::Now - $script:startTime).TotalSeconds

    # 绝对上限：安装器永久卡死时避免窗口一直挂着。
    if ($elapsed -ge $MaxInstallSeconds) {
        $script:closing = $true
        $timer.Stop()
        $form.Close()
        return
    }

    # 始终未见安装器 —— 说明它没能启动，停止等待。一旦观察到安装器，
    # 就只等它退出（或上面的上限）。
    if (-not $script:installerSeen -and $elapsed -ge $TimeoutSeconds) {
        $script:closing = $true
        $timer.Stop()
        $form.Close()
        return
    }

    # 新应用出现可见主窗口即关闭，独立于安装器轮询，不必等下面的宽限期。
    if (Test-NewAppWindowReady) {
        $script:closing = $true
        $timer.Stop()
        $form.Close()
        return
    }

    # 短暂宽限内先不轮询安装器状态，避免 NSIS 尚未拉起的竞态
    # （Get-Process 返回空 == "安装器已结束" 的误判）。
    if ($elapsed -lt $DetectStartSeconds) {
        return
    }

    # 调用方未传 -InstallerPath 时无进程可轮询，退回硬超时。
    if (-not $installerName) {
        return
    }

    $running = Get-Process -Name $installerName -ErrorAction SilentlyContinue
    if ($running) {
        # 安装器正在工作，保持过渡窗可见。
        $script:installerSeen = $true
        return
    }

    if (-not $script:installerSeen) {
        # 尚未观察到安装器，可能处于过渡窗打开到 NSIS 真正启动之间的空档，
        # 再等一个 tick 而不是提前关闭。
        return
    }

    # 安装器曾在运行、现在已退出 —— 安装完成。多留一会儿让新应用主窗口
    # 绘制并获取焦点，然后关闭。
    $script:closing = $true
    Start-Sleep -Milliseconds $FadeMs
    $timer.Stop()
    $form.Close()
})

$timer.Start()
# 父应用退出后仍保持消息循环，且不把窗口做成模态。
try {
    [System.Windows.Forms.Application]::Run($form)
} finally {
    if ($windowIcon) { $windowIcon.Dispose() }
}
