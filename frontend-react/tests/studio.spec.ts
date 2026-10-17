import { expect, test, type Page } from '@playwright/test'
import type { StudioCandidate, StudioProject, StudioSnapshot } from '../src/studio-types'
import { administratorHeaders, signInAsAdministrator } from './support/session'

test.beforeEach(async ({ page }) => {
  await signInAsAdministrator(page)
})

async function createProject(page: Page, title: string, code = 'print("原作还在")') {
  const response = await page.request.post('/api/projects', {
    headers: await administratorHeaders(page),
    data: { title, scene: 'milk-tea', files: [{ path: 'main.py', content: code }] },
  })
  expect(response.ok()).toBe(true)
  return (await response.json()) as StudioProject
}
async function edit(page: Page, id: string, code: string) {
  await expect(page.locator('.monaco-editor')).toBeVisible()
  const editor = page.getByRole('textbox', { name: 'Python 代码编辑器', exact: true })
  await editor.focus()
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.evaluate((text) => navigator.clipboard.writeText(text), code)
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Control+V')
  await expect
    .poll(() =>
      page.evaluate((projectId) => {
        const key = Object.keys(localStorage).find((item) =>
          item.endsWith(`xuya:studio:draft:${projectId}`),
        )
        return JSON.parse((key ? localStorage.getItem(key) : null) ?? '{}').files?.find(
          (file: { path: string }) => file.path === 'main.py',
        )?.content
      }, id),
    )
    .toBe(code)
}
async function run(page: Page) {
  const button = page.getByRole('button', { name: '▶ 运行我的作品', exact: true })
  await expect(button).toBeEnabled({ timeout: 120000 })
  await button.click()
}

