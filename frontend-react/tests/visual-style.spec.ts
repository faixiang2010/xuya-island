import { expect, test } from '@playwright/test'
import { administratorHeaders, signInAsAdministrator } from './support/session'

test.beforeEach(async ({ page }) => {
  await signInAsAdministrator(page)
})

test('所有入口在桌面与手机保持完整导航、可读控件和无横向溢出', async ({ page }) => {
  const screens = [
    { name: 'home', route: '/', heading: '我的探险手册' },
    { name: 'games', route: '/#/games', heading: '游戏中心' },
    { name: 'keyboard', route: '/#/games/keyboard', heading: '字母数字小站' },
    { name: 'pinyin', route: '/#/games/pinyin', heading: '拼音汉字小站' },
    { name: 'adventure', route: '/#/adventure/town-cup-order', heading: '防漏测试：一滴都没进去' },
    { name: 'catalog', route: '/#/classroom', heading: '编程课堂' },
    { name: 'classroom', route: '/#/classroom/story-cover', heading: '故事海报：顺序有秘密' },
    { name: 'studio', route: '/#/studio', heading: '小奇创作室' },
    { name: 'works', route: '/#/works', heading: '每一份创作，都值得留下。' },
  ]
  for (const [index, width] of [1480, 810, 375].entries()) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 980 })
    for (const screen of screens) {
      await page.goto(screen.route)
      await expect(page.getByRole('heading', { level: 1 })).toContainText(screen.heading)
      const links = page.getByRole('navigation', { name: '主导航' }).getByRole('link')
      // 管理员账户主导航共 9 项（含码穹、家庭管理）。
      await expect(links).toHaveCount(9)
      for (const link of await links.all()) await expect(link).toBeVisible()
      // 每个主导航项都要渲染图标（「我的成长」与「家庭管理」暂时共用兜底图标）。
      const icons = await page
        .locator('.nav-icon svg')
        .evaluateAll((elements) => elements.map((e) => e.innerHTML))
      expect(icons).toHaveLength(9)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)
      if (screen.name === 'adventure') {
        await page.getByRole('button', { name: '提示', exact: true }).click()
        await expect(page.getByRole('region', { name: '换一种办法试试' })).toBeVisible()
        await expect(page.getByLabel('线索进度')).toContainText('已发现')
        await page
          .getByTestId('adventure-investigation')
          .screenshot({ path: `test-results/style-investigation-${width}.png` })
        await page.evaluate(() => window.scrollTo(0, 0))
      }
      await page.screenshot({ path: `test-results/style-${screen.name}-${width}.png` })
    }
  }
})

test('小奇输入和创作工作台在手机上可操作，减少动效时仍有键盘焦点', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
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
  await page.goto('/#/adventure/town-cup-order')
  await page.getByRole('button', { name: '提示', exact: true }).click()
  await page.getByText('问问小奇', { exact: true }).click()
  const question = page.getByLabel('问课堂小奇')
  await expect(question).toBeVisible()
  await expect(page.getByRole('button', { name: '陪我找线索', exact: true })).toBeDisabled()
  await question.fill('我换了顺序，为什么还是漏奶？')
  await expect(page.getByRole('button', { name: '陪我找线索', exact: true })).toBeEnabled()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: '陪我找线索', exact: true })).toBeFocused()
  expect(
    await page
      .getByRole('button', { name: '陪我找线索', exact: true })
      .evaluate((e) => getComputedStyle(e).outlineStyle),
  ).toBe('solid')
  await page
    .getByTestId('adventure-investigation')
    .screenshot({ path: 'test-results/style-companion-desktop.png' })
  await page.setViewportSize({ width: 375, height: 812 })
  await question.focus()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page
    .getByTestId('adventure-investigation')
    .screenshot({ path: 'test-results/style-companion-mobile.png' })
  const response = await page.request.post('/api/projects', {
    headers: await administratorHeaders(page),
    data: {
      title: '珍珠太空站',
      scene: 'milk-tea',
      files: [{ path: 'main.py', content: 'from xuya.stage import cup, pearl\ncup()\npearl(3)\n' }],
    },
  })
  expect(response.ok()).toBe(true)
  const project = await response.json()
  for (const width of [1480, 810, 375]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 980 })
    await page.goto('/#/studio/' + project.id)
    await expect(page.getByLabel('给创作室作品起个名字')).toHaveValue('珍珠太空站')
    await expect(page.locator('.monaco-editor')).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await page
      .locator('.studio-workspace')
      .screenshot({ path: `test-results/style-workspace-${width}.png` })
  }
})
