import { expect, test, type Page } from '@playwright/test'
test.use({ actionTimeout: 15000 })

const testPython =
  process.env.XUYA_TEST_PYTHON ||
  'C:\\Users\\101202303018\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe'
async function headers(page: Page) {
  const state = await (await page.request.get('/api/v1/auth/state')).json()
  return { Origin: process.env.XUYA_TEST_URL!, 'X-Xuya-CSRF': state.csrf }
}
async function signIn(page: Page, username: string, password: string) {
  await page.getByLabel('账号', { exact: true }).fill(username)
  await page.getByLabel('密码', { exact: true }).fill(password)
  await page.getByRole('button', { name: '出发，去探险' }).click()
}

async function editCode(page: Page, code: string) {
  await expect(page.locator('.monaco-editor')).toBeVisible()
  const editor = page.getByRole('textbox', { name: 'Python 代码编辑器', exact: true })
  await editor.focus()
  await page.keyboard.press('Control+A')
  await page.keyboard.insertText(code)
  await expect
    .poll(() =>
      page.evaluate(() => {
        const key = Object.keys(localStorage).find((key) => key.endsWith(':xuya:draft:story-cover'))
        return key ? JSON.parse(localStorage.getItem(key)!).code.replace(/\r\n/g, '\n') : ''
      }),
    )
    .toBe(code)
}

