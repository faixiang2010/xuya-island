import openapiTS, { astToString } from 'openapi-typescript'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { format, resolveConfig } from 'prettier'

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const check = process.argv.includes('--check')
const sourceIndex = process.argv.indexOf('--from-files')
const sourceDirectory =
  sourceIndex >= 0
    ? path.resolve(frontend, process.argv[sourceIndex + 1] || '../backend/target/openapi')
    : undefined
const ports = JSON.parse(
  await readFile(path.join(frontend, '../backend/config/ports.json'), 'utf8').catch(() =>
    readFile(path.join(frontend, '../backend/config/ports.example.json'), 'utf8'),
  ),
)
const base = new URL(process.env.XUYA_OPENAPI_URL || `http://127.0.0.1:${ports.backend}`)
if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname))
  throw new Error('契约只从本机工作台读取，请设置 XUYA_OPENAPI_URL 为隔离测试服务地址。')
const destination = path.join(frontend, 'src/codex/generated')
await mkdir(destination, { recursive: true })
for (const group of ['agent-v1', 'codex-v1']) {
  let schema
  if (sourceDirectory) {
    schema = JSON.parse(await readFile(path.join(sourceDirectory, `${group}.json`), 'utf8'))
  } else {
    const response = await fetch(new URL(`/v3/api-docs/${group}`, base), {
      headers: { Accept: 'application/json', Origin: base.origin },
    })
    if (!response.ok)
      throw new Error(
        `无法读取 ${group} 实际 OpenAPI (${response.status})。先启动隔离后端，不生成猜测契约。`,
      )
    schema = await response.json()
  }
  const target = path.join(destination, `${group}.ts`)
  const generated = await format(astToString(await openapiTS(schema, { alphabetize: true })), {
    ...(await resolveConfig(target)),
    parser: 'typescript',
  })
  if (check) {
    if ((await readFile(target, 'utf8').catch(() => '')) !== generated)
      throw new Error(
        `${group} 契约发生变化，请执行 npm --prefix frontend-react run contract:generate 并审阅类型。`,
      )
  } else await writeFile(target, generated, 'utf8')
  console.log(`${group}: ${check ? '契约一致' : '已从实际后端生成'}`)
}
