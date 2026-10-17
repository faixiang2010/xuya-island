import { expect, test } from '@playwright/test'
import { typingGames } from '../src/games/content'
import { passages } from '../src/games/passages'
import { scopedValue, signInAsAdministrator } from './support/session'

test.beforeEach(async ({ page }) => {
  await signInAsAdministrator(page)
})

test('指法学院显示全键盘十指分区，完成家位关卡后保存进度', async ({ page }) => {
  await page.goto('/#/games')
  await expect(page.getByRole('heading', { name: '进阶挑战' })).toBeVisible()
  await page.screenshot({
    path: '../.agent/evidence/typing-games-2026-10-17/games-1480.png',
    fullPage: true,
  })
  await page.goto('/#/games/finger?level=home')
  await expect(page.getByRole('heading', { name: '指法学院' })).toBeVisible()
  await expect(page.locator('kbd')).toHaveCount(61)
  await expect(page.getByText('左手食指')).toBeVisible()
  const keyboardBox = await page.locator('kbd').first().boundingBox()
  const handsBox = await page.getByTestId('finger-hands').boundingBox()
  expect(handsBox!.y).toBeGreaterThan(keyboardBox!.y)
  await page.screenshot({
    path: '../.agent/evidence/typing-games-2026-10-17/finger-1480.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 1366, height: 768 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({
    path: '../.agent/evidence/typing-games-2026-10-17/finger-1366.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 1920, height: 1040 })
  await page.screenshot({
    path: '../.agent/evidence/typing-games-2026-10-17/finger-1920.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 1480, height: 980 })
  await page.getByRole('button', { name: '开启盲打模式' }).click()
  await expect(page.locator('kbd').filter({ hasText: '·' }).first()).toBeVisible()
  await page.getByRole('button', { name: '显示键帽' }).click()
  const input = page.getByLabel('输入字母或数字')
  const level = typingGames.finger.levels.find((item) => item.id === 'home')!
  for (const [index, task] of level.tasks.entries()) {
    if (index > 0 && index % 6 === 0)
      await page.getByRole('button', { name: '再送一组 →', exact: true }).click()
    await expect(page.getByTestId('typing-target')).toHaveText(task.target)
    await input.fill(task.target)
    if (index === level.tasks.length - 1)
      await expect(page.getByTestId('mission-result')).toBeVisible()
  }
  await expect(page.getByRole('heading', { name: '这一轮卡片都送到了！' })).toBeVisible()
  await expect
    .poll(async () => {
      const raw = await scopedValue(page, 'xuya:typing-progress:v2')
      const saved = JSON.parse(raw ?? '{}')
      return saved.records?.some(
        (item: { gameId: string; levelId: string }) =>
          item.gameId === 'finger' && item.levelId === 'home',
      )
    })
    .toBe(true)
})

test('字母雨能生成词、暂停并击落第一个词', async ({ page }) => {
  await page.goto('/#/games/falling?level=letters')
  await expect(page.getByRole('heading', { name: '字母雨 · 词雨' })).toBeVisible()
  await page.getByRole('button', { name: /开始这一局/ }).click()
  const word = page.getByTestId('falling-word').first()
  await expect(word).toBeVisible({ timeout: 8000 })
  await page.waitForTimeout(1200)
  await page.screenshot({
    path: '../.agent/evidence/typing-games-2026-10-17/falling-1480.png',
    fullPage: true,
  })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: '歇一会，词先停在空中' })).toBeVisible()
  await page.getByRole('button', { name: '继续 →' }).click()
  const text = (await word.textContent())?.trim() ?? ''
  expect(text.length).toBeGreaterThan(0)
  await page.keyboard.type(text, { delay: 25 })
  await expect(page.getByText('击落 1 / 12')).toBeVisible({ timeout: 5000 })
})

test('字母雨可以切换难度并显示新目标', async ({ page }) => {
  await page.goto('/#/games/falling?level=letters')
  await page.getByRole('button', { name: '2 · 三字母词' }).click()
  await expect(page.getByRole('button', { name: '2 · 三字母词' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByRole('heading', { name: '2 · 三字母词' })).toBeVisible()
})

test('语文和英语课文分成两张卡，页面只显示各自的长篇', async ({ page }) => {
  await page.goto('/#/games')
  const chinese = page.getByRole('heading', { name: '语文课文' })
  const english = page.getByRole('heading', { name: '英语课文' })
  await expect(chinese).toBeVisible()
  await expect(english).toBeVisible()
  await expect(chinese.locator('..').getByText('六年级 · 语文部编版')).toBeVisible()
  await expect(chinese.locator('..').getByText('英语 PEP')).toHaveCount(0)
  await expect(english.locator('..').getByText('六年级 · 英语 PEP')).toBeVisible()
  await expect(english.locator('..').getByText('语文部编版')).toHaveCount(0)
  const chineseBox = await chinese.boundingBox()
  const englishBox = await english.boundingBox()
  expect(englishBox!.x).toBeGreaterThan(chineseBox!.x)
  await page.goto('/#/games/passage-en?level=how-can-i-get-there')
  await expect(page.locator('optgroup[label="英语 · 六年级上册"]')).toHaveCount(1)
  await expect(page.locator('optgroup[label="英语 · 六年级下册"]')).toHaveCount(1)
  await expect(page.locator('optgroup[label="语文 · 六年级上册"]')).toHaveCount(0)
})

test('课文打字逐段推进，完成后保存课文记录', async ({ page }) => {
  const passage = passages.find((item) => item.id === 'cao-yuan')!
  await page.goto('/#/games/passage?level=cao-yuan')
  await expect(page.getByRole('heading', { name: '语文课文' })).toBeVisible()
  await expect(page.locator('optgroup[label="语文 · 六年级上册"]')).toHaveCount(1)
  await expect(page.locator('optgroup[label="语文 · 六年级下册"]')).toHaveCount(1)
  await expect(page.locator('optgroup[label="英语 · 六年级上册"]')).toHaveCount(0)
  const input = page.getByLabel('用拼音输入法照着输入这一段')
  await expect(page.getByLabel('本段原文')).toHaveText(passage.segments[0])
  await page.screenshot({
    path: '../.agent/evidence/typing-games-2026-10-17/passage-1480.png',
    fullPage: true,
  })
  for (const [index, segment] of passage.segments.entries()) {
    await expect(page.getByLabel('本段原文')).toHaveText(segment)
    await input.fill(segment)
    if (index < passage.segments.length - 1)
      await expect(page.getByLabel('本段原文')).toHaveText(passage.segments[index + 1])
  }
  await expect(page.getByRole('heading', { name: '这篇课文打完啦' })).toBeVisible()
  await expect
    .poll(async () => {
      const raw = await scopedValue(page, 'xuya:typing-progress:v2')
      const saved = JSON.parse(raw ?? '{}')
      return saved.records?.some(
        (item: { gameId: string; levelId: string }) =>
          item.gameId === 'passage' && item.levelId === 'cao-yuan',
      )
    })
    .toBe(true)
})
