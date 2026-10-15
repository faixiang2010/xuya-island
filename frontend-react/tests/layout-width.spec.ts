import { expect, test, type Page } from '@playwright/test'

const routes: [string, string][] = [
  ['home', ''],
  ['games', 'games'],
  ['catalog', 'classroom'],
  ['classroom', 'classroom/story-cover'],
  ['adventure', 'adventure/town-cup-order'],
  ['studio', 'studio'],
  ['works', 'works'],
  ['growth', 'growth'],
]

/** 两侧留白合计上限：超过它说明页面又变成了窄居中块，两侧出现大块空白。 */
const gapLimit = 100

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
}

/** 内容块相对主内容区两侧的留白。 */
function outerGaps(page: Page, contentSelector: string) {
  return page.evaluate((selector) => {
    const shell = document.querySelector('.main-shell')
    const content = document.querySelector(selector)
    if (!shell || !content) return null
    const shellRect = shell.getBoundingClientRect()
    const contentRect = content.getBoundingClientRect()
    return {
      left: Math.round(contentRect.left - shellRect.left),
      right: Math.round(shellRect.right - contentRect.right),
    }
  }, contentSelector)
}

test('各页正文按可用宽度铺开，不在两侧留大块空白', async ({ page }) => {
  test.setTimeout(300000)
  for (const width of [1480, 1920, 2560]) {
    await page.setViewportSize({ width, height: 980 })
    await page.goto('/#/')
    await page.waitForTimeout(900)
    const login = await outerGaps(page, '.passport-spread')
    if (login) {
      expect(login.left + login.right, `登录页 @${width} 两侧留白`).toBeLessThanOrEqual(gapLimit)
      await page.screenshot({ path: `test-results/layout-login-${width}.png` })
    }
  }

  await administrator(page)
  for (const width of [1480, 1920, 2560]) {
    await page.setViewportSize({ width, height: 980 })
    for (const [name, route] of routes) {
      await page.goto('/#/' + route)
      await page.waitForTimeout(900)
      const gaps = await page.evaluate(() => {
        const shell = document.querySelector('.main-shell')
        const main = document.querySelector('main')
        const content = main?.firstElementChild ?? main
        if (!shell || !content) return null
        const shellRect = shell.getBoundingClientRect()
        const contentRect = content.getBoundingClientRect()
        return {
          left: Math.round(contentRect.left - shellRect.left),
          right: Math.round(shellRect.right - contentRect.right),
        }
      })
      expect(gaps, `${name} @${width} 找不到内容块`).not.toBeNull()
      expect(gaps!.left + gaps!.right, `${name} @${width} 两侧留白`).toBeLessThanOrEqual(gapLimit)
      await page.screenshot({ path: `test-results/layout-${name}-${width}.png` })
    }
  }
})
