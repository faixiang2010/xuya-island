import { spawn } from 'node:child_process'
import { chmod, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { backendRoot, workspaceRoot } from './runtime.mjs'

/**
 * 生成跨平台 JAR 运行包：目标机器只需要 JDK 17+，不依赖 Electron 或源码工具链。
 * 默认先执行完整构建；--reuse-build 复用现有 backend/dist/xuya-backend.jar；--no-zip 只生成目录。
 */

const reuseBuild = process.argv.includes('--reuse-build')
const createZip = !process.argv.includes('--no-zip')
const distRoot = path.join(backendRoot, 'dist')
const packageRoot = path.join(distRoot, 'xuya-portable')
const stagingRoot = path.join(distRoot, '.xuya-portable-staging')
// 压缩包名带版本号，避免不同版本的资产在 Release 页面里同名难以区分。
const { version: portableVersion } = JSON.parse(
  await readFile(path.join(workspaceRoot, 'electron/package.json'), 'utf8'),
)
if (!portableVersion)
  throw new Error('electron/package.json 缺少 version，无法生成带版本的压缩包名。')
const zipFile = path.join(distRoot, `xuya-portable-${portableVersion}.zip`)
const jarFile = path.join(distRoot, 'xuya-backend.jar')

function assertInsideDist(target) {
  const relative = path.relative(distRoot, target)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error(`运行包路径越界：${target}`)
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    child.once('error', reject)
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`命令退出码：${code}`)),
    )
  })
}

function runCapture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.once('error', reject)
    child.once('exit', (code) =>
      code === 0
        ? resolve(stdout)
        : reject(new Error(`命令退出码：${code}${stderr ? `，${stderr.trim()}` : ''}`)),
    )
  })
}

/** 运行包里的文本必须是无 BOM 的 UTF-8，避免 macOS 上出现乱码或脚本首行失效。 */
async function assertUtf8Text(file, { shell = false, lf = false, crlf = false } = {}) {
  const bytes = await readFile(file)
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    throw new Error(`${path.basename(file)} 带有 UTF-8 BOM，请改为无 BOM 的 UTF-8。`)
  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error(`${path.basename(file)} 不是有效的 UTF-8 文本。`)
  }
  if (lf && text.includes('\r'))
    throw new Error(`${path.basename(file)} 必须使用 LF 换行，不能包含 CR。`)
  if (crlf) {
    if (!text.startsWith('@echo off\r\n'))
      throw new Error(`${path.basename(file)} 必须以 @echo off 和 CRLF 换行开头。`)
    if (/(?<!\r)\n/.test(text) || /\r(?!\n)/.test(text))
      throw new Error(`${path.basename(file)} 必须统一使用 CRLF 换行。`)
  }
  if (shell) {
    if (text.includes('\r')) throw new Error(`${path.basename(file)} 必须使用 LF 换行。`)
    if (!text.startsWith('#!/usr/bin/env bash\n'))
      throw new Error(`${path.basename(file)} 必须以 bash shebang 开头。`)
  }
  return text
}

async function assertArchive() {
  const raw =
    process.platform === 'win32'
      ? await runCapture('tar.exe', ['-tf', zipFile], { cwd: workspaceRoot })
      : await runCapture('unzip', ['-Z1', zipFile], { cwd: workspaceRoot })
  const entries = raw.split(/\r?\n/).filter(Boolean)
  if (entries.some((entry) => entry.includes('\\')))
    throw new Error('压缩包内出现了反斜杠路径，macOS 解压会丢失目录结构。')
  const normalized = entries.map((entry) => entry.replace(/^\.\//, ''))
  const required = [
    '.env.example',
    'README.md',
    'config/application-local.example.yml',
    'config/application-local.yml',
    'start.cmd',
    'start.sh',
    'xuya-backend.jar',
  ]
  for (const name of required) {
    if (!normalized.includes(name)) throw new Error(`压缩包缺少 ${name}。`)
  }
}

function findEndOfCentralDirectory(bytes) {
  const start = Math.max(0, bytes.length - 65557)
  for (let offset = bytes.length - 22; offset >= start; offset -= 1)
    if (bytes.readUInt32LE(offset) === 0x06054b50) return offset
  throw new Error('无法定位压缩包中央目录。')
}

/**
 * Windows 生成的 zip 不记录 Unix 权限位，macOS 解压后 start.sh 会变成不可执行。
 * 直接在中央目录写入 0755，避免使用者每次都要手动 chmod。
 */
async function markExecutableInArchive(archive, entry) {
  const bytes = await readFile(archive)
  const eocd = findEndOfCentralDirectory(bytes)
  const total = bytes.readUInt16LE(eocd + 10)
  let offset = bytes.readUInt32LE(eocd + 16)
  let found = false
  for (let index = 0; index < total; index += 1) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50)
      throw new Error(`压缩包目录损坏：${path.relative(workspaceRoot, archive)}`)
    const nameLength = bytes.readUInt16LE(offset + 28)
    const extraLength = bytes.readUInt16LE(offset + 30)
    const commentLength = bytes.readUInt16LE(offset + 32)
    const name = bytes.toString('utf8', offset + 46, offset + 46 + nameLength)
    if (name === entry || name === `./${entry}`) {
      // version made by = Unix 2.0；external attributes = 0100755 << 16。
      bytes.writeUInt16LE(0x0314, offset + 4)
      bytes.writeUInt32LE(0x81ed0000, offset + 38)
      found = true
    }
    offset += 46 + nameLength + extraLength + commentLength
  }
  if (!found) throw new Error(`压缩包缺少 ${entry}，无法写入执行权限。`)
  await writeFile(archive, bytes)
}

