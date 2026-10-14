import { expect, test, type Page } from '@playwright/test'
test.use({ actionTimeout: 15000 })

async function administrator(page: Page) {
  await page.goto('/#/')
  const state = await (await page.request.get('/api/v1/auth/state')).json()
  if (!state.initialized) {
    await page.getByLabel('账号', { exact: true }).fill('familyadmin')
    await page.getByLabel('管理员昵称').fill('家庭管理员')
    await page.getByLabel('密码', { exact: true }).fill('admin-password')
    await page.getByRole('button', { name: '准备好我的小岛' }).click()
  } else if (!state.user) {
    await page.getByLabel('账号', { exact: true }).fill('familyadmin')
    await page.getByLabel('密码', { exact: true }).fill('admin-password')
    await page.getByRole('button', { name: '出发，去探险' }).click()
  }
  await expect(page.locator('.sidebar')).toBeVisible()
  const current = await (await page.request.get('/api/v1/auth/state')).json()
  return { Origin: process.env.XUYA_TEST_URL!, 'X-Xuya-CSRF': current.csrf }
}

test('家庭页面状态、键盘与电脑阅读布局', async ({ page }) => {
  test.setTimeout(240000)
  const headers = await administrator(page)
  await page.request.put('/api/v1/system/security', { headers, data: { captchaMode: 'off' } })
  await page.goto('/#/admin')
  await expect(page.getByRole('tab', { name: '家人账户' })).toHaveAttribute('aria-selected', 'true')
  const advanced = page.getByRole('button', { name: '高级设置', exact: true })
  await advanced.click()
  await page.getByRole('tab', { name: '奖励规则' }).click()
  await expect(page.getByRole('spinbutton', { name: '每日积分上限' })).toHaveValue('40')
  await page.keyboard.press('Escape')
  await expect(page.locator('.ant-drawer-content')).not.toBeVisible()
  await expect(advanced).toBeFocused()

  const roleResponse = await page.request.post('/api/v1/system/roles', {
    headers,
    data: { name: '验收自定义身份', description: '检查编辑保留身份', enabled: true, menuIds: [] },
  })
  expect(roleResponse.ok()).toBe(true)
  const customRole = await roleResponse.json()
  const userResponse = await page.request.post('/api/v1/system/users', {
    headers,
    data: {
      username: 'acceptance',
      nickname: '验收家人',
      password: 'first-password',
      enabled: true,
      roles: ['learner', customRole.id],
    },
  })
  expect(userResponse.ok()).toBe(true)
  const acceptance = await userResponse.json()
  await page.reload()
  const userRow = page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'acceptance', exact: true }) })
  await userRow.getByRole('button', { name: '编辑资料' }).click()
  await page.getByRole('dialog').getByLabel('昵称', { exact: true }).fill('验收家人新昵称')
  await page.getByRole('dialog').locator('.ant-modal-footer .ant-btn-primary').click()
  await expect(userRow).toContainText('验收家人新昵称')
  const saved = await (await page.request.get('/api/v1/system/users')).json()
  expect(saved.find((user: { id: string }) => user.id === acceptance.id).roles).toContain(
    customRole.id,
  )
  await userRow.getByRole('button', { name: '重置密码' }).click()
  await page.getByRole('dialog').getByLabel('新的临时密码').fill('reset-password')
  await page.getByRole('dialog').locator('.ant-modal-footer .ant-btn-primary').click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await userRow.getByRole('button', { name: '停用', exact: true }).click()
  await page.getByRole('button', { name: '确认停用', exact: true }).click()
  await expect(userRow).toContainText('已停用')
  await userRow.getByRole('button', { name: '启用', exact: true }).click()
  await page.getByRole('button', { name: '确认启用', exact: true }).click()
  await expect(userRow).toContainText('可登录')
  await expect(
    page
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: 'familyadmin', exact: true }) })
      .getByRole('button', { name: '停用', exact: true }),
  ).toBeDisabled()

  await page.getByRole('tab', { name: '运行与共享' }).click()
  await expect(page.getByRole('button', { name: '保存共享设置' })).toBeDisabled()
  await page.getByRole('switch', { name: '启用局域网共享' }).click()
  await page.getByRole('button', { name: '保存共享设置' }).click()
  await expect(page.getByText('等待重启', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '保存共享设置' })).toBeDisabled()

  const environment = await (await page.request.get('/api/v1/execution/environment')).json()
  await page.route('**/api/v1/execution/environment', (route) =>
    route.fulfill({
      json: {
        ...environment,
        bundled: { available: true, executable: 'C:\\bundled\\python.exe', version: '3.13' },
      },
    }),
  )
  await page.route('**/api/v1/system/python', (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ status: 400, json: { message: '验收：环境检查失败，原配置保留' } })
      : route.fulfill({ json: [] }),
  )
  await page.reload()
  await page.getByRole('tab', { name: '运行与共享' }).click()
  await page.getByRole('combobox', { name: '选择运行环境' }).focus()
  await page.getByRole('combobox', { name: '选择运行环境' }).press('ArrowDown')
  await page.getByText('内置 Python 3.13 · 推荐', { exact: true }).click()
  await page.getByRole('button', { name: '检查并使用' }).click()
  await expect(page.getByRole('alert')).toContainText('原配置保留')
  await expect(
    page
      .locator('.family-paper')
      .filter({ has: page.getByRole('heading', { name: 'Python运行环境' }) })
      .locator('.family-status'),
  ).toContainText(
    environment.source === 'custom'
      ? '已选择主机Python'
      : environment.source === 'bundled'
        ? '内置 Python'
        : '尚未配置',
  )
  await page.unroute('**/api/v1/execution/environment')
  await page.unroute('**/api/v1/system/python')
  await page.reload()

  await page.route('**/api/v1/learning/dashboard', (route) =>
    route.fulfill({ status: 503, json: { message: '测试连接失败' } }),
  )
  await page.goto('/#/growth')
  await expect(page.getByRole('alert')).toContainText('测试连接失败')
  await expect(page.getByText('你的第一段探索，从这里开始')).toHaveCount(0)
  await page.unroute('**/api/v1/learning/dashboard')
  await page.getByRole('button', { name: '重新连接成长手册' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)

  const routes = [
    ['home', '/'],
    ['games', '/games'],
    ['classroom', '/classroom'],
    ['lesson', '/classroom/story-cover'],
    ['studio', '/studio'],
    ['works', '/works'],
    ['growth', '/growth'],
    ['admin', '/admin'],
    ['codex', '/codex'],
  ]
  for (const width of [1280, 1480, 1920]) {
    await page.setViewportSize({ width, height: 980 })
    for (const [name, route] of routes) {
      await page.goto('/#' + route)
      if (name === 'codex') await expect(page.getByTestId('codex-workbench')).toBeVisible()
      else await expect(page.locator('.sidebar')).toBeVisible()
      await page.waitForTimeout(350)
      const overflow = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
      }))
      expect(overflow.scroll, `${name} 在 ${width}px 溢出`).toBeLessThanOrEqual(overflow.width)
      await page.screenshot({ path: `test-results/readability-${name}-${width}.png` })
    }
  }
})
