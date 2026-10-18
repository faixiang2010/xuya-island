import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  classifyOwner,
  parseLsofPids,
  parseProcessList,
  parseWindowsRows,
  selectPorts,
} from './ports.mjs'
import {
  javaExecutableIn,
  mavenArguments,
  mavenExecutableIn,
  parseJavaMajor,
  readToolchain,
  resolveJavaExecutable,
  resolveMavenExecutable,
} from './runtime.mjs'

/** 用固定文本模拟 macOS 的 lsof/ps 与 Windows PowerShell 输出，不依赖真实系统进程。 */

test('解析 java -version 主版本', () => {
  assert.equal(parseJavaMajor('java version "17.0.14" 2025-01-21 LTS'), 17)
  assert.equal(parseJavaMajor('openjdk version "21.0.2" 2024-01-16'), 21)
  assert.equal(parseJavaMajor('java version "1.8.0_401"'), 8)
  assert.equal(parseJavaMajor('not a version'), 0)
})

test('识别本工程 macOS 后端进程', () => {
  const root = '/Volumes/storage/xuya-island'
  const javaCommand = `/usr/bin/java -classpath ${root}/backend/target/classes:${root}/backend/target/dependency com.xuya.island.XuyaIslandApplication`
  assert.equal(classifyOwner(javaCommand, root), 'backend')
  assert.equal(
    classifyOwner(`/usr/bin/java -jar ${root}/backend/dist/xuya-backend.jar`, root),
    'backend',
  )
  assert.equal(classifyOwner(`node ${root}/backend/scripts/backend-task.mjs run`, root), 'backend')
})

test('识别本工程 macOS 前端进程', () => {
  const root = '/Volumes/storage/xuya-island'
  const vite = `node ${root}/frontend-react/node_modules/vite/bin/vite.js --host 127.0.0.1`
  assert.equal(classifyOwner(vite, root), 'frontend')
})

test('不误认其他工程或无关 Java 进程', () => {
  const root = '/Volumes/storage/xuya-island'
  assert.equal(classifyOwner('/usr/bin/java -jar /tmp/other.jar', root), null)
  assert.equal(
    classifyOwner(
      '/usr/bin/java -classpath /Volumes/storage/other/backend/target/classes com.xuya.island.XuyaIslandApplication',
      root,
    ),
    null,
  )
  assert.equal(classifyOwner(`node ${root}/frontend-react/node_modules/other/index.js`, root), null)
})

test('兼容 Windows 反斜杠命令行', () => {
  const root = 'D:\\electron\\xuya-island'
  assert.equal(
    classifyOwner(
      `java.exe -classpath D:\\electron\\xuya-island\\backend\\target\\classes com.xuya.island.XuyaIslandApplication`,
      root,
    ),
    'backend',
  )
})

test('解析 lsof 监听进程号', () => {
  const output = ['p1234', 'cjava', 'f18', 'tIPv4', 'p5678', 'cnode', 'f21', 'tIPv6'].join('\n')
  assert.deepEqual(parseLsofPids(output), [1234, 5678])
  assert.deepEqual(parseLsofPids(''), [])
})

test('解析 Windows PowerShell 进程 JSON', () => {
  assert.deepEqual(
    parseWindowsRows(
      JSON.stringify([
        { port: 43172, pid: 123, command: 'java -jar xuya-backend.jar' },
        { port: 43171, pid: 0, command: 'ignored' },
      ]),
    ),
    [{ port: 43172, pid: 123, command: 'java -jar xuya-backend.jar' }],
  )
  assert.deepEqual(parseWindowsRows(''), [])
  assert.equal(parseWindowsRows(JSON.stringify({ pid: 9, command: 'node' })).length, 1)
})

test('从 ps 全量进程表识别本工程后端与前端', () => {
  const root = '/Volumes/storage/xuya-island'
  const output = [
    `  101 /usr/bin/java -classpath ${root}/backend/target/classes com.xuya.island.XuyaIslandApplication`,
    `  202 node ${root}/frontend-react/node_modules/vite/bin/vite.js --host 127.0.0.1`,
    '  303 /usr/bin/java -jar /tmp/other.jar',
    `  404 node ${root}/frontend-react/node_modules/other/index.js`,
    '',
  ].join('\n')
  assert.deepEqual(
    parseProcessList(output, root).map((item) => [item.pid, item.kind]),
    [
      [101, 'backend'],
      [202, 'frontend'],
    ],
  )
})

test('工具链配置由环境变量覆盖本机文件', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'xuya-toolchain-'))
  try {
    const file = path.join(directory, 'toolchain.json')
    writeFileSync(file, JSON.stringify({ javaHome: ' /opt/jdk-17 ', mavenHome: '/opt/maven' }))
    assert.deepEqual(readToolchain({}, file), {
      javaHome: '/opt/jdk-17',
      mavenHome: '/opt/maven',
    })
    assert.deepEqual(readToolchain({ XUYA_JAVA_HOME: '/env/jdk' }, file), {
      javaHome: '/env/jdk',
      mavenHome: '/opt/maven',
    })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('缺少工具链配置时给出明确错误', () => {
  const missing = path.join(tmpdir(), `xuya-missing-${process.pid}.json`)
  assert.throws(() => resolveJavaExecutable({}, 'darwin', missing), /未配置 JDK 17\+/)
  assert.throws(() => resolveMavenExecutable({}, 'darwin', missing), /未配置 Maven/)
})

test('按平台拼接 JDK 与 Maven 可执行文件', () => {
  assert.equal(javaExecutableIn('/opt/jdk-17', 'darwin'), path.join('/opt/jdk-17', 'bin/java'))
  assert.equal(javaExecutableIn('C:/jdk-17', 'win32'), path.join('C:/jdk-17', 'bin/java.exe'))
  assert.equal(mavenExecutableIn('/opt/maven', 'darwin'), path.join('/opt/maven', 'bin/mvn'))
  assert.equal(mavenExecutableIn('C:/maven', 'win32'), path.join('C:/maven', 'bin/mvn.cmd'))
})

test('端口被占用时向后选择空闲端口', async () => {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const occupied = server.address().port
  try {
    const [selected] = await selectPorts([occupied])
    assert.notEqual(selected, occupied)
    assert.ok(selected > occupied && selected <= occupied + 100)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('构建任务参数保持既有语义', () => {
  assert.deepEqual(mavenArguments('run'), ['-B', 'spring-boot:run'])
  assert.deepEqual(mavenArguments('test'), ['-B', 'test'])
  assert.deepEqual(mavenArguments('build', {}), ['-B', 'verify'])
  assert.deepEqual(mavenArguments('build', { XUYA_SKIP_TESTS: '1' }), [
    '-B',
    'verify',
    '-DskipTests',
  ])
  assert.deepEqual(mavenArguments('clean'), ['-B', 'clean'])
})
