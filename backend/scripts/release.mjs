import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { root } from './process-utils.mjs'

/**
 * 发布入口：确认标签提交已通过 Verify 后再打标签推送，避免 Release 门禁拦截。
 *
 * 用法：
 *   node backend/scripts/release.mjs v0.1.0
 *   node backend/scripts/release.mjs v0.1.0 --force --proxy=http://127.0.0.1:12334
 *
 * 选项：
 *   --force            远端已有同名标签时删除重建（会重新触发 Release）
 *   --timeout=分钟     等待 Verify 的最长时间，默认 60
 *   --proxy=URL        Git 推送与 GitHub API 使用的代理，也可用 XUYA_HTTPS_PROXY
 */

const POLL_INTERVAL_MS = 30_000
const apiBase = 'https://api.github.com'

function fail(message) {
  throw new Error(message)
}

function parseArguments(argv) {
  const options = { tag: '', force: false, timeoutMinutes: 60, proxy: '' }
  for (const argument of argv) {
    if (argument.startsWith('--timeout='))
      options.timeoutMinutes = Number(argument.slice('--timeout='.length))
    else if (argument.startsWith('--proxy=')) options.proxy = argument.slice('--proxy='.length)
    else if (argument === '--force') options.force = true
    else if (!argument.startsWith('--')) options.tag = argument
    else fail(`未知选项：${argument}`)
  }
  if (!options.tag) fail('请给出标签名，例如：node backend/scripts/release.mjs v0.1.0')
  if (!Number.isFinite(options.timeoutMinutes) || options.timeoutMinutes <= 0)
    fail('--timeout 需要是正整数分钟')
  options.proxy ||= process.env.XUYA_HTTPS_PROXY || ''
  return options
}

/** 执行 git 或 curl，失败时抛出带命令输出的错误。 */
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  })
  if (result.error) fail(`无法执行 ${command}：${result.error.message}`)
  if (result.status !== 0)
    fail(`${command} ${args.join(' ')} 失败：\n${(result.stderr || result.stdout || '').trim()}`)
  return String(result.stdout || '').trim()
}

function git(args, options = {}) {
  return run('git', args, options)
}

/** https 与 ssh 两种远程地址都解析出 owner/repo。 */
function readRepository() {
  const remote = git(['remote', 'get-url', 'origin'])
  const match =
    remote.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/) ||
    remote.match(/^([^/]+)\/(.+?)(?:\.git)?$/)
  if (!match) fail(`无法从远程地址解析仓库：${remote}`)
  return `${match[1]}/${match[2]}`
}

/** 有代理时用 curl，避免 Node 内置 fetch 忽略代理设置。 */
function requestJson(url, proxy) {
  const headers = ['Accept: application/vnd.github+json', 'User-Agent: xuya-ci']
  if (process.env.GH_TOKEN) headers.push(`Authorization: Bearer ${process.env.GH_TOKEN}`)
  if (proxy) {
    const curl = process.platform === 'win32' ? 'curl.exe' : 'curl'
    const body = run(curl, ['-sS', '--max-time', '60', '--proxy', proxy, ...headers.flatMap((h) => ['-H', h]), url])
    return parseJson(body, url)
  }
  return fetchJson(url, headers, url)
}

async function fetchJson(url, headers, source) {
  const response = await fetch(url, {
    headers: Object.fromEntries(headers.map((line) => line.split(/:\s*/, 2))),
  })
  if (!response.ok) fail(`请求 ${source} 失败：HTTP ${response.status}`)
  return JSON.parse(await response.text())
}

function parseJson(body, source) {
  try {
    return JSON.parse(body)
  } catch {
    fail(`接口 ${source} 返回的不是 JSON，可能被网络拦截：${body.slice(0, 200)}`)
  }
}