test('没有模型时新作品能运行动画、保存多文件，刷新找回草稿与历史', async ({ page }) => {
  await page.goto('/#/studio')
  await page.getByLabel('新作品名字').fill('我的珍珠太空站')
  await page.getByRole('button', { name: '新建作品 →', exact: true }).click()
  await expect(page).toHaveURL(/#\/studio\/[^/?]+$/)
  const id = page.url().split('/studio/')[1]
  await expect(page.getByText('小奇暂时还没连接。', { exact: false })).toBeVisible()
  await expect(page.locator('a[href="#/parent"]')).toHaveCount(0)
  await run(page)
  await expect(page.getByTestId('stage-facts')).toContainText('珍珠 3', { timeout: 15000 })
  await page.getByText('添加与整理文本文件', { exact: true }).click()
  await page.getByLabel('新文件名').fill('台词/开场.txt')
  await page.getByRole('button', { name: '添加文件', exact: true }).click()
  await page.getByLabel('文本文件编辑器').fill('珍珠申请成为店长')
  await page.getByRole('button', { name: 'main.py', exact: true }).click()
  await edit(
    page,
    id,
    'with open("台词/开场.txt", encoding="utf-8") as file:\n    print(file.read())',
  )
  await page.getByRole('button', { name: '保存作品', exact: true }).click()
  await expect(page.getByText('已保存第 2 版。', { exact: true })).toBeVisible()
  await run(page)
  await expect(page.getByTestId('studio-output')).toContainText('珍珠申请成为店长')
  await edit(page, id, 'print("这是还没保存的脑洞")')
  await page.reload()
  await expect(page.getByText('找回了这个浏览器里的草稿。', { exact: true })).toBeVisible()
  await run(page)
  await expect(page.getByTestId('studio-output')).toContainText('这是还没保存的脑洞')
  await page.getByRole('button', { name: '版本历史', exact: true }).click()
  await page.getByRole('button', { name: '恢复第 1 版', exact: true }).click()
  await expect(page.locator('.studio-notice')).toContainText('已从第 1 版恢复，另存为第 3 版。')
  await page.getByRole('button', { name: '找回先前草稿', exact: true }).click()
  await run(page)
  await expect(page.getByTestId('studio-output')).toContainText('这是还没保存的脑洞')
  await page.screenshot({ path: 'test-results/studio-manual.png', fullPage: true })
})

test('旧作品复制为独立项目，旧作与课程记录保留', async ({ page }) => {
  const lessons = await (await page.request.get('/api/lessons')).json()
  const response = await page.request.post('/api/works', {
    headers: await administratorHeaders(page),
    data: {
      lessonId: lessons[0].id,
      title: '旧作复制验证',
      code: 'print("旧作的故事")',
      revision: 0,
    },
  })
  expect(response.ok()).toBe(true)
  const work = await response.json()
  await page.goto(`/#/studio?workId=${work.id}`)
  await expect(page).toHaveURL(/#\/studio\/[^/?]+$/)
  const project = await (
    await page.request.get(`/api/projects/${page.url().split('/studio/')[1]}`)
  ).json()
  expect(project.sourceWorkId).toBe(work.id)
  expect(project.files[0].content).toBe(work.code)
  const original = await (await page.request.get(`/api/works/${work.id}`)).json()
  expect(original.code).toBe('print("旧作的故事")')
})

test('怪兽在等待中文输入时仍有动画，绘画来自实际执行', async ({ page }) => {
  const code =
    'from xuya.stage import actor, say, size\nfrom xuya.draw import circle, text\nactor("害羞怪兽", "monster")\nsay("怪兽还没听到夸奖", actor="害羞怪兽")\ninput("夸我一句：")\nsize("害羞怪兽", 0.5)\nsay("夸得我小了一半！", actor="害羞怪兽")\ncircle(120, 100, 40, "#76b89f")\ntext(70, 175, "怪兽合影", "#315c50")\n'
  const project = await createProject(page, '越夸越小的怪兽', code)
  await page.goto(`/#/studio/${project.id}`)
  await run(page)
  await expect(page.locator('.stage-speech')).toContainText('怪兽还没听到夸奖', { timeout: 15000 })
  await page.getByLabel('回答创作室程序').fill('你的笑话好好笑')
  await page.getByRole('button', { name: '发送回答', exact: true }).click()
  await expect(page.locator('.stage-speech')).toContainText('夸得我小了一半', { timeout: 15000 })
  await expect(page.getByText('Python 画出的作品（2 个画笔动作）', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Python 画笔作品', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/studio-monster.png', fullPage: true })
})

async function mockCompanion(
  page: Page,
  project: StudioProject,
  status: 'waiting-runner' | 'unknown' = 'waiting-runner',
) {
  const candidate: StudioCandidate = {
    id: 'candidate-e2e',
    projectId: project.id,
    baseRevision: project.revision,
    files: [
      {
        path: 'main.py',
        content:
          'from xuya.stage import cup, pour, pearls, say\ncup()\npour(2)\npearls(8)\nsay("珍珠已经当上店长")\nprint("建议真的运行了")',
      },
    ],
    explanation: '让珍珠上岗，先试演再由你决定。',
    status: 'pending',
    appliedRevision: null,
    createdAt: '',
  }
  const snapshot: StudioSnapshot = {
    session: {
      id: `session-${project.id}`,
      projectId: project.id,
      scene: project.scene,
      mode: 'studio',
      lessonId: null,
      createdAt: '',
    },
    cursor: 1,
    messages: [],
    tasks: [],
    candidates: [],
    pendingRuns: [],
    budget: {
      modelCalls: 0,
      activeMs: 0,
      repairAttempts: 0,
      limitCalls: 5,
      limitActiveMs: 90000,
      limitRepairs: 2,
    },
  }
  const counters = {
    claim: 0,
    results: 0,
    messages: [] as Record<string, unknown>[],
    loseMessage: false,
    loseReceipt: false,
  }
  if (status === 'unknown') {
    snapshot.candidates.push(candidate)
    snapshot.pendingRuns.push({
      requestId: 'request-e2e',
      toolCallId: 'tool-e2e',
      candidateId: candidate.id,
      executionId: 'old-execution',
      status,
      files: candidate.files,
    })
  }
  await page.route('**/api/tutor/status', (route) =>
    route.fulfill({
      json: {
        configured: true,
        provider: 'test',
        model: 'local-fixture',
        protocol: 'openai-compatible',
      },
    }),
  )
  await page.route('**/api/study-sessions**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (path === '/api/study-sessions')
      return route.fulfill({
        json: route.request().method() === 'GET' ? [snapshot.session] : snapshot.session,
      })
    if (path.endsWith('/events'))
      return route.fulfill({
        contentType: 'text/event-stream',
        body: `id: ${snapshot.cursor}\nevent: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`,
      })
    if (path.endsWith('/snapshot')) return route.fulfill({ json: snapshot })
    if (path.endsWith('/messages')) {
      const payload = route.request().postDataJSON()
      counters.messages.push(payload)
      if (counters.loseMessage) {
        counters.loseMessage = false
        return route.abort('failed')
      }
      snapshot.cursor++
      snapshot.messages = [
        { id: 'user-1', role: 'user', text: payload.question },
        { id: 'assistant-1', role: 'assistant', text: '先试一下候选，不动你的原稿。' },
      ]
      snapshot.tasks = [
        { commandId: 'command', turnId: 'turn', runId: null, status: 'suspended', error: null },
      ]
      snapshot.candidates = [candidate]
      snapshot.pendingRuns = [
        {
          requestId: 'request-e2e',
          toolCallId: 'tool-e2e',
          candidateId: candidate.id,
          executionId: null,
          status,
          files: candidate.files,
        },
      ]
      return route.fulfill({ json: snapshot.tasks[0] })
    }
    if (path.endsWith('/claim') || path.endsWith('/retry')) {
      counters.claim++
      snapshot.pendingRuns[0].status = 'running'
      snapshot.pendingRuns[0].executionId = 'execution-e2e'
      return route.fulfill({
        json: {
          id: 'execution-e2e',
          requestId: 'request-e2e',
          candidateId: candidate.id,
          status: 'running',
          files: candidate.files,
          result: null,
        },
      })
    }
    if (path.endsWith('/result')) {
      counters.results++
      const actual = route.request().postDataJSON()
      snapshot.pendingRuns[0].status = 'completed'
      snapshot.tasks = [
        { commandId: 'command', turnId: 'turn', runId: null, status: 'completed', error: null },
      ]
      if (counters.loseReceipt) {
        counters.loseReceipt = false
        return route.abort('failed')
      }
      return route.fulfill({
        json: {
          id: 'execution-e2e',
          requestId: 'request-e2e',
          candidateId: candidate.id,
          status: 'completed',
          files: candidate.files,
          result: actual,
        },
      })
    }
    return route.fulfill({ json: { interrupted: true } })
  })
  await page.route('**/api/candidates/**', (route) => {
    const action = new URL(route.request().url()).pathname.split('/').at(-1)
    if (action === 'reject') {
      candidate.status = 'rejected'
      return route.fulfill({ json: candidate })
    }
    if (action === 'undo') {
      candidate.status = 'pending'
      return route.fulfill({ json: { ...project, revision: project.revision + 2 } })
    }
    candidate.status = 'applied'
    candidate.appliedRevision = project.revision + 1
    return route.fulfill({
      json: { ...project, revision: candidate.appliedRevision, files: candidate.files },
    })
  })
  return { snapshot, candidate, counters }
}

test('小奇候选实际运行，回执丢失只补交；采用时保留孩子的未存草稿并可撤销', async ({ page }) => {
  const project = await createProject(page, '候选试演')
  const fixture = await mockCompanion(page, project)
  fixture.counters.loseReceipt = true
  await page.goto(`/#/studio/${project.id}`)
  await page.getByLabel('告诉小奇你的想法').fill('让珍珠当店长')
  await page.getByRole('button', { name: '一起开工 →', exact: true }).click()
  await expect(page.getByTestId('studio-output')).toContainText('建议真的运行了', {
    timeout: 120000,
  })
  await expect.poll(() => fixture.counters.results).toBeGreaterThanOrEqual(1)
  if (await page.getByRole('button', { name: '只补交运行结果', exact: true }).isVisible())
    await page.getByRole('button', { name: '只补交运行结果', exact: true }).click()
  await expect.poll(() => fixture.counters.results, { timeout: 10000 }).toBe(2)
  expect(fixture.counters.claim).toBe(1)
  expect(
    (await (await page.request.get(`/api/projects/${project.id}`)).json()).files[0].content,
  ).toBe('print("原作还在")')
  await edit(page, project.id, 'print("孩子刚加的草稿")')
  await page.getByRole('button', { name: '保留我的草稿并采用建议', exact: true }).click()
  await expect(page.getByText('已采用建议', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: '撤销这次采用', exact: true }).click()
  await expect(page.getByText('已撤销采用，恢复采用前的作品。', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '找回先前草稿', exact: true }).click()
  await run(page)
  await expect(page.getByTestId('studio-output')).toContainText('孩子刚加的草稿')
})

test('未知执行不会刷新重跑，明确点击才重新试演；build只来自明确选择且消息重试key不变', async ({
  page,
}) => {
  const project = await createProject(page, '未知执行恢复')
  const fixture = await mockCompanion(page, project, 'unknown')
  await page.goto(`/#/studio/${project.id}`)
  await expect(page.getByRole('button', { name: '重新试演这个建议', exact: true })).toBeVisible()
  expect(fixture.counters.claim).toBe(0)
  await page.reload()
  await expect(page.getByRole('button', { name: '重新试演这个建议', exact: true })).toBeVisible()
  expect(fixture.counters.claim).toBe(0)
  await page.getByRole('button', { name: '重新试演这个建议', exact: true }).click()
  await expect(page.getByTestId('studio-output')).toContainText('建议真的运行了', {
    timeout: 120000,
  })
  expect(fixture.counters.claim).toBe(1)
  fixture.counters.loseMessage = true
  await page.getByRole('button', { name: '帮我做出来', exact: true }).click()
  await page.getByLabel('告诉小奇你的想法').fill('帮我做一个珍珠短剧')
  await page.getByRole('button', { name: '一起开工 →', exact: true }).click()
  await expect(page.getByRole('button', { name: '重试同一条消息', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '重试同一条消息', exact: true }).click()
  await expect.poll(() => fixture.counters.messages.length).toBe(2)
  expect(fixture.counters.messages[0].clientRequestId).toBe(
    fixture.counters.messages[1].clientRequestId,
  )
  expect(fixture.counters.messages[1].intent).toBe('build')
  expect(fixture.counters.messages[1].explicitBuild).toBe(true)
})