async function buildIfNeeded() {
  if (reuseBuild) {
    if (!existsSync(jarFile))
      throw new Error(
        '没有找到 backend/dist/xuya-backend.jar，请先执行 node backend/scripts/build.mjs。',
      )
    console.log('复用现有 backend/dist/xuya-backend.jar。')
    return
  }
  console.log('正在构建最新前后端一体 JAR…')
  await run(process.execPath, [path.join(workspaceRoot, 'backend/scripts/build.mjs')], {
    cwd: workspaceRoot,
  })
}

async function writeLaunchers(root = packageRoot) {
  const startCmd = [
    '@echo off',
    'chcp 65001 >nul',
    'setlocal',
    'cd /d "%~dp0"',
    'if exist ".env" (',
    '  for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do (',
    '    if not "%%a"=="" if not "%%b"=="" set "%%a=%%~b"',
    '  )',
    ')',
    'if defined JAVA_HOME if not exist "%JAVA_HOME%\\bin\\java.exe" if exist "%JAVA_HOME%\\java.exe" set "JAVA_HOME=%JAVA_HOME%\\.."',
    'set "JAVA_EXE=java"',
    'if defined JAVA_HOME (',
    '  if exist "%JAVA_HOME%\\bin\\java.exe" (',
    '    set "JAVA_EXE=%JAVA_HOME%\\bin\\java.exe"',
    '  ) else (',
    '    echo 提示：JAVA_HOME 指向的目录没有 bin\\java.exe，已忽略：%JAVA_HOME%',
    '    echo        如需指定 JDK，请把 JAVA_HOME 设置为 JDK 根目录。',
    '  )',
    ')',
    '"%JAVA_EXE%" -version >nul 2>&1',
    'if errorlevel 1 goto javaMissing',
    'set "JAVA_VERSION="',
    'set "JAVA_VERSION_FILE=%TEMP%\\xuya-java-version-%RANDOM%.txt"',
    '"%JAVA_EXE%" -version > "%JAVA_VERSION_FILE%" 2>&1',
    'for /f "tokens=3" %%v in (\'findstr /i "version" "%JAVA_VERSION_FILE%"\') do set "JAVA_VERSION=%%~v"',
    'del "%JAVA_VERSION_FILE%" >nul 2>&1',
    'if not defined JAVA_VERSION goto javaTooOld',
    'for /f "tokens=1,2 delims=." %%a in ("%JAVA_VERSION%") do (',
    '  set "JAVA_MAJOR=%%a"',
    '  if "%%a"=="1" set "JAVA_MAJOR=%%b"',
    ')',
    'if not defined JAVA_MAJOR goto javaTooOld',
    'if %JAVA_MAJOR% LSS 17 goto javaTooOld',
    'if not defined XUYA_DATA_DIR set "XUYA_DATA_DIR=%CD%\\data"',
    'if not defined XUYA_CONFIG_DIR set "XUYA_CONFIG_DIR=%CD%\\config"',
    'if not defined LOGGING_FILE_NAME set "LOGGING_FILE_NAME=%CD%\\logs\\backend.log"',
    'if not defined XUYA_PORT set "XUYA_PORT=43172"',
    'if not defined XUYA_RUNNER_PORT set "XUYA_RUNNER_PORT=43173"',
    'if not exist "%XUYA_DATA_DIR%" mkdir "%XUYA_DATA_DIR%"',
    'if not exist "%XUYA_CONFIG_DIR%" mkdir "%XUYA_CONFIG_DIR%"',
    'if not exist "%CD%\\logs" mkdir "%CD%\\logs"',
    'if not defined XUYA_BIND_ADDRESS (',
    '  set "XUYA_BIND_ADDRESS=127.0.0.1"',
    '  if exist "%XUYA_CONFIG_DIR%\\network.json" (',
    '    findstr /i /c:"enabled" "%XUYA_CONFIG_DIR%\\network.json" | findstr /i /c:"true" >nul 2>&1 && set "XUYA_BIND_ADDRESS=0.0.0.0"',
    '  )',
    ')',
    'set "XUYA_JAR=%CD%\\xuya-backend.jar"',
    "if exist \"%XUYA_DATA_DIR%\\backend.lock\" powershell -NoProfile -Command \"$jar='%XUYA_JAR%'; Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'java.exe' -and $_.CommandLine -and $_.CommandLine.Contains($jar) } | ForEach-Object { Write-Host ('正在停止上一个叙芽岛实例（PID ' + $_.ProcessId + '）'); Stop-Process -Id $_.ProcessId }\" 2>nul",
    '"%JAVA_EXE%" -Dfile.encoding=UTF-8 -jar "%XUYA_JAR%"',
    'endlocal',
    'exit /b 0',
    ':javaMissing',
    'echo 未找到 Java。请安装 JDK 17+，或设置 JAVA_HOME 后重试。',
    'pause',
    'exit /b 1',
    ':javaTooOld',
    'echo 当前 Java 版本为 %JAVA_VERSION%，需要 JDK 17+。',
    'echo 请安装 JDK 17+，或把 JAVA_HOME 指向 JDK 17+ 后重试。',
    'pause',
    'exit /b 1',
    '',
  ].join('\r\n')

  const startSh = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"',
    'SCRIPT_FILE="$SCRIPT_DIR/$(basename "$0")"',
    'cd "$SCRIPT_DIR"',
    '',
    '# 压缩包已写入执行位；若拷贝方式丢失权限，这里尝试补上，noexec 卷则提示改用 bash 启动。',
    'if [ ! -x "$SCRIPT_FILE" ]; then',
    '  chmod +x "$SCRIPT_FILE" 2>/dev/null || echo "提示：当前磁盘不支持执行权限，之后请用 bash start.sh 启动。"',
    'fi',
    '',
    '# 只导入非空配置：.env 中留空的项不会覆盖系统环境变量。',
    "CR=$'\\r'",
    'unquote() {',
    '  local value="$1" first="${1:0:1}"',
    '  if [ "${#value}" -ge 2 ] && { [ "$first" = \'"\' ] || [ "$first" = "\'" ]; }; then',
    '    value="${value:1:${#value}-2}"',
    '  fi',
    '  printf \'%s\' "$value"',
    '}',
    'if [ -f .env ]; then',
    '  while IFS= read -r line || [ -n "$line" ]; do',
    '    line="${line//$CR/}"',
    '    case "$line" in',
    "      ''|'#'*) continue ;;",
    '    esac',
    '    line="${line#export }"',
    '    case "$line" in',
    '      *=*) ;;',
    '      *) continue ;;',
    '    esac',
    '    key="${line%%=*}"',
    '    value="$(unquote "${line#*=}")"',
    '    [ -z "$value" ] && continue',
    '    case "$value" in',
    '      "~/"*) value="$HOME/${value#\\~/}" ;;',
    '    esac',
    '    value="${value//\\$HOME/$HOME}"',
    '    value="${value//\\$\\{HOME\\}/$HOME}"',
    '    case "$key" in',
    "      ''|[0-9]*|*[!A-Za-z0-9_]*) continue ;;",
    '    esac',
    '    export "$key=$value"',
    '  done < .env',
    'fi',
    '',
    'java_major() {',
    '  local output version major',
    '  output="$("$1" -version 2>&1 || true)"',
    "  version=\"$(printf '%s\\n' \"$output\" | awk -F '\"' '/version/ {print $2; exit}')\"",
    '  [ -n "$version" ] || return 0',
    '  major="${version%%.*}"',
    '  if [ "$major" = "1" ]; then',
    '    major="$(printf \'%s\' "$version" | cut -d. -f2)"',
    '  fi',
    '  case "$major" in',
    "    ''|*[!0-9]*) ;;",
    '    *) printf \'%s\\n\' "$major" ;;',
    '  esac',
    '}',
    '',
    'describe_java() {',
    '  local version',
    '  version="$(printf \'%s\\n\' "$("$1" -version 2>&1 || true)" | awk -F \'"\' \'/version/ {print $2; exit}\')"',
    '  if [ -n "$version" ]; then',
    '    printf \'%s（版本 %s）\' "$1" "$version"',
    '  else',
    '    printf \'%s（无法识别版本）\' "$1"',
    '  fi',
    '}',
    '',
    'usable_java() {',
    '  local candidate="$1" major version',
    '  [ -n "$candidate" ] || return 1',
    '  [ -x "$candidate" ] || return 1',
    '  major="$(java_major "$candidate")"',
    '  case "$major" in',
    "    ''|*[!0-9]*) return 1 ;;",
    '  esac',
    '  [ "$major" -ge 17 ] || return 1',
    '  version="$(printf \'%s\\n\' "$("$candidate" -version 2>&1 || true)" | awk -F \'"\' \'/version/ {print $2; exit}\')"',
    '  JAVA="$candidate"',
    '  JAVA_MAJOR="$major"',
    '  JAVA_VERSION="$version"',
    '  return 0',
    '}',
    '',
    'detect_java_homes() {',
    '  {',
    '    if [ -x /usr/libexec/java_home ]; then',
    "      /usr/libexec/java_home -V 2>/dev/null | awk '/^[[:space:]]/ {print $NF}' | grep '^/' || true",
    '    fi',
    '    ls -d \\',
    '      "$HOME"/Library/Java/JavaVirtualMachines/*/Contents/Home \\',
    '      /Library/Java/JavaVirtualMachines/*/Contents/Home \\',
    '      /opt/homebrew/opt/openjdk*/libexec/openjdk.jdk/Contents/Home \\',
    '      /usr/local/opt/openjdk*/libexec/openjdk.jdk/Contents/Home \\',
    '      /usr/lib/jvm/* 2>/dev/null || true',
    "  } | awk '!seen[$0]++'",
    '}',
    '',
    'JAVA=""',
    'JAVA_VERSION=""',
    'JAVA_MAJOR=""',
    'PATH_JAVA="$(command -v java 2>/dev/null || true)"',
    'PRIMARY=""',
    '# 兼容把 JAVA_HOME 误写成 JDK 的 bin 目录。',
    'if [ -n "${JAVA_HOME:-}" ] && [ ! -x "$JAVA_HOME/bin/java" ] && [ -x "$JAVA_HOME/java" ]; then',
    '  JAVA_HOME="$(cd "$JAVA_HOME/.." && pwd)"',
    '  export JAVA_HOME',
    'fi',
    'if [ -n "${JAVA_HOME:-}" ]; then',
    '  if [ -x "$JAVA_HOME/bin/java" ]; then',
    '    PRIMARY="$JAVA_HOME/bin/java"',
    '  else',
    '    echo "提示：JAVA_HOME 指向的目录没有 bin/java，已忽略：$JAVA_HOME" >&2',
    '  fi',
    'fi',
    'if [ -z "$PRIMARY" ] && [ -n "$PATH_JAVA" ]; then',
    '  PRIMARY="$PATH_JAVA"',
    'fi',
    '',
    'AUTO_SELECTED=""',
    'if ! usable_java "$PRIMARY"; then',
    '  if [ -n "$PATH_JAVA" ] && [ "$PATH_JAVA" != "$PRIMARY" ] && usable_java "$PATH_JAVA"; then',
    '    AUTO_SELECTED="1"',
    '  else',
    '    while IFS= read -r home; do',
    '      [ -n "$home" ] || continue',
    '      if usable_java "$home/bin/java"; then',
    '        AUTO_SELECTED="1"',
    '        break',
    '      fi',
    '    done < <(detect_java_homes)',
    '  fi',
    'fi',
    '',
    'if [ -n "$AUTO_SELECTED" ] && [ -n "$JAVA" ]; then',
    '  echo "已自动选用 JDK 17+：$JAVA（版本 $JAVA_VERSION）"',
    '  echo "如需固定版本，请在 .env 中设置 JAVA_HOME=JDK 根目录。"',
    'fi',
    '',
    'if [ -z "$JAVA" ]; then',
    '  echo "未找到可用的 JDK 17+。" >&2',
    '  if [ -n "${JAVA_HOME:-}" ]; then',
    '    if [ -x "$JAVA_HOME/bin/java" ]; then',
    '      echo "JAVA_HOME 指向的 Java 低于 17：$(describe_java "$JAVA_HOME/bin/java")" >&2',
    '    fi',
    '  else',
    '    echo "JAVA_HOME 未设置。" >&2',
    '  fi',
    '  if [ -n "$PATH_JAVA" ]; then',
    '    echo "PATH 中的 java：$(describe_java "$PATH_JAVA")" >&2',
    '  else',
    '    echo "PATH 中也没有 java。" >&2',
    '  fi',
    '  if [ ! -f .env ]; then',
    '    echo "运行包目录还没有 .env；请执行 cp .env.example .env 后填写 JAVA_HOME（修改 .env.example 不会生效）。" >&2',
    '  fi',
    '  echo "请安装 JDK 17+，或在 .env 中把 JAVA_HOME 指向 JDK 根目录（不是 bin 目录）后重试。" >&2',
    '  exit 1',
    'fi',
    '',
    'export XUYA_DATA_DIR="${XUYA_DATA_DIR:-$PWD/data}"',
    'export XUYA_CONFIG_DIR="${XUYA_CONFIG_DIR:-$PWD/config}"',
    'export LOGGING_FILE_NAME="${LOGGING_FILE_NAME:-$PWD/logs/backend.log}"',
    'export XUYA_PORT="${XUYA_PORT:-43172}"',
    'export XUYA_RUNNER_PORT="${XUYA_RUNNER_PORT:-43173}"',
    '',
    '# 界面里的“局域网共享”写入 config/network.json，重启后生效；.env 或系统环境变量优先。',
    'if [ -z "${XUYA_BIND_ADDRESS:-}" ]; then',
    '  XUYA_BIND_ADDRESS=127.0.0.1',
    '  if [ -f "$XUYA_CONFIG_DIR/network.json" ] && grep -Eq \'"enabled"[[:space:]]*:[[:space:]]*true\' "$XUYA_CONFIG_DIR/network.json"; then',
    '    XUYA_BIND_ADDRESS=0.0.0.0',
    '  fi',
    'fi',
    'export XUYA_BIND_ADDRESS',
    '',
    'mkdir -p "$XUYA_DATA_DIR" "$XUYA_CONFIG_DIR" "$(dirname "$LOGGING_FILE_NAME")"',
    'JAR="$SCRIPT_DIR/xuya-backend.jar"',
    '',
    '# 启动前停止同一数据目录遗留的实例，避免 backend.lock 冲突。',
    'stop_previous_instance() {',
    '  local lock="$XUYA_DATA_DIR/backend.lock" pids="" pid="" alive="" i=0',
    '  if [ -f "$lock" ]; then',
    '    if command -v lsof >/dev/null 2>&1; then',
    '      pids="$(lsof -t "$lock" 2>/dev/null || true)"',
    '    elif [ -x /usr/sbin/lsof ]; then',
    '      pids="$(/usr/sbin/lsof -t "$lock" 2>/dev/null || true)"',
    '    fi',
    '  fi',
    '  if [ -z "$pids" ] && command -v pgrep >/dev/null 2>&1; then',
    '    pids="$(pgrep -f "$JAR" 2>/dev/null || true)"',
    '  fi',
    '  [ -n "$pids" ] || return 0',
    '  for pid in $pids; do',
    '    case "$pid" in',
    "      ''|*[!0-9]*) continue ;;",
    '    esac',
    '    [ "$pid" = "$$" ] && continue',
    '    if kill -0 "$pid" 2>/dev/null; then',
    '      echo "检测到上一个叙芽岛实例（PID $pid），正在停止…"',
    '      kill "$pid" 2>/dev/null || true',
    '    fi',
    '  done',
    '  while [ "$i" -lt 20 ]; do',
    '    alive=""',
    '    for pid in $pids; do',
    '      case "$pid" in',
    "        ''|*[!0-9]*) continue ;;",
    '      esac',
    '      if kill -0 "$pid" 2>/dev/null; then',
    '        alive="1"',
    '      fi',
    '    done',
    '    [ -z "$alive" ] && break',
    '    sleep 0.5',
    '    i=$((i + 1))',
    '  done',
    '  for pid in $pids; do',
    '    case "$pid" in',
    "      ''|*[!0-9]*) continue ;;",
    '    esac',
    '    if kill -0 "$pid" 2>/dev/null; then',
    '      echo "上一个实例（PID $pid）未退出，正在强制结束。"',
    '      kill -9 "$pid" 2>/dev/null || true',
    '    fi',
    '  done',
    '}',
    'stop_previous_instance',
    '',
    'exec "$JAVA" -Dfile.encoding=UTF-8 -jar "$JAR"',
    '',
  ].join('\n')

  await writeFile(path.join(root, 'start.cmd'), startCmd, 'utf8')
  await writeFile(path.join(root, 'start.sh'), startSh, 'utf8')
  // 在 macOS/Linux 上打包时保留执行位；Windows 生成的 zip 不记录该位，脚本首次启动会自行补上。
  if (process.platform !== 'win32') await chmod(path.join(root, 'start.sh'), 0o755)
  await assertUtf8Text(path.join(root, 'start.cmd'), { crlf: true })
  await assertUtf8Text(path.join(root, 'start.sh'), { shell: true })

  const startEnv = [
    '# 复制本文件为 .env 后填写；不要直接修改 .env.example（改了不会生效）。',
    '# 本文件必须保存为 UTF-8（无 BOM）；请保留本行注释，Windows 批处理会跳过 # 开头的行。',
    '# 留空的项不会覆盖已有的系统环境变量。',
    '# Windows PowerShell: Copy-Item .env.example .env',
    '# macOS/Linux:        cp .env.example .env',
    '',
    '# JDK 17+ 根目录（不是 bin 目录）。Windows 例：C:/Java/jdk-17',
    '# Windows 路径请使用正斜杠；start.sh 会把反斜杠当作转义符。',
    '# macOS 例：/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home',
    '# 也可以写 ~/... 或 $HOME/...，启动脚本会展开。',
    '# 留空时由启动脚本自动探测 JDK 17+（macOS 常见安装目录与 PATH）。',
    'JAVA_HOME=',
    '',
    '# 可选：端口',
    '# XUYA_PORT=43172',
    '# XUYA_RUNNER_PORT=43173',
    '',
    '# 可选：局域网共享。界面里保存后需重启；这里显式设置时优先于界面配置',
    '# XUYA_BIND_ADDRESS=127.0.0.1',
    '',
    '# 可选：强制指定 Python 3 可执行文件（不是目录）；也可以启动后在家庭管理中选择',
    '# XUYA_BUNDLED_PYTHON=C:/Python313/python.exe',
    '',
    '# 可选：模型 Key。推荐写在 config/application-local.yml，也可以直接写在这里',
    '# XUYA_MODEL_API_KEY=',
    '# XUYA_MODEL_BASE_URL=https://api.deepseek.com',
    '# XUYA_MODEL_NAME=deepseek-flash',
    '',
    '# 可选：AgentScope JEV / Studio 扩展服务，默认关闭；一般不用改',
    '# XUYA_JEV_ENABLED=false',
    '# XUYA_STUDIO_ENABLED=false',
    '',
    '# 可选：留空时使用运行包目录下的 data/config/logs',
    '# XUYA_DATA_DIR=',
    '# XUYA_CONFIG_DIR=',
    '# LOGGING_FILE_NAME=',
    '',
  ].join('\n')
  await writeFile(path.join(root, '.env.example'), startEnv, 'utf8')
  await assertUtf8Text(path.join(root, '.env.example'), { lf: true })
}

