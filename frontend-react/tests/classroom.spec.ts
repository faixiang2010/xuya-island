import { expect, test, type Page, type Route } from '@playwright/test'
import { administratorHeaders, signInAsAdministrator, scopedValue } from './support/session'

test.beforeEach(async ({ page }) => {
  await signInAsAdministrator(page)
})

async function edit(page: Page, code: string) {
  await expect(page.locator('.monaco-editor')).toBeVisible()
  const editor = page.getByRole('textbox', { name: 'Python 代码编辑器', exact: true })
  await editor.focus()
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.evaluate((text) => navigator.clipboard.writeText(text), code)
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Control+V')
  await expect
    .poll(() =>
      page.evaluate(() => {
        const id = location.hash.split('/classroom/')[1].split('?')[0]
        const key = Object.keys(localStorage).find((item) => item.endsWith(`xuya:draft:${id}`))
        return JSON.parse((key ? localStorage.getItem(key) : null) ?? '{}').code
      }),
    )
    .toBe(code)
}

async function run(page: Page) {
  const button = page.getByRole('button', { name: '▶ 运行', exact: true })
  await expect(button).toBeEnabled({ timeout: 120000 })
  await button.click()
}

test('运行环境不可用时明确提示，重新准备后仍保留草稿', async ({ page }) => {
  // 正式入口已改为 HTTP 控制主机 Python，页面不再依赖 COOP/COEP 隔离能力；
  // 这里改为验证“主机 Python 不可用”时明确置灰提示、恢复后草稿仍在。
  await page.goto('/#/classroom/story-cover')
  const code = 'print("刷新后仍是我的作品")'
  await edit(page, code)
  const failEnvironment = (route: Route) =>
    route.fulfill({ status: 503, json: { message: '验收：主机 Python 暂时不可用' } })
  await page.route('**/api/v1/execution/environment', failEnvironment)
  await page.reload()
  await expect(page.getByRole('button', { name: '▶ 暂不可运行', exact: true })).toBeDisabled()
  await expect(page.locator('.inline-notice[role="alert"]')).toContainText('主机 Python 暂时不可用')
  await page.screenshot({ path: 'test-results/runner-isolation-failure.png', fullPage: true })
  await page.unroute('**/api/v1/execution/environment', failEnvironment)
  await page.getByRole('button', { name: '重新准备', exact: true }).click()
  await run(page)
  await expect(page.getByTestId('console-output')).toContainText('刷新后仍是我的作品')
  await page.screenshot({ path: 'test-results/runner-isolation-recovered.png', fullPage: true })
})

test('Python 环境请求超时后可以重新准备，不一直置灰', async ({ page }) => {
  // 就绪判断现在走 /execution/environment；挂住它让请求超时，验证不会永久置灰。
  const held: Route[] = []
  const holdEnvironment = (route: Route) => {
    held.push(route)
  }
  await page.route('**/api/v1/execution/environment', holdEnvironment)
  await page.goto('/#/classroom/story-cover')
  await expect(page.locator('.inline-notice[role="alert"]')).toContainText('时间限制', {
    timeout: 25000,
  })
  await expect(page.getByRole('button', { name: '▶ 暂不可运行', exact: true })).toBeDisabled()
  await page.unroute('**/api/v1/execution/environment', holdEnvironment)
  await Promise.all(held.map((route) => route.abort().catch(() => {})))
  await page.getByRole('button', { name: '重新准备', exact: true }).click()
  await run(page)
  await expect(page.getByTestId('console-output')).toContainText('月光森林')
})

test('预设回答只在 input 时使用，输出解释清楚', async ({ page }) => {
  await page.goto('/#/classroom/character-card')
  await expect(page.getByLabel('输入方式')).toBeHidden()
  await page.getByText('更多工具', { exact: true }).click()
  await page.getByText('调试：输入方式与预设回答', { exact: true }).click()
  await page.getByLabel('输入方式').selectOption('preset')
  await page.getByLabel('预设输入', { exact: true }).fill('a\nb\nc')
  await expect(page.getByText('填写后点击“运行”。', { exact: false })).toBeVisible()
  await run(page)
  await expect(page.getByTestId('console-output')).toContainText('阿芽')
  await edit(page, 'name = input("主角：")\nwish = input("愿望：")\nprint("结果：", name, wish)')
  await run(page)
  await expect(page.getByTestId('console-output')).toContainText('结果： a b')
})