test('家庭管理员设置、软萌登录、账户隔离与主机Python完整课堂', async ({ page }) => {
  const personal: string[] = []
  page.on('request', (request) => {
    if (/\/api\/(works|progress|projects|v1\/learning)/.test(request.url()))
      personal.push(request.url())
  })
  await page.goto('/#/')
  await expect(page.getByRole('heading', { name: '先请大人准备小岛' })).toBeVisible()
  expect(personal).toEqual([])
  await page.getByLabel('账号', { exact: true }).fill('familyadmin')
  await page.getByLabel('管理员昵称').fill('家庭管理员')
  await page.getByLabel('密码', { exact: true }).fill('admin-password')
  await expect(page.getByRole('img', { name: '小奇捂住眼睛，保护你的密码' })).toBeVisible()
  await page.screenshot({ path: 'test-results/family-first-setup.png', fullPage: true })
  await page.getByRole('button', { name: '准备好我的小岛' }).click()
  await page.getByRole('link', { name: '家庭管理', exact: true }).click()
  await page.getByRole('tab', { name: '运行与共享' }).click()
  await page.getByText('找不到环境？手动填写路径', { exact: true }).click()
  await page.getByLabel('Python解释器完整路径').fill('C:\\missing-xuya-python\\python.exe')
  await page.getByRole('button', { name: '检查并使用', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel('Python解释器完整路径')).toHaveValue(
    'C:\\missing-xuya-python\\python.exe',
  )
  await page.getByLabel('Python解释器完整路径').fill(testPython)
  await page.getByRole('button', { name: '检查并使用', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('已选择')
  await page.getByRole('tab', { name: '家人账户' }).click()
  await page.getByRole('button', { name: '添加账户', exact: true }).click()
  const modal = page.getByRole('dialog')
  await modal.getByLabel('账号（创建后不能修改）').fill('daughter')
  await modal.getByLabel('昵称', { exact: true }).fill('小芽')
  await modal.getByLabel('初始密码（首次登录须修改）').fill('first-password')
  await modal.locator('.ant-modal-footer .ant-btn-primary').click()
  await expect(modal).not.toBeVisible()
  await expect(page.getByRole('cell', { name: 'daughter', exact: true })).toBeVisible()
  await page.request.post('/api/v1/system/users', {
    headers: await headers(page),
    data: {
      username: 'brother',
      nickname: '弟弟',
      password: 'first-password',
      enabled: true,
      roles: ['learner'],
    },
  })
  await page.getByRole('button', { name: '高级设置', exact: true }).click()
  await page.getByRole('tab', { name: '登录防护' }).click()
  await page.getByRole('combobox', { name: '验证码展示策略' }).focus()
  await page.getByRole('combobox', { name: '验证码展示策略' }).press('ArrowDown')
  await page.locator('.ant-select-item-option[title="关闭验证码"]').click()
  await expect(page.locator('.ant-tabs-tabpane-active .ant-select-selection-item')).toContainText(
    '关闭验证码',
  )
  await page.getByRole('button', { name: '保存设置', exact: true }).click()
  await expect(page.getByText('登录防护已保存', { exact: true })).toBeVisible()
  await page.locator('.ant-drawer-close').click()
  await page.getByRole('tab', { name: '成长与礼物' }).click()
  await page.getByRole('button', { name: '添加礼物', exact: true }).click()
  const giftDialog = page.getByRole('dialog', { name: '准备家庭礼物' })
  await giftDialog.getByLabel('礼物或一起做的事').fill('周末一起画画')
  await giftDialog.getByLabel('具体约定与兑现方式').fill('一起挑选颜色，画一张小岛地图')
  await giftDialog.locator('.ant-modal-footer .ant-btn-primary').click()
  await expect(giftDialog).not.toBeVisible()
  for (const width of [1280, 1480, 1920]) {
    await page.setViewportSize({ width, height: 980 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/family-management-${width}.png`, fullPage: true })
  }
  await page.getByRole('button', { name: '切换', exact: true }).click()
  await expect(page.getByRole('heading', { name: '欢迎回到你的小岛' })).toBeVisible()
  for (const width of [1280, 1480, 1920]) {
    await page.setViewportSize({ width, height: 980 })
    await expect(page.getByRole('button', { name: '出发，去探险' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/family-login-${width}.png`, fullPage: true })
  }
  await signIn(page, 'daughter', 'first-password')
  await expect(page.getByRole('heading', { name: '给通行证换个新密码' })).toBeVisible()
  await page.getByLabel('初始密码', { exact: true }).fill('first-password')
  await page.getByLabel('新密码', { exact: true }).fill('daughter-password')
  await page.getByRole('button', { name: '保存新密码并重新登录' }).click()
  await signIn(page, 'daughter', 'daughter-password')
  await expect(page.locator('.sidebar-bottom')).toContainText('小芽')
  await expect(page.getByRole('link', { name: '家庭管理', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'codex', exact: true })).toHaveCount(0)
  await page.goto('/#/classroom/story-cover')
  await page.getByRole('button', { name: '▶ 运行', exact: true }).click()
  await expect(page.getByTestId('console-output')).not.toBeEmpty({ timeout: 15000 })
  await page.screenshot({ path: 'test-results/family-native-classroom.png', fullPage: true })
  await page.goto('/#/games/keyboard?level=letters')
  const typing = page.getByLabel('输入字母或数字', { exact: true })
  for (const target of ['f', 'j', 'a']) {
    await typing.fill(target)
    await expect(typing).toHaveValue('')
  }
  await page.context().setOffline(true)
  for (const target of ['s', 'd', 'g']) {
    if (target !== 's') {
      await typing.fill(target.toUpperCase())
      await page.waitForTimeout(100)
    }
    await typing.fill(target)
    if (target === 'g') await expect(page.getByTestId('mission-result')).toBeVisible()
    else await expect(page.getByTestId('typing-target')).not.toHaveText(target)
  }
  await expect(page.getByTestId('mission-result')).toContainText('待同步')
  await page.context().setOffline(false)
  await page.getByRole('button', { name: '同步这次学习记录' }).click()
  await expect(page.getByTestId('mission-result')).toContainText('成长积分 +6')
  await page.goto('/#/growth')
  for (const width of [1280, 1480, 1920]) {
    await page.setViewportSize({ width, height: 980 })
    await expect(page.getByRole('heading', { name: '最近学了什么' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/family-growth-${width}.png`, fullPage: true })
  }
  await page.getByRole('button', { name: '心愿礼物', exact: true }).click()
  await expect(page.locator('.growth-balance strong')).toHaveText('6')
  await page.getByRole('button', { name: '向家人申请', exact: true }).click()
  await expect(page.locator('.growth-balance strong')).toHaveText('1')
  await expect(page.locator('.growth-balance small')).toContainText('5')
  await page.screenshot({ path: 'test-results/family-growth-gift.png', fullPage: true })
  await page.getByRole('button', { name: '暂时取消', exact: true }).click()
  await expect(page.locator('.growth-balance strong')).toHaveText('6')
  await page.getByRole('button', { name: '向家人申请', exact: true }).click()
  await expect(page.locator('.growth-balance strong')).toHaveText('1')
  await page.evaluate(() => {
    localStorage.setItem(
      'xuya:typing-progress:v2',
      JSON.stringify({
        version: 2,
        records: [],
        drafts: [
          { gameId: 'pinyin', levelId: 'characters', levelVersion: 1, nextIndex: 3, attempts: 3 },
        ],
      }),
    )
    localStorage.setItem(
      'xuya:draft:story-cover',
      JSON.stringify({ title: '以前的故事', code: 'print("旧点子")', dirty: true, revision: 0 }),
    )
  })
  await page.getByRole('button', { name: '最近探索', exact: true }).click()
  await page.getByRole('button', { name: '查看更多足迹', exact: true }).click()
  await page.getByText('记录管理', { exact: true }).click()
  await page
    .getByRole('button', { name: '确认把这台浏览器的旧学习记录归到我的账户', exact: true })
    .click()
  await expect(
    page.getByText('已恢复旧记录；当前账户已有的草稿继续保留，原浏览器记录没有删除。', {
      exact: true,
    }),
  ).toBeVisible()
  expect(await page.evaluate(() => !!localStorage.getItem('xuya:draft:story-cover'))).toBe(true)
  await page.locator('.ant-drawer-close').click()
  await page.getByRole('button', { name: '心愿礼物', exact: true }).click()
  await expect(page.locator('.growth-balance strong')).toHaveText('1')
  await page.goto('/#/games/keyboard?level=letters')
  await page.getByRole('button', { name: '再送一组 →', exact: true }).click()
  await page.getByLabel('输入字母或数字', { exact: true }).fill('h')
  await expect(page.getByTestId('typing-target')).toHaveText('k')
  await expect
    .poll(async () => {
      const progress = await (await page.request.get('/api/v1/learning/typing-progress')).json()
      return progress.drafts.find(
        (item: { gameId: string; nextIndex: number }) => item.gameId === 'keyboard',
      )?.nextIndex
    })
    .toBe(7)
  const created = await page.request.post('/api/works', {
    headers: await headers(page),
    data: { lessonId: 'story-cover', title: '小芽独有的作品', code: "print('小芽')", revision: 0 },
  })
  expect(created.status()).toBe(201)
  const work = await created.json()
  const storage = await page.evaluate(() => ({
    keys: Object.keys(localStorage),
    token: localStorage.getItem('xuya-session'),
  }))
  expect(storage.token).toBeNull()
  expect(storage.keys.some((key) => key.startsWith('xuya:account:'))).toBe(true)
  await page.getByRole('button', { name: '切换', exact: true }).click()
  await signIn(page, 'brother', 'first-password')
  await page.getByLabel('初始密码', { exact: true }).fill('first-password')
  await page.getByLabel('新密码', { exact: true }).fill('brother-password')
  await page.getByRole('button', { name: '保存新密码并重新登录' }).click()
  await signIn(page, 'brother', 'brother-password')
  await expect(page.locator('.sidebar-bottom')).toContainText('弟弟')
  expect((await page.request.get(`/api/works/${work.id}`)).status()).toBe(404)
  expect((await page.request.get('/api/v1/system/users')).status()).toBe(403)
  await page.goto('/#/growth')
  await page.getByRole('button', { name: '心愿礼物', exact: true }).click()
  await expect(page.locator('.growth-balance strong')).toHaveText('0')
  await expect(page.getByRole('heading', { name: '我的申请' })).toBeVisible()
  await expect(page.getByRole('button', { name: '暂时取消', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '切换', exact: true }).click()
  await signIn(page, 'familyadmin', 'admin-password')
  await page.goto('/#/admin')
  await page.getByRole('tab', { name: '成长与礼物' }).click()
  await page.getByRole('combobox', { name: '选择学习账户' }).focus()
  await page.getByRole('combobox', { name: '选择学习账户' }).press('ArrowDown')
  await page.locator('.ant-select-item-option[title="小芽"]').click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出带依据的学习报告', exact: true }).click()
  expect((await downloadPromise).suggestedFilename()).toMatch(
    /^叙芽岛-学习报告-\d{4}-\d{2}-\d{2}\.json$/,
  )
  await page.getByRole('button', { name: '批准', exact: true }).click()
  await page.getByRole('tab', { name: '待兑现' }).click()
  await expect(page.getByRole('button', { name: '标记已经兑现', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '标记已经兑现', exact: true }).click()
  await page.getByRole('tab', { name: '已处理' }).click()
  await expect(page.getByRole('cell', { name: '已兑现', exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/family-growth-approved.png', fullPage: true })
  if (process.env.XUYA_TEST_LAN_URL) {
    const context = await page.context().browser()!.newContext()
    const remote = await context.newPage()
    const lanOrigin = process.env.XUYA_TEST_LAN_URL
    try {
      await remote.goto(lanOrigin + '/#/')
      expect(await remote.evaluate(() => typeof crypto.randomUUID)).toBe('undefined')
      await signIn(remote, 'daughter', 'daughter-password')
      await expect(remote.locator('.sidebar-bottom')).toContainText('小芽')
      await remote.goto(lanOrigin + '/#/classroom/story-cover')
      await remote.getByRole('button', { name: '▶ 运行', exact: true }).click()
      await expect(remote.getByTestId('console-output')).toContainText('小芽', {
        timeout: 15000,
      })
      const state = await (await remote.request.get(lanOrigin + '/api/v1/auth/state')).json()
      const remoteHeaders = { Origin: lanOrigin, 'X-Xuya-CSRF': state.csrf }
      expect((await remote.request.get(lanOrigin + `/api/works/${work.id}`)).status()).toBe(200)
      expect(
        (
          await remote.request.post(lanOrigin + '/api/v1/codex/access/bootstrap', {
            headers: remoteHeaders,
            data: {},
          })
        ).status(),
      ).toBe(403)
      expect(
        (
          await remote.request.post(lanOrigin + '/api/v1/auth/setup', {
            headers: remoteHeaders,
            data: { username: 'remoteadmin', nickname: '远程', password: 'remote-password' },
          })
        ).status(),
      ).toBe(403)
      await remote.goto(lanOrigin + '/#/growth')
      await remote.getByRole('button', { name: '心愿礼物', exact: true }).click()
      await expect(remote.locator('.growth-balance strong')).toHaveText('1')
      await remote.screenshot({ path: 'test-results/family-lan-growth.png', fullPage: true })
      await remote.goto(lanOrigin + '/#/games/keyboard?level=letters')
      await expect(remote.getByTestId('typing-target')).toHaveText('k')
      for (const target of ['k', 'l', 'q', 'w', 'e']) {
        await remote.getByLabel('输入字母或数字', { exact: true }).fill(target)
        if (target === 'e') await expect(remote.getByTestId('mission-result')).toBeVisible()
        else await expect(remote.getByTestId('typing-target')).not.toHaveText(target)
      }
      await expect(remote.getByTestId('mission-result')).toContainText('成长积分 +6')
      await remote.screenshot({ path: 'test-results/family-lan-continuation.png', fullPage: true })
      await remote.goto(lanOrigin + '/#/classroom/story-cover')
      await editCode(remote, 'name=input("你的名字：")\nprint("你好，"+name)')
      await remote.getByRole('button', { name: '▶ 运行', exact: true }).click()
      await remote.getByLabel('回答程序', { exact: true }).fill('小芽')
      await remote.getByRole('button', { name: '发送回答', exact: true }).click()
      await expect(remote.getByTestId('console-output')).toContainText('你好，小芽')
      await editCode(
        remote,
        'print("月光森林")\nprint("创作者：小画家")\nprint("第一章：云朵来信")',
      )
      const reportRequest = remote.waitForRequest(
        (request) => new URL(request.url()).pathname === '/api/exercise-attempts',
      )
      await remote.getByRole('button', { name: '检查基础练习', exact: true }).click()
      const actualReport = (await reportRequest).postDataJSON()
      await expect(
        remote.getByText(
          '这次检查留下了 1 个用例证据，成长积分 +2。通过检查不等于已经掌握，可以再解释自己的方法。',
          { exact: true },
        ),
      ).toBeVisible()
      const forged = {
        ...actualReport,
        id: '11111111-2222-4333-8444-555555555555',
        cases: actualReport.cases.map((item: Record<string, unknown>) => ({
          ...item,
          output: '伪造输出',
        })),
      }
      expect(
        (
          await remote.request.post(lanOrigin + '/api/exercise-attempts', {
            headers: remoteHeaders,
            data: forged,
          })
        ).status(),
      ).toBe(400)
      await remote.screenshot({
        path: 'test-results/family-lan-python-input-check.png',
        fullPage: true,
      })
    } catch (error) {
      await remote.screenshot({ path: 'test-results/family-lan-failure.png', fullPage: true })
      console.log(
        'LAN编辑器状态',
        await remote.evaluate(() => ({
          active: document.activeElement?.getAttribute('class'),
          editors: Array.from(document.querySelectorAll('textarea')).map((item) => ({
            label: item.getAttribute('aria-label'),
            value: item.value,
          })),
          drafts: Object.keys(localStorage)
            .filter((key) => key.endsWith(':xuya:draft:story-cover'))
            .map((key) => ({ key, code: JSON.parse(localStorage.getItem(key)!).code })),
        })),
      )
      throw error
    } finally {
      await context.close()
    }
  }
})