async function writeLocalConfig(root) {
  const example = (
    await readFile(path.join(backendRoot, 'config/application-local.example.yml'), 'utf8')
  ).replace(/\r\n/g, '\n')
  const body = example
    .split(/\r?\n/)
    .filter((line, index) => !(index === 0 && line.startsWith('#')))
    .join('\n')
    .trimStart()
  const content = [
    '# 可直接编辑的本地配置。模型 Key 推荐写在 .env；本文件可保持默认。',
    '# 填写真实 Key 后不要把这个文件发给别人。',
    '',
    body,
    '',
  ].join('\n')
  const file = path.join(root, 'config/application-local.yml')
  await writeFile(file, content, 'utf8')
  await assertUtf8Text(file, { lf: true })
}

async function writeReadme(root = packageRoot) {
  const readme = [
    '# 叙芽岛 · 跨平台运行包',
    '',
    '这是一个只依赖 JDK 的 Java 一体化运行包，不包含 Electron，也不需要 Node、Maven 或源码。',
    'JAR 内已经包含 Java 后端、React 页面、SQLite 迁移、课程资源与 Python 运行辅助脚本。',
    '',
    '## 包内文件',
    '',
    '| 文件 | 用途 |',
    '|---|---|',
    '| `xuya-backend.jar` | 后端、页面、课程和数据库迁移 |',
    '| `start.cmd` | Windows 启动脚本 |',
    '| `start.sh` | macOS / Linux 启动脚本 |',
    '| `.env.example` | JDK、端口、Python、局域网等运行配置模板 |',
    '| `config/application-local.example.yml` | 模型 Key 等应用配置模板 |',
    '| `config/application-local.yml` | 可直接编辑的本地配置；默认无 Key |',
    '| `README.md` | 本说明 |',
    '',
    'macOS 的 `.env.example` 以点开头，Finder 默认隐藏；请在终端用 `ls -a` 查看，或按 `Cmd + Shift + .` 显示隐藏文件。',
    '',
    '所有文本文件都是 UTF-8（无 BOM），`start.sh` 使用 LF 换行。编辑 `.env` 或 YAML 时请保持 UTF-8，不要另存为 UTF-16 或 ANSI。',
    '',
    '| 文件 | 编码 | 换行 | 平台 |',
    '|---|---|---|---|',
    '| `start.sh` | UTF-8 无 BOM | LF | macOS / Linux |',
    '| `start.cmd` | UTF-8 无 BOM | CRLF | Windows |',
    '| `.env` / `.env.example` | UTF-8 无 BOM | LF | 两平台 |',
    '| `application-local*.yml` | UTF-8 无 BOM | LF | 两平台 |',
    '| `README.md` | UTF-8 无 BOM | LF | 两平台 |',
    '| `xuya-backend.jar` | 二进制 | 不适用 | 两平台 |',
    '',
    '在 Windows 上编辑 `.env` 时也建议保存为 UTF-8；`start.sh` 会去掉 CR，但不要保存成 UTF-16 或 ANSI。',
    '',
    '## 运行要求',
    '',
    '| 依赖 | 是否必须 | 说明 |',
    '|---|---|---|',
    '| JDK | 必须 | 17 或更高版本；在 `.env` 的 `JAVA_HOME` 填写根目录，留空时启动脚本会自动探测（多 JDK 时建议填写） |',
    '| Python 3 | 可选 | 课堂里运行代码时需要；只影响代码执行，不影响启动和浏览 |',
    '| 模型 Key | 可选 | 小奇和成人工作台的 AI 需要；写在 `config/application-local.yml` 或 `.env` |',
    '',
    '## 先复制 .env.example 为 .env',
    '',
    '运行包根目录已经有 `.env.example` 示例。先复制出 `.env`，再填写自己的配置：',
    '',
    'Windows PowerShell：',
    '',
    '```powershell',
    'Copy-Item .env.example .env',
    '```',
    '',
    'macOS / Linux：',
    '',
    '```bash',
    'cp .env.example .env',
    '```',
    '',
    '然后用记事本或编辑器打开 `.env`，至少填写 JDK 17+ 的根目录：',
    '',
    '```text',
    'JAVA_HOME=C:/Java/jdk-17',
    '```',
    '',
    'macOS 示例：',
    '',
    '```text',
    'JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home',
    '```',
    '',
    '`JAVA_HOME` 要指向 JDK 根目录，不是 `bin` 目录。机器上有多个 JDK 时，把这里改成你希望叙芽岛使用的那一个；启动脚本会优先使用它，不依赖 PATH 默认版本。路径中可以写 `~/...` 或 `$HOME/...`，启动脚本会展开。',
    '',
    '只有复制出来的 `.env` 才会被读取；直接修改 `.env.example` 不会生效。`.env` 中留空的项（例如 `JAVA_HOME=`）不会覆盖系统已有的环境变量。',
    '',
    '留空时，`start.sh` 会依次检查 `JAVA_HOME`、PATH 中的 `java`，以及 macOS/Linux 常见 JDK 安装目录，自动选择 17 或更高版本；找不到时会打印实际检查到的 java 路径和版本。',
    '',
    '端口、数据目录、局域网共享、Python 和模型 Key 也都可以写在 `.env`，示例文件里有注释。',
    '',
    '`XUYA_JEV_ENABLED` 和 `XUYA_STUDIO_ENABLED` 是 AgentScope 可选扩展服务开关，默认 `false`，普通使用不需要打开。',
    '',
    '## 启动',
    '',
    '### Windows',
    '',
    '双击 `start.cmd`，或在 PowerShell 中执行：',
    '',
    '```powershell',
    '.\\start.cmd',
    '```',
    '',
    '### macOS / Linux',
    '',
    '推荐直接用 bash 启动，不依赖执行权限。外置硬盘、NTFS/exFAT 或 noexec 卷上，`./start.sh` 可能始终报 permission denied，`chmod` 也无效：',
    '',
    '```bash',
    'bash start.sh',
    '```',
    '',
    '如果运行包在支持 Unix 权限的本地磁盘上，也可以直接运行（新压缩包已自带执行位）：',
    '',
    '```bash',
    'chmod +x start.sh',
    './start.sh',
    '```',
    '',
    '也可以手动运行：',
    '',
    '```bash',
    'java -Dfile.encoding=UTF-8 -jar xuya-backend.jar',
    '```',
    '',
    '启动后打开：http://127.0.0.1:43172',
    '',
    '## 端口与环境变量',
    '',
    '优先写在 `.env`；下面的系统环境变量方式适合临时覆盖。',
    '',
    '| 变量 | 默认值 | 说明 |',
    '|---|---|---|',
    '| `XUYA_PORT` | 43172 | 页面和 API 端口 |',
    '| `XUYA_RUNNER_PORT` | 43173 | 历史 Python 资源端口 |',
    '| `XUYA_DATA_DIR` | `./data` | 数据库、作品和运行数据 |',
    '| `XUYA_CONFIG_DIR` | `./config` | 本机配置目录 |',
    '| `LOGGING_FILE_NAME` | `./logs/backend.log` | 后端日志 |',
    '| `XUYA_BIND_ADDRESS` | 127.0.0.1 | 局域网共享时设为 0.0.0.0 |',
    '',
    '端口被占用时直接换一个，例如 Windows：',
    '',
    '```powershell',
    '$env:XUYA_PORT=43272; $env:XUYA_RUNNER_PORT=43273; .\\start.cmd',
    '```',
    '',
    'macOS / Linux：',
    '',
    '```bash',
    'XUYA_PORT=43272 XUYA_RUNNER_PORT=43273 bash start.sh',
    '```',
    '',
    '## 首次使用',
    '',
    '程序没有预置账号或默认密码。首次打开会要求创建超级管理员，之后再到「家庭管理 → 家人账户」添加学习者。',
    '',
    '## Python 配置',
    '',
    '推荐启动后由管理员在「家庭管理 → 运行与共享 → Python 环境」选择解释器，选择结果保存在 `data` 里。',
    '',
    '如果不想打开界面，也可以在 `.env` 中取消注释并填写：',
    '',
    '```text',
    'XUYA_BUNDLED_PYTHON=C:/Python313/python.exe',
    '```',
    '',
    '这里要填 Python 可执行文件（`python.exe` / `python3`），不是安装目录。不装 Python 仍可启动、浏览、编辑和保存，只是不能运行课堂代码。',
    '',
    '## 模型 Key 配置',
    '',
    '运行包已经带一个空的 `config/application-local.yml`，可以直接编辑。只有文件被删除时，才需要从示例复制：',
    '',
    '```bash',
    'cp config/application-local.example.yml config/application-local.yml',
    '```',
    '',
    '在 `config/application-local.yml` 中填写：',
    '',
    '```yaml',
    'xuya:',
    '  model:',
    '    api-key: 你的Key',
    '```',
    '',
    '也可以不建 YAML，直接在 `.env` 中取消注释填写：',
    '',
    '```text',
    'XUYA_MODEL_API_KEY=你的Key',
    'XUYA_MODEL_BASE_URL=https://api.deepseek.com',
    'XUYA_MODEL_NAME=deepseek-flash',
    '```',
    '',
    '不配模型 Key 不影响启动、学习和运行 Python，只影响小奇与成人工作台的 AI。',
    '',
    '## 数据、配置与升级',
    '',
    '- 数据默认写入运行包目录下的 `data`，不要随意删除。',
    '- JDK、端口、数据目录等运行配置写在 `.env`；局域网共享也可以在界面保存（写入 `config/network.json`，重启生效）。',
    '- 模型 Key 放在 `config/application-local.yml`；可以从 `config/application-local.example.yml` 复制后填写。',
    '- 升级时只替换 `xuya-backend.jar`，保留 `data`、`config` 和 `.env` 即可。',
    '- 换机器时复制整个运行包目录，或至少复制 `xuya-backend.jar`、`.env`、`data` 和 `config`。',
    '',
    '## 局域网共享',
    '',
    '可以在「家庭管理 → 局域网共享」里打开并保存。设置会写入 `config/network.json`，**需要重启叙芽岛服务后才生效**；重启时会先自动停止同一数据目录的旧实例。',
    '',
    '也可以在 `.env` 中取消注释并改为 `XUYA_BIND_ADDRESS=0.0.0.0`，或临时设置（显式设置优先于界面保存的 `network.json`）：',
    '',
    '```powershell',
    '# Windows PowerShell',
    '$env:XUYA_BIND_ADDRESS="0.0.0.0"; .\\start.cmd',
    '```',
    '',
    '```bash',
    '# macOS / Linux',
    'XUYA_BIND_ADDRESS=0.0.0.0 bash start.sh',
    '```',
    '',
    '然后用本机局域网地址访问，例如 http://192.168.1.10:43172。主机需要保持运行，防火墙需放行端口。',
    '',
    '## 这个包里没有的',
    '',
    '- **JDK**：需要目标机器自己安装 Java 17+。',
    '- **Python**：课堂运行代码需要主机 Python 3；不装仍可登录、浏览、编辑和保存。',
    '- **模型 Key**：需要自己配置。',
    '- **Electron 桌面外壳**：这是网页运行包，不生成 Windows 安装程序或 macOS App。',
    '',
    '## 常见问题',
    '',
    '| 现象 | 处理 |',
    '|---|---|',
    '| 解压后看不到 `.env.example` | 这是隐藏文件；macOS 用 `ls -a` 或 `Cmd + Shift + .` 查看 |',
    '| `zsh: permission denied: ./start.sh` | 直接改用 `bash start.sh`；外置 NTFS/exFAT 或 noexec 卷不支持执行位，`chmod` 也可能无效 |',
    '| `start.sh` 报 `line 1: ...: command not found` | 文件被保存成了 UTF-16、带 BOM 或换行损坏；从新压缩包重新解压，保持 UTF-8 无 BOM + LF，并用 `bash start.sh` |',
    '| 配置文件打开乱码 | 编辑器另存为 UTF-8（无 BOM）；不要用 ANSI/GBK/UTF-16 |',
    '| 提示“未找到可用的 JDK 17+” | 按提示安装 JDK 17+，或在 `.env` 写 `JAVA_HOME=JDK 根目录`；脚本会同时打印它检查到的 java 路径和版本 |',
    '| 配置了 JDK 仍提示 Java 1.8 | 确认改的是复制出来的 `.env` 而不是 `.env.example`；`JAVA_HOME` 要写 JDK 根目录；留空则自动探测 PATH 和常见安装目录 |',
    '| 机器有多个 JDK | 在 `.env` 写 `JAVA_HOME=想使用的 JDK 17+ 根目录`，启动脚本优先使用它 |',
    '| 启动报“此数据目录已有后端运行” | 脚本会先自动停止同一数据目录的旧实例；若仍出现，确认没有其他副本使用同一 `data` 目录，或手动结束旧进程 |',
    '| 页面打不开 | 看控制台端口提示；确认 `XUYA_PORT` 未被其他程序占用 |',
    '| 课堂提示未配置 Python | 安装 Python 3，或在「家庭管理 → 运行与共享」手动选择解释器 |',
    '| 局域网其他设备打不开 | 在界面保存共享设置后重启服务；脚本会读取 `config/network.json`，`.env` 的 `XUYA_BIND_ADDRESS` 优先；再检查防火墙 |',
    '| 想换数据目录 | 在 `.env` 写 `XUYA_DATA_DIR=新目录` |',
    '',
  ].join('\n')
  await writeFile(path.join(root, 'README.md'), readme, 'utf8')
  await assertUtf8Text(path.join(root, 'README.md'), { lf: true })
}

