import { lstat, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { runPorts } from './ports.mjs'
import { workspaceRoot } from './runtime.mjs'

/** 所有平台统一的中间产物清理入口；默认保留 Electron 构建产物，--all 时一并清理。 */

const targets = [
  'backend/target',
  'backend/.tmp',
  'frontend-react/test-results',
  'frontend-react/playwright-report',
  'frontend-react/coverage',
  'frontend-react/.tmp',
  'frontend-react/node_modules/.vite',
  'frontend-react/node_modules/.vite-temp',
]
if (process.argv.includes('--all')) targets.push('electron/build', 'electron/.tmp')

async function rejectLinks(target) {
  const info = await lstat(target)
  if (info.isSymbolicLink()) throw new Error(`拒绝清理链接目录：${target}`)
  if (!info.isDirectory()) return
  for (const entry of await readdir(target, { withFileTypes: true })) {
    const child = path.join(target, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`拒绝清理包含链接的目录：${child}`)
    if (entry.isDirectory()) await rejectLinks(child)
  }
}

async function main() {
  try {
    await runPorts('Guard')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(
      message.includes('Close the project backend or desktop')
        ? '请先关闭本项目后端或桌面，再清理。'
        : message,
    )
    process.exitCode = 1
    return
  }
  for (const relative of targets) {
    const target = path.resolve(workspaceRoot, relative)
    const inside = path.relative(workspaceRoot, target)
    if (!inside || inside.startsWith('..') || path.isAbsolute(inside))
      throw new Error(`清理路径越界：${relative}`)
    try {
      await lstat(target)
    } catch (error) {
      if (error.code === 'ENOENT') continue
      throw error
    }
    await rejectLinks(target)
    await rm(target, { recursive: true, force: true })
    console.log(`Cleaned ${relative}`)
  }
  console.log(
    'Cleanup complete. Source files, dependencies, learning data, logs, and dist packages were preserved.',
  )
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
