import { cp, mkdir, access, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const frontendDirectory = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const generatedRoot = path.join(root, 'backend/target/generated-resources')
const destination = path.join(generatedRoot, 'runner')
if (path.dirname(path.resolve(destination)) !== generatedRoot)
  throw new Error('运行资源必须写入后端生成目录。')
await rm(destination, { recursive: true, force: true })
if (process.env.XUYA_LEGACY_RUNNER !== '1') {
  console.log('正式教学使用用户选择的主机Python；不打包历史Pyodide资源。')
  process.exit(0)
}
await access(path.join(frontendDirectory, 'node_modules/pyodide/pyodide.mjs'))
await mkdir(destination, { recursive: true })
await cp(path.join(frontendDirectory, 'runner'), destination, { recursive: true })
await cp(path.join(frontendDirectory, 'node_modules/pyodide'), path.join(destination, 'pyodide'), {
  recursive: true,
})
console.log('已准备本地 Python 资源；运行时无需访问 CDN。')