async function createArchive(sourceRoot) {
  if (!createZip) {
    console.log('已跳过压缩，只生成目录。')
    return
  }
  await rm(zipFile, { force: true })
  if (process.platform === 'win32') {
    // Windows 自带 bsdtar 生成标准 zip，条目使用正斜杠，避免 macOS 解压后目录丢失。
    await run('tar.exe', ['-a', '-c', '-f', zipFile, '.'], { cwd: sourceRoot })
  } else {
    await run('zip', ['-r', '-q', zipFile, '.'], { cwd: sourceRoot })
  }
  await markExecutableInArchive(zipFile, 'start.sh')
  await assertArchive()
  console.log(`已生成压缩包：${path.relative(workspaceRoot, zipFile)}`)
}

async function preparePackage(root) {
  await mkdir(path.join(root, 'config'), { recursive: true })
  await cp(jarFile, path.join(root, 'xuya-backend.jar'))
  await cp(
    path.join(backendRoot, 'config/application-local.example.yml'),
    path.join(root, 'config/application-local.example.yml'),
  )
  await assertUtf8Text(path.join(root, 'config/application-local.example.yml'), { lf: true })
  await writeLocalConfig(root)
  await writeLaunchers(root)
  await writeReadme(root)
}

/** 只覆盖程序文件，保留运行包目录里已有的 data、logs、.env 和本机配置。 */
async function mergeArtifacts(sourceRoot, targetRoot) {
  const artifacts = [
    'xuya-backend.jar',
    'start.cmd',
    'start.sh',
    '.env.example',
    'README.md',
    'config/application-local.example.yml',
  ]
  await mkdir(targetRoot, { recursive: true })
  for (const relative of artifacts) {
    const destination = path.join(targetRoot, relative)
    await mkdir(path.dirname(destination), { recursive: true })
    await cp(path.join(sourceRoot, relative), destination)
  }
  const localConfig = path.join(targetRoot, 'config/application-local.yml')
  if (!existsSync(localConfig)) {
    await cp(path.join(sourceRoot, 'config/application-local.yml'), localConfig)
  }
}

async function main() {
  assertInsideDist(packageRoot)
  assertInsideDist(stagingRoot)
  assertInsideDist(zipFile)
  await buildIfNeeded()
  if (!existsSync(jarFile)) throw new Error('构建后仍未找到 backend/dist/xuya-backend.jar。')
  await rm(stagingRoot, { recursive: true, force: true })
  await mkdir(stagingRoot, { recursive: true })
  try {
    await preparePackage(stagingRoot)
    await createArchive(stagingRoot)
    await mergeArtifacts(stagingRoot, packageRoot)
  } finally {
    await rm(stagingRoot, { recursive: true, force: true })
  }
  console.log(`\n跨平台运行包目录：${path.relative(workspaceRoot, packageRoot)}`)
  console.log('已保留原有 data、logs、.env 和 config/application-local.yml。')
  console.log(
    '目标机器只需要 JDK 17+；Windows 双击 start.cmd，macOS/Linux 执行 bash start.sh（新压缩包已带执行位，也可 ./start.sh）。',
  )
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
