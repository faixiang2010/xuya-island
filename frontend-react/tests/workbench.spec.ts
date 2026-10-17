import { expect, test } from '@playwright/test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { scopedValue, signInAsAdministrator } from './support/session'

test.beforeEach(async ({ page }) => {
  await signInAsAdministrator(page)
})

test('独立聊天无需项目，附件创建持久会话，刷新及再次新聊天保留正确上下文', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/#/codex')
  await expect(page.getByText('正在连接本机码穹…')).toHaveCount(0, { timeout: 30000 })
  await page.locator('.cx-new-chat').click()
  await expect(page.getByText('独立聊天 · 可直接开始，也可选择项目')).toBeVisible()
  await expect(page.getByRole('dialog', { name: '项目与工作区' })).toHaveCount(0)
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/conversations') && response.request().method() === 'POST',
  )
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'independent-context.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('独立会话附件'),
    })
  const response = await created
  expect(response.status()).toBe(201)
  const conversation = (await response.json()) as {
    id: string
    projectId: string
    workspaceId: string
    title: string
  }
  expect(conversation.projectId).toBe('')
  expect(conversation.workspaceId).toBeTruthy()
  await expect(page.locator('.cx-composer').getByText('independent-context.txt')).toBeVisible()
  await page.reload()
  await expect(page.getByText('独立聊天 · 可直接开始，也可选择项目')).toBeVisible()
  await expect(page.getByText('直接输入任务，也可以附加文件和图片。')).toBeVisible()
  await expect(page.locator('.cx-composer-hint')).toContainText('独立工作目录')
  await page.getByLabel('聊天操作', { exact: true }).click()
  await page
    .locator('.cx-header-more')
    .getByRole('button', { name: '置顶聊天', exact: true })
    .click()
  await expect(page.locator('.cx-sidebar-label').filter({ hasText: '置顶' })).toBeVisible()
  await page.reload()
  await expect(page.locator('.cx-sidebar-label').filter({ hasText: '置顶' })).toBeVisible()
  await page.getByLabel('聊天操作', { exact: true }).click()
  await page
    .locator('.cx-header-more')
    .getByRole('button', { name: '归档聊天', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: '开始创造吧。' })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: '已归档聊天', exact: true }).click()
  await expect(
    page.getByRole('dialog', { name: '已归档聊天' }).getByText(conversation.title, { exact: true }),
  ).toBeVisible()
  await page.screenshot({ path: 'test-results/codex-conversation-archives.png', fullPage: true })
  await page.getByRole('button', { name: `恢复聊天 ${conversation.title || '新聊天'}` }).click()
  await expect(
    page.getByRole('dialog', { name: '已归档聊天' }).getByText('暂无归档聊天。'),
  ).toBeVisible()
  await page.getByRole('button', { name: '关闭工具面板' }).click()
  await page
    .locator('.cx-chat-row')
    .getByRole('button', { name: conversation.title || '新聊天', exact: true })
    .click()
  await expect(page.locator('.cx-composer-hint')).toContainText('独立工作目录')
  expect(await scopedValue(page, 'xuya.codex.conversation')).toBe(conversation.id)
  await page.locator('.cx-new-chat').click()
  await page.reload()
  await expect(page.getByRole('heading', { name: '开始创造吧。' })).toBeVisible()
  await page.locator('.cx-composer textarea').fill('保留独立会话的任务草稿')
  await page.keyboard.press('Control+Backquote')
  await expect(page.locator('.cx-composer textarea')).toHaveValue('保留独立会话的任务草稿')
  await page
    .locator('.cx-terminal-pane header')
    .getByRole('button', { name: '新建终端', exact: true })
    .click()
  await expect(page.locator('.cx-terminal-pane header')).toContainText('已连接', { timeout: 30000 })
  await page.locator('.cx-terminal-host .xterm-helper-textarea').focus()
  await page.keyboard.type('echo XUYA_INDEPENDENT_PTY')
  await page.keyboard.press('Enter')
  await expect(
    page
      .locator('.cx-terminal-host .xterm-rows > div')
      .filter({ hasText: /^XUYA_INDEPENDENT_PTY\s*$/ }),
  ).toBeVisible({ timeout: 15000 })
  await page.keyboard.press('Control+Backquote')
  await expect(page.locator('.cx-terminal-pane')).toBeHidden()
  await page.keyboard.press('Control+Backquote')
  await expect(page.locator('.cx-terminal-pane')).toBeVisible()
  await page.getByRole('button', { name: '关闭终端 1', exact: true }).click()
  expect(errors).toEqual([])
})

