import { expect, test } from '@playwright/test'
import type { Curriculum } from '../src/types'
import { signInAsAdministrator } from './support/session'

test.beforeEach(async ({ page }) => {
  await signInAsAdministrator(page)
})

test('侧栏编程课堂展示全部六阶段和 48 个可打开的活动', async ({ page }) => {
  await page.goto('/')
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: '编程课堂' })
    .click()
  await expect(page).toHaveURL(/#\/classroom$/)
  await expect(page.getByRole('heading', { level: 1, name: '编程课堂', exact: true })).toBeVisible()
  await expect(page.getByLabel('学习阶段')).toHaveValue('all')
  await expect(page.locator('section[aria-labelledby^="phase-"]')).toHaveCount(6)
  await expect(page.locator('.lesson-card')).toHaveCount(48)
  const curriculum: Curriculum = await (await page.request.get('/api/curriculum')).json()
  const links = await page
    .locator('.lesson-card')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('href')))
  expect(links).toEqual(
    curriculum.lessons
      .sort((a, b) => a.number - b.number)
      .map((lesson) => `#/classroom/${lesson.id}`),
  )
  for (const phase of curriculum.phases) {
    const section = page.locator(`section[aria-labelledby="phase-${phase.id}"]`)
    await expect(section.locator('.lesson-card')).toHaveCount(8)
    await expect(section).toContainText(phase.project)
  }
  await page.screenshot({ path: 'test-results/classroom-catalog.png', fullPage: true })
  await page.locator('.lesson-card').first().click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('故事海报：顺序有秘密')
  await page.getByRole('link', { name: '← 返回编程课堂', exact: true }).click()
  await expect(page.locator('.lesson-card')).toHaveCount(48)
})

test('阶段筛选能打开最后一课，旧画笔入口保留，手机目录没有横向溢出', async ({ page }) => {
  await page.goto('/')
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: '编程课堂' })
    .click()
  await page.getByLabel('学习阶段').selectOption('studio')
  await expect(page.locator('section[aria-labelledby^="phase-"]')).toHaveCount(1)
  await expect(page.locator('.lesson-card')).toHaveCount(8)
  await page.locator('.lesson-card').last().click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('项目六：完成、存档与展示')
  await page.getByRole('link', { name: '← 返回编程课堂', exact: true }).click()
  await expect(page.locator('.lesson-card')).toHaveCount(48)
  await page.getByRole('link', { name: '画笔试验场 →', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('画笔试验场')
  await page.getByRole('link', { name: '← 返回编程课堂', exact: true }).click()
  await page.setViewportSize({ width: 375, height: 812 })
  await expect(page.getByLabel('学习阶段')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.getByLabel('学习阶段').selectOption('art')
  await expect(page.locator('.lesson-card')).toHaveCount(8)
  await expect(
    page.getByRole('heading', { name: '用循环画画 · 生成艺术坊', exact: true }),
  ).toBeVisible()
  await page.screenshot({ path: 'test-results/classroom-catalog-mobile.png', fullPage: true })
})
