import { access, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { readToolchain } from '../../backend/scripts/runtime.mjs'
const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const executableSuffix = process.platform === 'win32' ? '.exe' : ''

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`命令退出码：${code}`)),
    )
  })
}

const { javaHome: javaDirectory } = readToolchain()
if (!javaDirectory)
  throw new Error(
    '未配置 JDK 17+。请在 backend/config/toolchain.json 填写 javaHome，或设置 XUYA_JAVA_HOME。',
  )
const destination = path.join(root, 'electron/build/runtime')
const buildDirectory = path.dirname(destination)
const metadataFile = path.join(buildDirectory, 'runtime-manifest.json')
const modules = 'java.se,jdk.httpserver,jdk.unsupported,jdk.crypto.ec,jdk.charsets,jdk.zipfs'
const release = await readFile(path.join(javaDirectory, 'release'), 'utf8').catch(() => {
  throw new Error('没有找到 JDK，请设置 XUYA_JAVA_HOME 为包含 jlink 的 Java 17+ 目录。')
})
const javaVersion = release.match(/^JAVA_VERSION="([^"]+)"/m)?.[1]
if (!javaVersion || Number(javaVersion.split('.')[0]) < 17)
  throw new Error('桌面运行时必须使用 Java 17+。')
await access(path.join(javaDirectory, `bin/jlink${executableSuffix}`))
const fingerprint = JSON.stringify({
  javaDirectory: path.resolve(javaDirectory),
  release,
  modules,
  options: 'strip-debug,no-man-pages,no-header-files,compress=2',
})
let reusable = false
try {
  await access(path.join(destination, `bin/java${executableSuffix}`))
  reusable = (await readFile(metadataFile, 'utf8')) === fingerprint
} catch {
  /* Missing or older cache needs rebuilding. */
}
if (reusable) {
  console.log(`沿用已核对 JDK 与模块配置的 Java ${javaVersion} 运行时。`)
} else {
  const staging = path.join(buildDirectory, `.runtime-${randomUUID()}`)
  await mkdir(buildDirectory, { recursive: true })
  async function removeOwnedDirectory(directory) {
    if (path.dirname(directory) !== buildDirectory) throw new Error('运行时清理目录越界。')
    const item = await lstat(directory).catch((error) => {
      if (error.code !== 'ENOENT') throw error
    })
    if (item?.isSymbolicLink()) throw new Error('拒绝清理链接形式的运行时目录。')
    await rm(directory, { recursive: true, force: true })
  }
  try {
    await waitForExit(
      spawn(
        path.join(javaDirectory, `bin/jlink${executableSuffix}`),
        [
          '--add-modules',
          modules,
          '--strip-debug',
          '--no-man-pages',
          '--no-header-files',
          '--compress=2',
          '--output',
          staging,
        ],
        { cwd: root, stdio: 'inherit', windowsHide: true },
      ),
    )
    await removeOwnedDirectory(destination)
    await rename(staging, destination)
    await writeFile(metadataFile, fingerprint, 'utf8')
    console.log(`已生成随桌面安装包分发的 Java ${javaVersion} 运行时。`)
  } finally {
    await removeOwnedDirectory(staging)
  }
}
