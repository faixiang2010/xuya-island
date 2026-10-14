import { spawn } from 'node:child_process'
import path from 'node:path'
import { requireFile, root, waitForExit } from '../../backend/scripts/process-utils.mjs'
const compiler = path.join(root, 'electron/node_modules/typescript/lib/tsc.js')
requireFile(compiler, '请先执行 npm.cmd --prefix electron ci，安装桌面 TypeScript 依赖。')
await waitForExit(
  spawn(process.execPath, [compiler, '-p', path.join(root, 'electron/tsconfig.json')], {
    cwd: root,
    windowsHide: true,
    stdio: 'inherit',
  }),
)
