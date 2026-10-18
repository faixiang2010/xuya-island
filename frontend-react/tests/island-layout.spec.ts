import { expect, test } from '@playwright/test'
import { typingGames } from '../src/games/content'
import type { Lesson, Progress } from '../src/types'
import { resetTypingProgress, seedAccountStorage, signInAsAdministrator } from './support/session'

test.beforeEach(async ({ page }) => {
  await signInAsAdministrator(page)
})

function completedTypingRecords() {
  return Object.values(typingGames).flatMap((game) =>
    game.levels.map((level) => ({
      gameId: game.id,
      levelId: level.id,
      levelVersion: level.version,
      completedAt: '2026-10-12T00:00:00.000Z',
      attempts: level.tasks.length,
    })),
  )
}

async function restoreTypingRecords(page: import('@playwright/test').Page) {
  // 草稿按账户隔离：写入带账户前缀的真实键，再完整重载让应用读到记录。
  await seedAccountStorage(page, {
    'xuya:typing-progress:v2': JSON.stringify({
      version: 2,
      records: completedTypingRecords(),
      drafts: [],
    }),
  })
}

test('探险手册只展示当前任务，八个阶段在宽屏、平板和手机清楚可选', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${message.text()} @ ${message.location().url}`)
  })
  // 服务端会累积前序用例的练习记录，这里恢复干净地图再验证默认任务。
  await resetTypingProgress(page)
  for (const [width, height] of [
    [1920, 1040],
    [1480, 980],
    [1487, 1058],
    [1265, 710],
    [810, 980],
    [375, 812],
  ]) {
    await page.setViewportSize({ width, height })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('我的探险手册')
    const task = page.getByRole('region', { name: '当前学习任务' })
    await expect(task).toBeVisible()
    const island = page.getByTestId('learning-island')
    const image = island.locator('img').first()
    if (width > 600) {
      await expect(image).toBeVisible()
      await expect
        .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0)
    } else {
      await expect(island.getByText('按编号探索，选一站看看要学什么。')).toBeVisible()
      await expect(island.locator('button svg')).toHaveCount(8)
    }
    const landmarks = page.getByRole('list', { name: '学习步骤' }).getByRole('button')
    await expect(landmarks).toHaveCount(8)
    await expect(landmarks.nth(0)).toContainText('认识键盘')
    await expect(landmarks.nth(0)).toHaveAttribute('aria-current', 'step')
    await expect(landmarks.nth(0)).toHaveAttribute('aria-pressed', 'true')
    await expect(landmarks.nth(6)).toContainText('可选探索')
    await expect(landmarks.nth(7)).toContainText('可选探索')
    const details = task.locator('details').filter({ hasText: '学习详情' })
    await expect(details).toHaveCount(1)
    expect(await details.evaluate((element) => (element as HTMLDetailsElement).open)).toBe(false)
    const start = page.getByRole('link', { name: '开始 / 继续', exact: true })
    await expect(start).toHaveCount(1)
    await expect(start).toHaveAttribute('href', '#/games/keyboard?level=letters')
    if (width === 1480 || width === 1265) {
      const box = await start.boundingBox()
      expect(box!.y).toBeGreaterThanOrEqual(0)
      expect(box!.y + box!.height).toBeLessThanOrEqual(height)
    }
    const [taskBox, islandBox] = await Promise.all([task.boundingBox(), island.boundingBox()])
    expect(
      taskBox!.x + taskBox!.width <= islandBox!.x ||
        islandBox!.x + islandBox!.width <= taskBox!.x ||
        taskBox!.y + taskBox!.height <= islandBox!.y ||
        islandBox!.y + islandBox!.height <= taskBox!.y,
    ).toBe(true)
    const boxes = await landmarks.evaluateAll((elements) =>
      elements.map((element) => {
        const { x, y, width, height } = element.getBoundingClientRect()
        return { x, y, width, height }
      }),
    )
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const left = boxes[a],
          right = boxes[b]
        expect(
          left.x + left.width <= right.x ||
            right.x + right.width <= left.x ||
            left.y + left.height <= right.y ||
            right.y + right.height <= left.y,
          `${width}px 下第 ${a + 1} 站与第 ${b + 1} 站的点击区不能重叠`,
        ).toBe(true)
      }
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await island.screenshot({ path: `test-results/island-map-${width}.png` })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `test-results/island-home-${width}.png` })
    if (width <= 850)
      await page.screenshot({ path: `test-results/island-full-${width}.png`, fullPage: true })
  }
  expect(errors).toEqual([])
})

test('鼠标与键盘选择阶段后，共享任务更新并从唯一主入口进入学习', async ({ page }) => {
  // 需要干净地图来验证默认推荐起点：整轮运行共用同一个账户，前面的用例可能已经上过
  // 第一课，这里把课堂进度和打字记录都屏蔽掉，推荐起点才会回到第一课。
  await page.route('**/api/progress', (route) => route.fulfill({ json: [] }))
  await resetTypingProgress(page)
  await page.goto('/')
  const steps = page.getByRole('list', { name: '学习步骤' }).getByRole('button')
  const task = page.getByRole('region', { name: '当前学习任务' })
  const start = page.getByRole('link', { name: '开始 / 继续', exact: true })
  await steps.nth(1).click()
  await expect(steps.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(steps.nth(0)).toHaveAttribute('aria-pressed', 'false')
  await expect(task).toContainText('拼音打字')
  await expect(task).toContainText('输入拼音')
  await expect(task).toContainText('未开始')
  await expect(start).toHaveAttribute('href', '#/games/pinyin?level=six-up-1')
  await expect(page).toHaveURL(/\/#?\/?$/)
  await start.click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('拼音汉字小站')

  await page.goto('/')
  await steps.nth(2).focus()
  await expect(steps.nth(2)).toBeFocused()
  await steps.nth(2).press('Enter')
  await expect(steps.nth(2)).toHaveAttribute('aria-pressed', 'true')
  await expect(task).toContainText('第一段程序')
  await expect(start).toHaveAttribute('href', '#/classroom/story-cover')
  await steps.nth(2).press('Escape')
  await expect(steps.nth(0)).toBeFocused()
  await expect(steps.nth(0)).toHaveAttribute('aria-pressed', 'true')
  await steps.nth(2).focus()
  await steps.nth(2).press('Space')
  await page.getByRole('button', { name: '回到推荐起点' }).press('Enter')
  await expect(steps.nth(0)).toBeFocused()
  await steps.nth(2).click()
  await start.focus()
  await start.press('Enter')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('故事海报：顺序有秘密')
})

test('恢复两款打字游戏的完成记录后，默认任务推进至第一段程序', async ({ page }) => {
  await page.route('**/api/progress', (route) => route.fulfill({ json: [] }))
  await restoreTypingRecords(page)
  await page.goto('/')
  const steps = page.getByRole('list', { name: '学习步骤' }).getByRole('button')
  await expect(steps.nth(2)).toHaveAttribute('aria-current', 'step')
  await expect(steps.nth(2)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('region', { name: '当前学习任务' })).toContainText('第一段程序')
  await expect(page.getByRole('link', { name: '开始 / 继续', exact: true })).toHaveAttribute(
    'href',
    '#/classroom/story-cover',
  )
  await page.reload()
  await expect(steps.nth(2)).toHaveAttribute('aria-current', 'step')
})

test('课程暂无数据时保留等待状态，不误报主线完成', async ({ page }) => {
  await page.route('**/api/lessons', (route) => route.fulfill({ json: [] }))
  await restoreTypingRecords(page)
  await page.goto('/')
  const task = page.getByRole('region', { name: '当前学习任务' })
  await expect(task).toContainText('第一段程序')
  await expect(task).toContainText('等待课程连接')
  await expect(task).not.toContainText('主线已完成')
  await expect(page.getByRole('link', { name: '开始 / 继续', exact: true })).toHaveAttribute(
    'href',
    '#/classroom',
  )
})

test('主线完成可创作，可选阶段独立选择；旧版本和复习记录仍重新推荐', async ({ page }) => {
  const response = await page.request.get('/api/lessons')
  expect(response.ok()).toBe(true)
  const lessons: Lesson[] = await response.json()
  const main = lessons.filter((lesson) => lesson.number > 0 && lesson.track === 'core')
  const completed: Progress[] = main.map((lesson) => ({
    lessonId: lesson.id,
    lessonVersion: lesson.version,
    status: 'completed',
    hintLevel: 0,
    referenceViewed: false,
    reflection: '',
    parentObservation: '',
    updatedAt: '2026-10-12T00:00:00.000Z',
  }))
  const creation = lessons.find((lesson) => lesson.number > 0 && lesson.phaseId === 'studio')!
  let saved: Progress[] = [
    ...completed,
    {
      ...completed[0],
      lessonId: creation.id,
      lessonVersion: creation.version,
      status: 'needs-review',
    },
  ]
  await page.route('**/api/progress', (route) => route.fulfill({ json: saved }))
  await restoreTypingRecords(page)
  await page.goto('/')
  const task = page.getByRole('region', { name: '当前学习任务' })
  const steps = page.getByRole('list', { name: '学习步骤' }).getByRole('button')
  const start = page.getByRole('link', { name: '开始 / 继续', exact: true })
  await expect(task).toContainText('推荐主线已完成')
  await expect(start).toHaveAttribute('href', '#/studio')
  await expect(start).toHaveText('开始创作')
  await task.locator('summary').click()
  await expect(task).toContainText('自由创作室 · 可以随时返回作品集')
  await expect(task).not.toContainText(creation.title)
  await expect(
    page.getByRole('list', { name: '学习步骤' }).locator('button[aria-pressed="true"]'),
  ).toHaveCount(0)
  await steps.nth(7).click()
  await expect(steps.nth(7)).toHaveAttribute('aria-pressed', 'true')
  await expect(start).toHaveAttribute('href', '#/classroom/' + creation.id)
  await page.getByRole('button', { name: '回到推荐起点' }).press('Enter')
  await expect(start).toBeFocused()
  await expect(start).toHaveAttribute('href', '#/studio')

  const review = main.find((lesson) => lesson.phaseId === 'interactive')!
  saved = completed.map((item) =>
    item.lessonId === review.id ? { ...item, status: 'needs-review' } : item,
  )
  await page.reload()
  await expect(task).toContainText('建议复习')
  await expect(steps.nth(3)).toHaveAttribute('aria-current', 'step')
  await expect(start).toHaveAttribute('href', '#/classroom/' + review.id)

  saved = completed.map((item, index) =>
    index === 0 ? { ...item, lessonVersion: 'old-version' } : item,
  )
  await page.reload()
  await expect(task).not.toContainText('主线已完成')
  await expect(steps.nth(2)).toHaveAttribute('aria-current', 'step')
})

test('练习设置与正文对齐且输入和反馈在桌面首屏可用', async ({ page }) => {
  for (const [width, height] of [
    [1920, 1040],
    [1480, 980],
    [1265, 710],
  ]) {
    await page.setViewportSize({ width, height })
    for (const game of ['keyboard', 'pinyin']) {
      await page.goto(`/#/games/${game}?level=${game === 'keyboard' ? 'uppercase' : 'six-up-1'}`)
      const input = page.getByRole('textbox')
      const round = page.getByRole('region', { name: '打字练习' })
      const settings = page.getByRole('region', { name: '练习设置' })
      const boundaries = await Promise.all([settings.boundingBox(), round.boundingBox()])
      expect(Math.abs(boundaries[0]!.x - boundaries[1]!.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(boundaries[0]!.width - boundaries[1]!.width)).toBeLessThanOrEqual(1)
      await input.fill(game === 'keyboard' ? 'f' : 'lv tan')
      await expect(page.getByRole('status')).toContainText(
        game === 'keyboard' ? '大写 F' : '选出汉字',
      )
      for (const element of [input, page.getByRole('status')]) {
        const box = await element.boundingBox()
        expect(box!.y).toBeGreaterThanOrEqual(0)
        expect(box!.y + box!.height).toBeLessThanOrEqual(height)
      }
      expect(await page.evaluate(() => window.scrollY)).toBe(0)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)
      await page.screenshot({ path: `test-results/island-${game}-${width}.png` })
    }
  }
})
