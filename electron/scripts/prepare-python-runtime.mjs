import { access, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))

// 内置 Windows 官方 embeddable Python：仅标准库，不含 pip、不含 tkinter。
// 叙芽岛课程与 runner.py 只用纯标准库（random/math/json/os/runpy/threading/traceback），
// 绘图通过注入的 xuya.draw/xuya.stage，不依赖 turtle/tkinter，因此 embeddable 完全覆盖。
// 需要第三方库的少数场景由管理员切换到主机自定义 Python（B+C 兼容）。
const pythonVersion = process.env.XUYA_PYTHON_VERSION || '3.12.10'
const fileName = `python-${pythonVersion}-embed-amd64.zip`
// 国内优先使用 npmmirror 镜像，失败回退 python.org 官方源；可用 XUYA_PYTHON_URL 完全覆盖。
const candidates = process.env.XUYA_PYTHON_URL
  ? [process.env.XUYA_PYTHON_URL]
  : [
      `https://registry.npmmirror.com/-/binary/python/${pythonVersion}/${fileName}`,
      `https://www.python.org/ftp/python/${pythonVersion}/${fileName}`,
    ]

const destination = path.join(root, 'electron/build/python')
const buildDirectory = path.dirname(destination)
const metadataFile = path.join(buildDirectory, 'python-manifest.json')

async function removeOwnedDirectory(directory) {
  if (path.dirname(directory) !== buildDirectory) throw new Error('内置 Python 清理目录越界。')
  const item = await lstat(directory).catch((error) => {
    if (error.code !== 'ENOENT') throw error
  })
  if (item?.isSymbolicLink()) throw new Error('拒绝清理链接形式的内置 Python 目录。')
  await rm(directory, { recursive: true, force: true })
}

async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(300000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length < 1024 * 1024) throw new Error('下载内容过小，可能不是有效的 Python 压缩包')
  return bytes
}

async function extract(zipFile, into) {
  await new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Expand-Archive -LiteralPath '${zipFile}' -DestinationPath '${into}' -Force`,
      ],
      { cwd: root, stdio: 'inherit', windowsHide: true },
    )
    child.once('error', reject)
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`解压内置 Python 失败，退出码：${code}`)),
    )
  })
}

const fingerprint = JSON.stringify({ pythonVersion, candidates })
let reusable = false
try {
  await access(path.join(destination, 'python.exe'))
  reusable = (await readFile(metadataFile, 'utf8')) === fingerprint
} catch {
  /* 缺少或版本变化的内置 Python 需要重新准备。 */
}

if (reusable) {
  console.log(`沿用已核对版本的 Python ${pythonVersion} 内置运行时。`)
} else {
  await mkdir(buildDirectory, { recursive: true })
  const staging = path.join(buildDirectory, `.python-${randomUUID()}`)
  const zipFile = path.join(buildDirectory, `.python-${randomUUID()}.zip`)
  let bytes
  let usedUrl
  const failures = []
  for (const url of candidates) {
    try {
      console.log(`下载 Python ${pythonVersion}：${url}`)
      bytes = await download(url)
      usedUrl = url
      break
    } catch (error) {
      failures.push(`${url} → ${error.message}`)
    }
  }
  try {
    if (!bytes) throw new Error(`内置 Python 下载失败：\n${failures.join('\n')}`)
    await writeFile(zipFile, bytes)
    await extract(zipFile, staging)
    await access(path.join(staging, 'python.exe'))
    await removeOwnedDirectory(destination)
    await rename(staging, destination)
    await writeFile(metadataFile, fingerprint, 'utf8')
    console.log(`已生成随桌面安装包分发的 Python ${pythonVersion} 内置运行时（源：${usedUrl}）。`)
  } finally {
    await rm(zipFile, { force: true })
    await removeOwnedDirectory(staging)
  }
}
