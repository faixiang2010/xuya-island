import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 跨平台运行后端所需的路径、JDK/Maven 配置和环境变量准备。
 * JDK 与 Maven 不做自动探测，必须由开发人员在 Git 忽略的 toolchain.json 或环境变量中显式配置。
 */

export const workspaceRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
export const backendRoot = path.join(workspaceRoot, 'backend')
export const toolchainFile = path.join(backendRoot, 'config/toolchain.json')
export const toolchainExampleFile = path.join(backendRoot, 'config/toolchain.example.json')

export function readDefaultPorts() {
  const configured = path.join(backendRoot, 'config/ports.json')
  const file = existsSync(configured)
    ? configured
    : path.join(backendRoot, 'config/ports.example.json')
  return JSON.parse(readFileSync(file, 'utf8'))
}

export function readNetworkSharing() {
  try {
    const value = JSON.parse(readFileSync(path.join(backendRoot, 'config/network.json'), 'utf8'))
    return value.enabled === true
  } catch {
    return false
  }
}

/**
 * 读取本机工具链配置。环境变量优先，其次是 Git 忽略的 toolchain.json。
 * 两者都没有时返回空字符串，由调用方给出明确的配置指引。
 */
export function readToolchain(env = process.env, file = toolchainFile) {
  let config = {}
  try {
    config = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`工具链配置无法读取：${file}`)
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) config = {}
  const pick = (fromEnvironment, fromFile) => {
    const value = fromEnvironment || fromFile
    return typeof value === 'string' ? value.trim() : ''
  }
  return {
    javaHome: pick(env.XUYA_JAVA_HOME, config.javaHome),
    mavenHome: pick(env.XUYA_MAVEN_HOME, config.mavenHome),
  }
}

export function javaExecutableIn(javaHome, platform = process.platform) {
  return javaHome ? path.join(javaHome, 'bin', platform === 'win32' ? 'java.exe' : 'java') : ''
}

export function mavenExecutableIn(mavenHome, platform = process.platform) {
  return mavenHome ? path.join(mavenHome, 'bin', platform === 'win32' ? 'mvn.cmd' : 'mvn') : ''
}

/** 从 `java -version` 文本解析主版本号，兼容 1.8 这种旧格式。 */
export function parseJavaMajor(versionText) {
  const match = /version\s+"(?:1\.)?(\d+)/.exec(String(versionText))
  return match ? Number(match[1]) : 0
}

function javaMajor(executable) {
  try {
    const result = spawnSync(executable, ['-version'], { encoding: 'utf8', timeout: 10000 })
    return parseJavaMajor(`${result.stdout || ''}${result.stderr || ''}`)
  } catch {
    return 0
  }
}

export function resolveJavaExecutable(
  env = process.env,
  platform = process.platform,
  file = toolchainFile,
) {
  const { javaHome } = readToolchain(env, file)
  if (!javaHome)
    throw new Error(
      `未配置 JDK 17+。请复制 ${path.relative(workspaceRoot, toolchainExampleFile)} 为 ${path.relative(workspaceRoot, toolchainFile)} 并填写 javaHome，或设置 XUYA_JAVA_HOME。`,
    )
  const executable = javaExecutableIn(javaHome, platform)
  if (!existsSync(executable)) throw new Error(`JDK 路径无效：${executable}`)
  const major = javaMajor(executable)
  if (major < 17) throw new Error(`需要 Java 17+，当前为 ${major || '未知版本'}：${executable}`)
  return executable
}

export function resolveMavenExecutable(
  env = process.env,
  platform = process.platform,
  file = toolchainFile,
) {
  const { mavenHome } = readToolchain(env, file)
  if (!mavenHome)
    throw new Error(
      `未配置 Maven。请复制 ${path.relative(workspaceRoot, toolchainExampleFile)} 为 ${path.relative(workspaceRoot, toolchainFile)} 并填写 mavenHome，或设置 XUYA_MAVEN_HOME。`,
    )
  const executable = mavenExecutableIn(mavenHome, platform)
  if (!existsSync(executable)) throw new Error(`Maven 路径无效：${executable}`)
  return executable
}

export function mavenArguments(task, env = process.env) {
  switch (task) {
    case 'run':
      return ['-B', 'spring-boot:run']
    case 'test':
      return ['-B', 'test']
    case 'build':
      return env.XUYA_SKIP_TESTS === '1' ? ['-B', 'verify', '-DskipTests'] : ['-B', 'verify']
    case 'clean':
      return ['-B', 'clean']
    default:
      throw new Error(`未知后端任务：${task}`)
  }
}

/** 与旧启动脚本保持一致的数据目录、日志、编码和测试临时目录。 */
export function prepareEnvironment(task, env = process.env) {
  const result = { ...env }
  if (!result.XUYA_DATA_DIR) result.XUYA_DATA_DIR = path.join(backendRoot, 'data')
  if (!result.XUYA_CONFIG_DIR) result.XUYA_CONFIG_DIR = path.join(backendRoot, 'config')
  if (task === 'run') {
    if (!result.XUYA_BIND_ADDRESS)
      result.XUYA_BIND_ADDRESS = readNetworkSharing() ? '0.0.0.0' : '127.0.0.1'
    if (!result.LOGGING_FILE_NAME)
      result.LOGGING_FILE_NAME = path.join(backendRoot, 'logs/backend.log')
    mkdirSync(path.dirname(result.LOGGING_FILE_NAME), { recursive: true })
  }
  const javaOptions = [
    result.JAVA_TOOL_OPTIONS,
    '-Dfile.encoding=UTF-8',
    '-Dstdout.encoding=UTF-8',
    '-Dstderr.encoding=UTF-8',
  ]
  if (['test', 'build', 'clean'].includes(task)) javaOptions.push('-XX:-UsePerfData')
  result.JAVA_TOOL_OPTIONS = javaOptions.filter(Boolean).join(' ')
  if (['test', 'build'].includes(task)) {
    const temporary = path.join(backendRoot, 'target/test-tmp')
    mkdirSync(temporary, { recursive: true })
    result.TEMP = temporary
    result.TMP = temporary
  }
  return result
}

export function runNodeScript(script, env, args = []) {
  const result = spawnSync(process.execPath, [...args, script], {
    cwd: workspaceRoot,
    env,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`资源准备失败：${path.relative(workspaceRoot, script)}`)
}

function quoteForShell(value) {
  return `"${String(value).replaceAll('"', '""')}"`
}

export function spawnMaven(task, env) {
  resolveJavaExecutable(env)
  env.JAVA_HOME = readToolchain(env).javaHome
  const maven = resolveMavenExecutable(env)
  const args = mavenArguments(task, env)
  // Windows 的 mvn.cmd 需要经 shell 启动；macOS 的 mvn 脚本直接执行。
  const child =
    process.platform === 'win32'
      ? spawn([quoteForShell(maven), ...args.map(quoteForShell)].join(' '), {
          cwd: backendRoot,
          env,
          stdio: 'inherit',
          shell: true,
        })
      : spawn(maven, args, { cwd: backendRoot, env, stdio: 'inherit' })
  child.once('error', (error) => {
    console.error(`无法启动 Maven：${error.message}`)
    process.exitCode = 1
  })
  return child
}
