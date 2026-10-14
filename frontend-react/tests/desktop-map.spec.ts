import { expect, test, type Page } from '@playwright/test'

async function expectSingleScreen(page: Page, width: number, height: number) {
  expect(
    await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      scroll: window.scrollY,
    })),
  ).toEqual({ width, height, scroll: 0 })
  const targets = page
    .getByRole('list', { name: '学习步骤' })
    .getByRole('button')
    .or(page.getByRole('link', { name: '开始 / 继续', exact: true }))
  for (const target of await targets.all()) {
    const box = await target.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    expect(box!.y + box!.height).toBeLessThanOrEqual(height)
  }
}

test('桌面Chrome全部八站、开始入口与展开说明始终在一屏，背景铺满且纸页对齐', async ({ page }) => {
  for (const [width, height] of [
    [1920, 1040],
    [1920, 960],
    [1536, 744],
    [1366, 648],
    [1280, 600],
    [2560, 1320],
  ]) {
    await page.setViewportSize({ width, height })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('我的探险手册')
    await expectSingleScreen(page, width, height)
    const main = page.locator('main.home-page')
    const shell = page.locator('.main-shell')
    const mainBox = (await main.boundingBox())!
    const shellBox = (await shell.boundingBox())!
    expect(mainBox.x).toBe(shellBox.x)
    expect(mainBox.width).toBe(shellBox.width)
    expect(mainBox.x + mainBox.width).toBe(width)
    expect(await main.evaluate((element) => getComputedStyle(element).backgroundImage)).toContain(
      'desktop-paper.webp',
    )
    const task = page.getByRole('region', { name: '当前学习任务' })
    const start = page.getByRole('link', { name: '开始 / 继续', exact: true })
    const taskGeometry = await task.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return {
        left: rect.x + parseFloat(style.paddingLeft),
        right: rect.right - parseFloat(style.paddingRight),
        background: style.backgroundImage,
      }
    })
    const startBox = (await start.boundingBox())!
    expect(Math.abs(startBox.x - taskGeometry.left)).toBeLessThan(1)
    expect(Math.abs(startBox.x + startBox.width - taskGeometry.right)).toBeLessThan(1)
    expect(taskGeometry.background).toContain('task-paper.webp')
    await page.screenshot({ path: `test-results/desktop-map-${width}-${height}.png` })
    const stages = page.getByRole('list', { name: '学习步骤' }).getByRole('button')
    for (const stage of await stages.all()) {
      await stage.click()
      await expectSingleScreen(page, width, height)
      await task.locator('summary').click()
      await expect(task.locator('details')).toHaveAttribute('open', '')
      await expectSingleScreen(page, width, height)
      await task.locator('summary').click()
    }
  }
})

test('桌面切换六个学习菜单时导航位置与尺寸固定', async ({ page }) => {
  for (const [width, height] of [
    [1920, 960],
    [1366, 648],
  ]) {
    await page.setViewportSize({ width, height })
    let baseline: { x: number; y: number; width: number; height: number }[] | undefined
    for (const route of [
      '/',
      '/#/games',
      '/#/classroom',
      '/#/adventure/town-cup-order',
      '/#/studio',
      '/#/works',
    ]) {
      await page.goto(route)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const links = page.getByRole('navigation', { name: '主导航' }).getByRole('link')
      await expect(links).toHaveCount(7)
      const geometry = await links.evaluateAll((elements) =>
        elements.map((element) => {
          const { x, y, width, height } = element.getBoundingClientRect()
          return { x, y, width, height }
        }),
      )
      if (!baseline) baseline = geometry
      else expect(geometry).toEqual(baseline)
      if (route === '/#/games')
        await page.screenshot({ path: `test-results/desktop-games-${width}-${height}.png` })
    }
  }
})
