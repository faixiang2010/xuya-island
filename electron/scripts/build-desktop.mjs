import { spawn } from 'node:child_process'
import { mkdir, rename } from 'node:fs/promises'
import path from 'node:path'
import {
  checkNode,
  requireFile,
  root,
  stopProcessTree,
  waitForExit,
} from '../../backend/scripts/process-utils.mjs'

checkNode()
const mode = process.argv[2]
if (!['pack', 'dist'].includes(mode)) throw new Error('桌面构建模式必须是 pack 或 dist。')
const desktopRoot = path.join(root, 'electron')
const validation = process.argv.includes('--validation')
const outputDirectory = path.join(desktopRoot, 'dist', ...(validation ? ['family-validation'] : []))
const builder = path.join(desktopRoot, 'node_modules/electron-builder/cli.js')
requireFile(builder, '请先执行 npm.cmd --prefix electron ci。')
requireFile(
  path.join(desktopRoot, 'node_modules/electron/dist/electron.exe'),
  '缺少 Electron 二进制，请按 electron/README.md 完成依赖安装。',
)
let active
let interrupted = false
function stop() {
  interrupted = true
  void stopProcessTree(active)
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
async function run(script, args = []) {
  if (interrupted) throw new Error('桌面构建已取消。')
  active = spawn(process.execPath, [script, ...args], {
    cwd: desktopRoot,
    stdio: 'inherit',
    windowsHide: true,
  })
  await waitForExit(active)
}
try {
  await run(path.join(desktopRoot, 'scripts/build-main.mjs'))
  // 每次都从当前源码构建，避免将旧前端或旧 JAR 打入安装包。
  await run(path.join(root, 'backend/scripts/build.mjs'))
  await run(path.join(desktopRoot, 'scripts/prepare-java-runtime.mjs'))
  await run(path.join(desktopRoot, 'scripts/prepare-python-runtime.mjs'))
  // publish=never：制品由 .github/workflows/release.yml 的 action-gh-release 上传，
  // 避免 electron-builder 因存在 publish 配置而要求 GH_TOKEN 并自动发布。
  await run(builder, [
    ...(mode === 'pack' ? ['--dir', '--win'] : ['--win', 'nsis']),
    '--publish',
    'never',
    ...(validation ? ['--config.directories.output=dist/family-validation'] : []),
  ])
  await mkdir(path.join(desktopRoot, 'logs'), { recursive: true })
  await rename(
    path.join(outputDirectory, 'builder-debug.yml'),
    path.join(desktopRoot, 'logs/builder-debug.yml'),
  ).catch((error) => {
    if (error.code !== 'ENOENT') throw error
  })
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await stopProcessTree(active)
}
