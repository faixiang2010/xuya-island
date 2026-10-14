import { cp, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import {
  backend,
  frontendDirectory,
  checkFrontend,
  managePorts,
  npm,
  root,
  waitForExit,
} from './process-utils.mjs'

checkFrontend()

await managePorts('Guard')

await waitForExit(backend('clean'))
await waitForExit(npm(['run', 'build']))
const generatedRoot = path.join(root, 'backend/target/generated-resources')
const staticDirectory = path.join(generatedRoot, 'static')
if (path.dirname(path.resolve(staticDirectory)) !== generatedRoot)
  throw new Error('页面资源必须写入后端生成目录。')
await rm(staticDirectory, { recursive: true, force: true })
await mkdir(staticDirectory, { recursive: true })
await cp(path.join(frontendDirectory, 'dist'), staticDirectory, { recursive: true })
await waitForExit(backend('build'))
const distributionDirectory = path.join(root, 'backend/dist')
await mkdir(distributionDirectory, { recursive: true })
await cp(
  path.join(root, 'backend/target/xuya-backend.jar'),
  path.join(distributionDirectory, 'xuya-backend.jar'),
)
console.log('\n已构建前后端一体 JAR：backend/dist/xuya-backend.jar\n')