test('终端可从用户填写的本机目录启动并执行命令', async ({ page }) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'xuya-terminal-cwd-'))
  try {
    await writeFile(path.join(directory, 'terminal-cwd.txt'), 'cwd-ok', 'utf8')
    await page.goto('/#/codex')
    await expect(page.getByText('正在连接本机码穹…')).toHaveCount(0, { timeout: 30000 })
    await page.getByRole('button', { name: '打开终端' }).click()
    await page.getByLabel('终端工作目录').fill(directory)
    await page
      .locator('.cx-terminal-pane header')
      .getByRole('button', { name: '新建终端', exact: true })
      .click()
    await expect(page.locator('.cx-terminal-pane header')).toContainText('已连接', {
      timeout: 30000,
    })
    await expect(page.locator('.cx-terminal-pane header')).toContainText(path.basename(directory))
    await page.locator('.cx-terminal-host .xterm-helper-textarea').focus()
    await page.keyboard.type('Get-ChildItem -Name')
    await page.keyboard.press('Enter')
    await expect(
      page
        .locator('.cx-terminal-host .xterm-rows > div')
        .filter({ hasText: /^terminal-cwd\.txt\s*$/ }),
    ).toBeVisible({ timeout: 15000 })
    await page
      .locator('.cx-terminal-tabs')
      .getByRole('button', { name: /^关闭终端/ })
      .first()
      .click()
    await expect(page.locator('.cx-terminal-tabs')).not.toContainText('终端 1')
  } finally {
    // Shell 退出前会锁住自己的当前目录，Windows 下等待句柄释放后再清理临时目录。
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(
      () => {},
    )
  }
})

