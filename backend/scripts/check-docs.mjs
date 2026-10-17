import { readdir, readFile, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const files = [
  'README.md',
  'AGENTS.md',
  'backend/README.md',
  'frontend-react/README.md',
  'electron/README.md',
]
async function collect(directory) {
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.posix.join(directory, entry.name)
    if (entry.isDirectory()) {
      await collect(relative)
    } else if (entry.name.endsWith('.md')) {
      files.push(relative)
    }
  }
}
await collect('docs')
let errors = 0
let local = 0
let links = 0
for (const file of files) {
  const content = await readFile(path.join(root, file), 'utf8')
  for (const match of content.matchAll(/!?\[[^\]\n]*\]\(([^\s)]+)\)/g)) {
    const url = match[1]
    if (url.startsWith('#') || /^[a-z]+:/i.test(url)) continue
    const destination = path.resolve(root, path.dirname(file), decodeURI(url.split('#')[0]))
    const relative = path.relative(root, destination).replaceAll('\\', '/')
    links++
    try {
      await access(destination)
    } catch {
      // Local-only workspace content (.agent/) is absent on a fresh checkout.
      if (relative.startsWith('.agent/')) {
        local++
      } else {
        errors++
        console.error(`${file}: 缺少链接目标 ${url}`)
      }
    }
  }
}
console.log(
  `文档 ${files.length} 份，本地链接 ${links} 个，缺失 ${errors} 个，本机工作区缺失 ${local} 个。`,
)
process.exitCode = errors ? 1 : 0