test('真实 Python 中文输出、保存和刷新恢复', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/#/classroom/story-cover')
  await expect(page.getByRole('textbox', { name: 'Python 代码编辑器', exact: true })).toBeVisible()
  await edit(page, 'print("云朵邮局")\nprint("创作者：岛屿小画家")')
  await run(page)
  await expect(page.getByTestId('console-output')).toHaveText('云朵邮局\n创作者：岛屿小画家\n', {
    timeout: 15000,
  })
  await expect(page.getByTestId('story-output')).toContainText('云朵邮局')
  await page.getByLabel('给作品起个名字').fill('中文恢复验证')
  await page.getByRole('button', { name: '保存到我的作品', exact: true }).click()
  await expect(page.locator('.save-state')).toContainText('已保存到作品集')
  await page.reload()
  await expect(page.locator('.save-state')).toContainText('已打开作品')
  await run(page)
  await expect(page.getByTestId('console-output')).toContainText('云朵邮局', { timeout: 15000 })
  expect(errors).toEqual([])
  await page.screenshot({ path: 'test-results/classroom.png', fullPage: true })
})

test('语法错误、停止和超时后还能继续运行；每次执行重置变量', async ({ page }) => {
  await page.goto('/#/classroom/story-cover')
  await edit(page, 'if True print(123)')
  await run(page)
  await expect(page.getByTestId('console-error')).toContainText('SyntaxError', { timeout: 15000 })
  await edit(page, 'while True:\n    pass')
  // 运行 id 未建立前点“停止”会被忽略（前端在拿到运行 id 前就显示了停止按钮）；
  // 这里等首次轮询确认运行已建立再停止，避免踩到该竞态。
  const runRegistered = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      /\/api\/v1\/execution\/runs\/[^/]+$/.test(response.url()),
  )
  await run(page)
  await runRegistered
  await page.getByRole('button', { name: '■ 停止', exact: true }).click()
  await expect(page.getByTestId('console-error')).toContainText('你停止了这次运行', {
    timeout: 15000,
  })
  await edit(page, 'while True:\n    pass')
  await run(page)
  await expect(page.getByTestId('console-error')).toContainText('超过时间限制', { timeout: 16000 })
  await edit(page, 'secret_number = 7319\nprint(secret_number)')
  await run(page)
  await expect(page.getByTestId('console-output')).toContainText('7319', { timeout: 15000 })
  await edit(page, 'print(secret_number)')
  await run(page)
  await expect(page.getByTestId('console-error')).toContainText('NameError', { timeout: 15000 })
})

test('画笔指令来自 Python，执行资源域不能写入 API', async ({ page }) => {
  await page.goto('/#/classroom/drawing-lab')
  await run(page)
  await expect(page.getByTestId('console-output')).toContainText('我的第一枚岛屿徽章', {
    timeout: 15000,
  })
  const pixel = await page.locator('canvas[aria-label="Python 画笔作品"]').evaluate((element) => {
    return Array.from(
      (element as HTMLCanvasElement).getContext('2d')!.getImageData(160, 130, 1, 1).data,
    )
  })
  expect(pixel).toEqual([199, 187, 255, 255])
  // 正式入口在主机 Python 沙箱里执行，不再有浏览器 iframe 执行域；
  // 仍然验证执行资源域（runnerOrigin）不能写入学习 API。
  const health = await (await page.request.get('/api/health')).json()
  const forbidden = await page.request.post('/api/works', {
    headers: { Origin: health.runnerOrigin },
    data: {},
  })
  expect(forbidden.status()).toBe(403)
})

test('阻断公网后仍可加载本地 Python 并执行', async ({ page }) => {
  const remoteRequests: string[] = []
  await page.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname
    if (['127.0.0.1', 'localhost'].includes(host)) return route.continue()
    remoteRequests.push(route.request().url())
    return route.abort()
  })
  await page.goto('/#/classroom/story-cover')
  await edit(page, 'print("本地资源也能讲故事")')
  await run(page)
  await expect(page.getByTestId('console-output')).toContainText('本地资源也能讲故事', {
    timeout: 15000,
  })
  expect(remoteRequests).toEqual([])
})

