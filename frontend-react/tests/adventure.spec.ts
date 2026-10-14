import { expect, test, type Page } from '@playwright/test'

async function edit(page: Page, code: string) {
  const editor = page.getByRole('textbox', { name: 'Python 代码编辑器', exact: true })
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await editor.focus()
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.evaluate((value) => navigator.clipboard.writeText(value), code)
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Control+V')
  await expect
    .poll(() =>
      page.evaluate(() => {
        const id = location.hash.split('/adventure/')[1].split('?')[0]
        return JSON.parse(localStorage.getItem(`xuya:adventure:absurd-town-1.0:${id}`) ?? '{}').code
      }),
    )
    .toBe(code)
}
async function run(page: Page) {
  const button = page.getByRole('button', { name: '▶ 运行故事', exact: true })
  await expect(button).toBeEnabled({ timeout: 120000 })
  await button.click()
}

test('首页聚焦探险手册，故事与创作从主导航进入且旧家长地址返回首页', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('我的探险手册')
  await expect(page.getByRole('region', { name: '当前学习任务' })).toBeVisible()
  await expect(page.getByRole('link', { name: /^CASE \/ 0/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: '开始 / 继续', exact: true })).toHaveCount(1)
  const navigation = page.getByRole('navigation', { name: '主导航' })
  await expect(navigation.getByRole('link')).toHaveCount(7)
  await expect(navigation.getByRole('link', { name: '编程课堂', exact: false })).toHaveAttribute(
    'href',
    '#/classroom',
  )
  const story = navigation.getByRole('link', { name: '故事冒险', exact: false })
  await expect(story).toBeVisible()
  await story.click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('防漏测试：一滴都没进去')
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: '小奇创作室', exact: false })
    .click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('小奇创作室')
  await expect(page.locator('a[href="#/parent"]')).toHaveCount(0)
  await page.goto('/#/parent')
  await expect(page).toHaveURL(/#\/$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('我的探险手册')
  await page.screenshot({ path: 'test-results/town-home.png', fullPage: true })
})

test('执行顺序真的改变倒奶场景，检查通过，刷新保留且复制当前代码', async ({ page }) => {
  await page.goto('/#/adventure/town-cup-order')
  await run(page)
  await expect(page.getByTestId('stage-facts')).toContainText('漏奶 1', { timeout: 15000 })
  const code =
    'from xuya.stage import cup, pour, lid, say\ncup()\npour(1)\nlid()\nsay("桌子今天不用喝奶了。")'
  await edit(page, code)
  await run(page)
  await expect(page.getByTestId('stage-facts')).toContainText('杯中奶 1 · 漏奶 0', {
    timeout: 15000,
  })
  await expect(page.getByRole('button', { name: '检查场景', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '检查场景', exact: true }).click()
  await expect(page.getByTestId('adventure-check-passed')).toHaveCount(1, { timeout: 15000 })
  await expect(page.getByText(/第零号/, { exact: false })).toContainText('第零号')
  await expect(page.getByTestId('stage-facts')).toContainText('杯中奶 1 · 漏奶 0')
  await expect(page.getByRole('button', { name: '▶ 运行故事', exact: true })).toBeEnabled()
  await page.screenshot({ path: 'test-results/town-cup-fixed.png', fullPage: true })
  await page.reload()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('xuya:adventure:absurd-town-1.0:town-cup-order')!).code,
      ),
    )
    .toBe(code)
  await page.getByRole('button', { name: '带进小奇创作室 →', exact: true }).click()
  await expect(page).toHaveURL(/#\/studio\//)
  const id = page.url().split('/studio/')[1]
  const saved = await (await page.request.get(`/api/projects/${id}`)).json()
  expect(saved.lessonId).toBe('town-cup-order')
  expect(saved.files.find((file: { path: string }) => file.path === 'main.py').content).toBe(code)
  await expect(page.getByRole('link', { name: '开始自由共创 →', exact: true })).toBeVisible()
  await page.getByRole('link', { name: '开始自由共创 →', exact: true }).click()
  await expect(page.getByRole('button', { name: '帮我做出来', exact: true })).toBeVisible()
})

test('input 字符串拼接会制作33杯，转整数后多组真实订单检查通过', async ({ page }) => {
  await page.goto('/#/adventure/town-double-order')
  await page.getByText('调试：顾客预设回答', { exact: true }).click()
  await page.getByLabel('冒险输入方式').selectOption('preset')
  await run(page)
  await expect(page.getByTestId('stage-facts')).toContainText('饮品 33 杯', { timeout: 15000 })
  const episode = await (await page.request.get('/api/adventure/episodes/town-double-order')).json()
  await edit(page, episode.referenceCode)
  await expect(page.getByRole('button', { name: '检查场景', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '检查场景', exact: true }).click()
  await expect(page.getByTestId('adventure-check-passed')).toHaveCount(3, { timeout: 30000 })
  await expect(page.getByTestId('stage-facts')).toContainText('饮品 8 杯', { timeout: 15000 })
})