test('codex 单入口全屏工作台、十类工具抽屉与三档权限，不等待课堂服务', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  let classroomRequests = 0
  await page.route('**/api/lessons**', (route) => {
    classroomRequests++
    return route.abort()
  })
  await page.setViewportSize({ width: 1862, height: 1104 })
  await page.goto('/#/codex')
  await expect(page.getByTestId('codex-workbench')).toBeVisible()
  await expect(page.getByText('正在连接本机码穹…')).toHaveCount(0, { timeout: 30000 })
  expect(classroomRequests).toBe(0)
  await page.getByRole('button', { name: '帮我批准', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '请我批准 编辑外部文件和使用互联网时始终询问' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '完全访问权限 可访问授权范围内的本机文件与互联网' }),
  ).toBeVisible()
  await page.getByRole('button', { name: '请我批准 编辑外部文件和使用互联网时始终询问' }).click()
  await expect(page.locator('.cx-composer .cx-permission')).toHaveText('请我批准')
  await expect(page.locator('.cx-section-nav')).toHaveCount(0)
  await page.getByRole('button', { name: '工作台工具', exact: true }).click()
  await expect(page.getByRole('menu', { name: '工作台工具菜单' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '编码工作台' })).toBeVisible()
  await page.getByRole('menuitem', { name: '编码工作台' }).click()
  for (const [id, heading] of [
    ['projects', '项目与工作区'],
    ['tasks', '任务与目标'],
    ['changes', '变更审阅'],
    ['agents', '智能体协作'],
    ['plugins', '技能与插件'],
    ['outputs', '输出与来源'],
    ['memory', '记忆与上下文'],
    ['automations', '自动化'],
    ['settings', '设置与观测'],
  ] as const) {
    await page.getByRole('button', { name: '工作台工具', exact: true }).click()
    await page.getByRole('menuitem', { name: heading, exact: true }).click()
    await expect(page.getByRole('dialog', { name: heading, exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    await expect(page.getByTestId('codex-composer')).toBeVisible()
    await page.getByRole('button', { name: '关闭工具面板' }).click()
  }
  await page.goto('/#/codex')
  await page.screenshot({ path: 'test-results/codex-desktop.png', fullPage: true })
  await page.getByRole('button', { name: '切换深色主题' }).click()
  await expect(page.getByTestId('codex-workbench')).toHaveAttribute('data-theme', 'dark')
  await page.screenshot({ path: 'test-results/codex-desktop-dark.png', fullPage: true })
  await page.getByRole('button', { name: '切换浅色主题' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: '打开项目导航' })).toBeVisible()
  await page.getByRole('button', { name: '打开项目导航' }).click()
  await expect(page.getByRole('complementary', { name: '码穹 项目与聊天' })).toBeVisible()
  await expect(page.getByRole('button', { name: '工作台工具', exact: true })).toBeVisible()
  await page.locator('.cx-sidebar-backdrop').click({ position: { x: 350, y: 300 } })
  await page.locator('.cx-sidebar').evaluate(async (element) => {
    await Promise.all(
      element.getAnimations().map((animation) => animation.finished.catch(() => {})),
    )
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/codex-mobile.png', fullPage: true })
  expect(errors).toEqual([])
})

test('真实项目、隔离工作区、附件和计划保存到持久 REST，未配置模型不会调用付费服务', async ({
  page,
}) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'xuya-codex-e2e-'))
  try {
    await writeFile(path.join(directory, 'README.md'), '# Codex 本机测试\n', 'utf8')
    await page.goto('/#/codex?panel=projects')
    await page.getByLabel('项目名称', { exact: true }).fill('Codex隔离验证')
    await page.getByLabel('本机目录', { exact: true }).fill(directory)
    await page.getByLabel('默认工作区').selectOption('isolated-copy')
    await page.getByRole('button', { name: '注册', exact: true }).click()
    await expect(page.getByRole('heading', { name: '创建隔离工作区' })).toBeVisible()
    await page.getByLabel('工作区类型').selectOption('isolated-copy')
    await page.getByRole('button', { name: '创建工作区', exact: true }).click()
    await expect(page.locator('.cx-workspace-list .cx-card')).toHaveCount(1, { timeout: 30000 })
    await page.getByRole('button', { name: '文件编辑器', exact: true }).click()
    await page.getByRole('button', { name: 'README.md', exact: true }).click()
    await expect(page.getByRole('textbox', { name: '编辑 README.md', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '工作区', exact: true }).click()
    await page.getByRole('button', { name: '开始聊天', exact: true }).click()
    await expect(page.locator('.cx-topbar')).toContainText('Codex隔离验证')
    await page.getByTestId('codex-composer').fill('这段草稿应在附加文件后保留。')
    await page.locator('input[type=file]:not([webkitdirectory])').setInputFiles({
      name: '上下文.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('只有本机测试内容'),
    })
    await expect(page.locator('.cx-draft-attachments')).toContainText('上下文.txt')
    await expect(page.getByTestId('codex-composer')).toHaveValue('这段草稿应在附加文件后保留。')
    await page.getByRole('button', { name: '工作台工具', exact: true }).click()
    await page.getByRole('menuitem', { name: '任务与目标', exact: true }).click()
    await page.getByRole('button', { name: '添加步骤', exact: true }).click()
    await page.getByLabel('步骤 1', { exact: true }).fill('验证真实文件和上下文')
    await page.getByRole('button', { name: '保存计划', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('计划已保存')
    await page.reload()
    await expect(page.getByLabel('步骤 1', { exact: true })).toHaveValue('验证真实文件和上下文')
    await page.getByRole('button', { name: '关闭工具面板' }).click()
    await page.getByRole('button', { name: '工作台工具', exact: true }).click()
    await page.getByRole('menuitem', { name: '记忆与上下文', exact: true }).click()
    await expect(page.getByRole('button', { name: '保存记忆', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '关闭工具面板' }).click()
    await page.getByRole('button', { name: '打开终端' }).click()
    await page
      .locator('.cx-terminal-pane header')
      .getByRole('button', { name: '新建终端', exact: true })
      .click()
    await expect(page.locator('.cx-terminal-pane header')).toContainText('已连接', {
      timeout: 30000,
    })
    await page.locator('.cx-terminal-host .xterm-helper-textarea').focus()
    await page.keyboard.type('echo XUYA_PTY_OK')
    await page.keyboard.press('Enter')
    await expect(
      page.locator('.cx-terminal-host .xterm-rows > div').filter({ hasText: /^XUYA_PTY_OK\s*$/ }),
    ).toBeVisible({ timeout: 15000 })
    // 故意在工作区恢复请求未结束时打开终端，验证不会创建另一个 scratch 会话。
    const originalChatId = await scopedValue(page, 'xuya.codex.conversation')
    let unexpectedChats = 0
    page.on('request', (request) => {
      if (request.url().endsWith('/api/v1/conversations') && request.method() === 'POST')
        unexpectedChats++
    })
    await page.route('**/api/v1/conversations/*/snapshot', async (route) => {
      const response = await route.fetch()
      await new Promise((resolve) => setTimeout(resolve, 300))
      await route.fulfill({ response })
    })
    await page.reload()
    await page.getByRole('button', { name: '打开终端' }).click()
    await expect(page.locator('.cx-terminal-pane header')).toContainText('已连接', {
      timeout: 30000,
    })
    expect(unexpectedChats).toBe(0)
    expect(await scopedValue(page, 'xuya.codex.conversation')).toBe(originalChatId)
    await expect(page.getByRole('button', { name: '终端 1', exact: true })).toBeVisible()
    await page.locator('.cx-terminal-host .xterm-helper-textarea').focus()
    await page.keyboard.type('echo XUYA_PTY_REATTACH')
    await page.keyboard.press('Enter')
    await expect(
      page
        .locator('.cx-terminal-host .xterm-rows > div')
        .filter({ hasText: /^XUYA_PTY_REATTACH\s*$/ }),
    ).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: '关闭终端 1', exact: true }).click()
    await expect(page.locator('.cx-terminal-tabs')).not.toContainText('终端 1')
    await page.screenshot({ path: 'test-results/codex-durable-plan.png', fullPage: true })
  } finally {
    if (
      path.dirname(directory) !== os.tmpdir() ||
      !path.basename(directory).startsWith('xuya-codex-e2e-')
    )
      throw new Error('测试项目清理越界')
    await rm(directory, { recursive: true, force: true })
  }
})

test('OpenAPI 两个版本组生成的类型与后端契约一致', async () => {
  const frontend = path.resolve(process.cwd())
  execFileSync(
    process.execPath,
    [path.join(frontend, 'scripts/generate-codex-contract.mjs'), '--check'],
    {
      cwd: frontend,
      env: { ...process.env, XUYA_OPENAPI_URL: process.env.XUYA_TEST_URL },
      stdio: 'pipe',
      windowsHide: true,
    },
  )
})

test('会话可从侧栏重命名和删除，删除后列表与后端一并清理', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/#/codex')
  await expect(page.getByText('正在连接本机码穹…')).toHaveCount(0, { timeout: 30000 })
  // 前面用例已在共享临时库创建会话；对侧栏第一条做重命名与删除。
  const row = page.locator('.cx-chat-row').first()
  await expect(row.locator('.cx-recent-chat')).toBeVisible({ timeout: 15000 })

  await row.locator('.cx-chat-actions summary').click()
  await row.locator('.cx-chat-actions').getByRole('button', { name: '重命名' }).click()
  await row.locator('.cx-chat-rename input').fill('我的第一个会话')
  await row.locator('.cx-chat-rename button[aria-label="保存聊天名称"]').click()
  await expect(page.locator('.cx-chat-row').filter({ hasText: '我的第一个会话' })).toBeVisible()

  const renamed = page.locator('.cx-chat-row').filter({ hasText: '我的第一个会话' })
  await renamed.locator('.cx-chat-actions summary').click()
  page.once('dialog', (dialog) => dialog.accept())
  await renamed.locator('.cx-chat-actions').getByRole('button', { name: '删除聊天' }).click()
  await expect(page.locator('.cx-chat-row').filter({ hasText: '我的第一个会话' })).toHaveCount(0)
  expect(errors).toEqual([])
})