function verifyVersion(tag) {
  const file = path.join(root, 'electron/package.json')
  const { version } = JSON.parse(readFileSync(file, 'utf8'))
  if (!version) fail('electron/package.json 缺少 version，无法校验标签')
  if (`v${version}` !== tag)
    fail(`标签 ${tag} 与 electron/package.json 的版本 ${version} 不一致，应为 v${version}`)
}

/** 需要访问远端的 git 命令统一带上代理参数。 */
function proxyArguments(proxy) {
  return proxy ? ['-c', `http.proxy=${proxy}`, '-c', `https.proxy=${proxy}`] : []
}

function ensurePushed(proxy) {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch === 'HEAD') fail('当前处于游离 HEAD，请先切到分支再发布')
  const head = git(['rev-parse', 'HEAD'])
  const remote = git([...proxyArguments(proxy), 'ls-remote', 'origin', `refs/heads/${branch}`])
  if (!remote) fail(`分支 ${branch} 尚未推送到 origin，请先推送代码`)
  const sha = remote.split(/\s+/)[0]
  if (sha !== head)
    fail(`本地 ${branch}（${head.slice(0, 7)}）与远端（${sha.slice(0, 7)}）不一致，请先推送代码`)
  return { branch, sha: head }
}

async function verifyRun(sha, repository, proxy) {
  const url = `${apiBase}/repos/${repository}/actions/workflows/verify.yml/runs?head_sha=${sha}&per_page=20`
  const response = await requestJson(url, proxy)
  const runs = Array.isArray(response.workflow_runs) ? response.workflow_runs : []
  return runs[0] || null
}

async function waitForVerify(sha, repository, proxy, timeoutMinutes) {
  const deadline = Date.now() + timeoutMinutes * 60_000
  let announced = false
  while (true) {
    const run = await verifyRun(sha, repository, proxy)
    if (run) {
      if (run.conclusion === 'success') {
        console.log(`Verify 已通过：${run.html_url}`)
        return
      }
      if (run.status === 'completed') {
        fail(
          `提交 ${sha.slice(0, 7)} 的 Verify 结论是 ${run.conclusion}，未通过不能发布：${run.html_url}`,
        )
      }
      if (!announced) {
        console.log(`等待 Verify 完成（当前 ${run.status}）：${run.html_url}`)
        announced = true
      }
    } else if (!announced) {
      console.log('提交已推送，但暂未查到 Verify 运行记录，继续等待。')
      announced = true
    }
    if (Date.now() >= deadline) {
      fail(`等待 Verify 超时（${timeoutMinutes} 分钟），请稍后重试或到 Actions 页面确认`)
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
}

function prepareTag(tag, force, proxy) {
  const proxyArgs = proxyArguments(proxy)
  const remoteTag = git([...proxyArgs, 'ls-remote', '--tags', 'origin', `refs/tags/${tag}`])
  if (remoteTag) {
    if (!force)
      fail(`远端已存在标签 ${tag}；确认要重建并重新触发 Release 时加 --force`)
    git([...proxyArgs, 'push', 'origin', `:refs/tags/${tag}`])
    console.log(`已删除远端旧标签 ${tag}`)
  }
  const localTag = git(['tag', '--list', tag])
  if (localTag) git(['tag', '-d', tag])
  git(['tag', '-a', tag, '-m', `叙芽岛 ${tag.slice(1)}`])
  git([...proxyArgs, 'push', 'origin', tag])
  console.log(`已推送标签 ${tag}，Release 工作流开始构建`)
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  verifyVersion(options.tag)
  const { sha } = ensurePushed(options.proxy)
  console.log(`发布提交 ${sha.slice(0, 7)}，标签 ${options.tag}`)
  const repository = readRepository()
  await waitForVerify(sha, repository, options.proxy, options.timeoutMinutes)
  prepareTag(options.tag, options.force, options.proxy)
  console.log(`查看构建：https://github.com/${repository}/actions/workflows/release.yml`)
}

main().catch((error) => {
  console.error(`发布失败：${error.message}`)
  process.exitCode = 1
})
