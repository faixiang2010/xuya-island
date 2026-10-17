import { expect, test, type Page } from '@playwright/test'
import { signInAsAdministrator } from './support/session'

test.beforeEach(async ({ page }) => {
  await signInAsAdministrator(page)
})

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
  // 账户体系下每个用例开始即已登录，登录页留白不再进入这里，只校验登录后的正式页面。
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
