import { spawn } from 'node:child_process'
import path from 'node:path'
import {
  requireFile,
  root,
  stopProcessTree,
  waitForExit,
} from '../../backend/scripts/process-utils.mjs'
await import('./build-main.mjs')
const binary = path.join(root, 'electron/node_modules/electron/dist/electron.exe')
requireFile(binary, '请先执行 npm.cmd --prefix electron ci。')
const child = spawn(binary, ['.', ...process.argv.slice(2)], {
  cwd: path.join(root, 'electron'),
  env: process.env,
  stdio: 'inherit',
  windowsHide: true,
})
process.once('SIGINT', () => {
  void stopProcessTree(child)
})
process.once('SIGTERM', () => {
  void stopProcessTree(child)
})
await waitForExit(child)