test('实时中文输入、多次回答、空输入与等待暂停计时', async ({ page }) => {
  await page.goto('/#/classroom/author-interview')
  await edit(
    page,
    'print("开场：", end="")\nname = input("笔名：")\nempty = input("留空：")\nchapters = int(input("章节："))\nprint(f"{name}/空串={empty == chr(0)[:0]}/目标={chapters + 1}")',
  )
  await run(page)
  await expect(page.getByLabel('回答程序')).toBeVisible()
  await expect(page.getByTestId('console-output')).toContainText('开场：笔名：')
  await page.waitForTimeout(11000)
  await expect(page.getByLabel('回答程序')).toBeVisible()
  await page.getByLabel('回答程序').fill('云朵')
  await page.getByRole('button', { name: '发送回答', exact: true }).click()
  await expect(page.getByTestId('console-output')).toContainText('留空：')
  await page.getByLabel('回答程序').fill('')
  await page.getByRole('button', { name: '发送回答', exact: true }).click()
  await expect(page.getByTestId('console-output')).toContainText('章节：')
  await page.getByLabel('回答程序').fill('3')
  await page.getByRole('button', { name: '发送回答', exact: true }).click()
  await expect(page.getByTestId('console-output')).toContainText('云朵/空串=True/目标=4')
  await expect(page.getByLabel('回答程序')).toHaveCount(0)
})

test('练习检查、完成本课和参考不会覆盖草稿', async ({ page }) => {
  await page.goto('/#/classroom/author-interview')
  const lesson = await (await page.request.get('/api/lessons/author-interview')).json()
  await edit(page, lesson.exercises[0].referenceCode)
  await expect(page.getByRole('button', { name: '检查', exact: true })).toBeEnabled({
    timeout: 120000,
  })
  await page.getByRole('button', { name: '检查', exact: true }).click()
  await expect(page.getByText('检查通过！再试自己的输入，并解释你的方法。')).toBeVisible({
    timeout: 30000,
  })
  expect(
    (await (await page.request.get('/api/progress')).json()).find(
      (p: { lessonId: string }) => p.lessonId === 'author-interview',
    ),
  ).toBeUndefined()
  await page.getByRole('button', { name: '提示', exact: true }).click()
  await page.getByText('看参考实现', { exact: true }).click()
  await expect(page.locator('.reference-code')).toBeVisible()
  expect(JSON.parse((await scopedValue(page, 'xuya:draft:author-interview'))!).code).toBe(
    lesson.exercises[0].referenceCode,
  )
  await page.getByRole('button', { name: '完成这一课', exact: true }).click()
  await expect(page.getByRole('button', { name: '已完成 ✓', exact: true })).toBeVisible()
  await expect
    .poll(async () => {
      const progress = await (await page.request.get('/api/progress')).json()
      return progress.find((item: { lessonId: string }) => item.lessonId === 'author-interview')
        ?.status
    })
    .toBe('completed')
  await page.getByText('更多工具', { exact: true }).click()
  await page.getByText('调试：输入方式与预设回答', { exact: true }).click()
  await page.getByLabel('输入方式').selectOption('preset')
  await page.getByLabel('预设输入', { exact: true }).fill('测试作者\n0')
  await run(page)
  await expect(page.getByTestId('console-output')).toContainText('测试作者的计划：0章')
  await expect(page.getByTestId('console-output')).toContainText('下一次目标：1章')
})

test('等待时可停止、EOF 与旧运行消息不会污染新课', async ({ page }) => {
  await page.goto('/#/classroom/author-interview')
  await edit(page, 'print("已开始")\ninput("等待：")')
  await run(page)
  await expect(page.getByLabel('回答程序')).toBeVisible()
  await page.getByRole('button', { name: '■ 停止', exact: true }).click()
  await expect(page.getByTestId('console-error')).toContainText('你停止了这次运行')
  await expect(page.getByTestId('console-output')).toContainText('已开始')
  await edit(page, 'input("读取：")')
  await run(page)
  await expect(page.getByLabel('回答程序')).toBeVisible()
  await page.getByRole('button', { name: '结束输入（EOF）', exact: true }).click()
  await expect(page.getByTestId('console-error')).toContainText('EOFError')
  await edit(page, 'input("旧课等待：")')
  await run(page)
  await expect(page.getByLabel('回答程序')).toBeVisible()
  await page.goto('/#/classroom/character-card')
  await edit(page, 'print("新课结果")')
  await run(page)
  await expect(page.getByTestId('console-output')).toHaveText('新课结果\n')
})

test('虚拟存档显式导出和导入恢复', async ({ page }) => {
  await page.goto('/#/classroom/final-showcase')
  const lesson = await (await page.request.get('/api/lessons/final-showcase')).json()
  await edit(page, lesson.exercises[0].referenceCode)
  await page.getByText('更多工具', { exact: true }).click()
  await page.getByText('调试：输入方式与预设回答', { exact: true }).click()
  await page.getByLabel('输入方式').selectOption('preset')
  await page.getByLabel('预设输入', { exact: true }).fill('garden\nsea\nexit')
  await run(page)
  await expect(page.getByTestId('console-output')).toContainText('总次数： 2')
  await page.getByText('课堂文件：导入与导出', { exact: true }).click()
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 story-save.json', exact: true }).click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toBe('story-save.json')
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  const saved = Buffer.concat(chunks)
  expect(JSON.parse(saved.toString('utf8'))).toEqual({ visits: 2 })
  await page
    .getByLabel('导入课堂文件')
    .setInputFiles({ name: 'story-save.json', mimeType: 'application/json', buffer: saved })
  await page.getByLabel('预设输入', { exact: true }).fill('garden\nexit')
  await run(page)
  await expect(page.getByTestId('console-output')).toContainText('恢复次数： 2')
  await expect(page.getByTestId('console-output')).toContainText('总次数： 3')
})

test('六阶段课程全部可选，基础课堂不依赖模型', async ({ page }) => {
  await page.goto('/')
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: '编程课堂' })
    .click()
  const content = await (await page.request.get('/api/curriculum')).json()
  expect(content.lessons).toHaveLength(48)
  expect(content.lessons.filter((l: { track: string }) => l.track === 'core')).toHaveLength(32)
  await page.getByLabel('学习阶段').selectOption('studio')
  await expect(page.getByRole('link', { name: /项目六：完成、存档与展示/ })).toBeVisible()
  expect((await (await page.request.get('/api/tutor/status')).json()).configured).toBe(false)
})

test('错误输入解释后能重新运行', async ({ page }) => {
  await page.goto('/#/classroom/invalid-input')
  await run(page)
  await expect(page.getByLabel('回答程序')).toBeVisible()
  await page.getByLabel('回答程序').fill('不是数字')
  await page.getByRole('button', { name: '发送回答', exact: true }).click()
  await expect(page.getByTestId('console-output')).toContainText('请输入整数')
  await run(page)
  await expect(page.getByLabel('回答程序')).toBeVisible()
  await page.getByLabel('回答程序').fill('5')
  await page.getByRole('button', { name: '发送回答', exact: true }).click()
  await expect(page.getByTestId('console-output')).toContainText('能量： 5')
})

test('保存冲突提示保留双方代码，另存不会覆盖另一窗口', async ({ page }) => {
  await page.goto('/#/classroom/story-cover')
  await edit(page, 'print("我的原始版本")')
  await page.getByRole('button', { name: '保存到我的作品', exact: true }).click()
  await expect(page.locator('.save-state')).toContainText('已保存到作品集')
  const draft = JSON.parse((await scopedValue(page, 'xuya:draft:story-cover'))!)
  const updated = await page.request.put(`/api/works/${draft.workId}`, {
    headers: await administratorHeaders(page),
    data: {
      lessonId: 'story-cover',
      title: '另一窗口',
      code: 'print("另一窗口的版本")',
      revision: draft.revision,
    },
  })
  expect(updated.status()).toBe(200)
  await edit(page, 'print("我的新修改")')
  await page.getByRole('button', { name: '保存到我的作品', exact: true }).click()
  await expect(page.locator('.save-state')).toHaveClass(/warning/)
  await page.getByRole('button', { name: '保留双方内容 · 另存为新作品', exact: true }).click()
  await expect(page.locator('.save-state')).toContainText('已保存到作品集')
  const original = await (await page.request.get(`/api/works/${draft.workId}`)).json()
  expect(original.code).toBe('print("另一窗口的版本")')
  const saved = JSON.parse((await scopedValue(page, 'xuya:draft:story-cover'))!)
  expect(saved.workId).not.toBe(draft.workId)
  expect(saved.code).toBe('print("我的新修改")')
})
