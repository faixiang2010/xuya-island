import { expect, test, type Page } from '@playwright/test'
import { missionSize, typingGames } from '../src/games/content'
async function finishLevel(page: Page, gameId: 'keyboard' | 'pinyin', levelIndex: number) {
  const game = typingGames[gameId]
  const level = game.levels[levelIndex]
  await page.goto('/#/games/' + gameId + '?level=' + level.id)
  const input = page.getByLabel(gameId === 'keyboard' ? '输入字母或数字' : '用拼音输入法输入汉字')
  for (const [index, task] of level.tasks.entries()) {
    if (index > 0 && index % missionSize === 0)
      await page.getByRole('button', { name: '再送一组 →', exact: true }).click()
    await expect(page.getByTestId('typing-target')).toHaveText(task.target)
    await input.fill(task.target)
    if (index === level.tasks.length - 1 || (index + 1) % missionSize === 0)
      await expect(page.getByTestId('mission-result')).toBeVisible()
    else await expect(page.getByTestId('typing-target')).toHaveText(level.tasks[index + 1].target)
  }
  await expect(page.getByRole('heading', { name: '这一轮卡片都送到了！' })).toBeVisible()
}
test('大小写五级与汉字三级完成后地图推进，刷新记录保留', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '我的探险手册' })).toBeVisible()
  await expect(page.getByRole('list', { name: '学习步骤' }).locator('li')).toHaveCount(8)
  await expect(page.getByRole('link', { name: '开始 / 继续' })).toHaveAttribute(
    'href',
    '#/games/keyboard?level=letters',
  )
  for (let i = 0; i < typingGames.keyboard.levels.length; i++)
    await finishLevel(page, 'keyboard', i)
  await page.getByRole('button', { name: '再玩一次' }).click()
  await expect(page.getByTestId('typing-target')).toHaveText('a1')
  await page.goto('/')
  await expect(page.getByRole('link', { name: '开始 / 继续' })).toHaveAttribute(
    'href',
    '#/games/pinyin?level=characters',
  )
  await page.reload()
  await expect(page.getByRole('list', { name: '学习步骤' })).toContainText('5 / 5 级已练完')
  for (let i = 0; i < typingGames.pinyin.levels.length; i++) await finishLevel(page, 'pinyin', i)
  await page.goto('/')
  await expect(page.getByRole('link', { name: '开始 / 继续' })).toHaveAttribute(
    'href',
    '#/classroom/story-cover',
  )
  await page.screenshot({ path: 'test-results/playful-map.png', fullPage: true })
  await page.getByRole('link', { name: '开始 / 继续' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('故事海报：顺序有秘密')
})
test('严格区分大小写，错误保留，Shift输入自动校验，正确前缀不误判', async ({ page }) => {
  await page.goto('/#/games/keyboard?level=uppercase')
  const input = page.getByLabel('输入字母或数字')
  await expect(page.getByTestId('typing-target')).toHaveText('F')
  await input.fill('f')
  await expect(page.getByRole('status')).toContainText('大写 F')
  await expect(input).toHaveValue('f')
  await expect(page.getByRole('button', { name: '检查答案' })).toHaveCount(0)
  await input.fill('')
  await input.press('Shift+F')
  await expect(page.getByTestId('typing-target')).toHaveText('J')
  await expect(input).toBeFocused()
  await page.screenshot({ path: 'test-results/playful-uppercase.png', fullPage: true })
  await page.goto('/#/games/keyboard?level=mixed')
  await input.fill('a')
  await expect(page.getByRole('status')).toContainText('接着输入')
  await expect(page.getByTestId('typing-target')).toHaveText('a1')
  await input.fill('a1')
  await expect(page.getByTestId('typing-target')).toHaveText('A1')
  await input.fill('a1')
  await expect(page.getByRole('status')).toContainText('大写 A')
})
test('中文选字与重复组合事件不会误判或跳两题，短句可分次选字', async ({ page }) => {
  await page.goto('/#/games/pinyin')
  const input = page.getByLabel('用拼音输入法输入汉字')
  await input.fill('shan')
  await expect(page.getByRole('status')).toContainText('选出汉字')
  await input.dispatchEvent('compositionstart')
  await input.fill('山')
  await input.press('Enter')
  await expect(page.getByRole('status')).toContainText('正在选字')
  await expect(page.getByTestId('typing-target')).toHaveText('山')
  await input.dispatchEvent('compositionend')
  await input.dispatchEvent('compositionend')
  await expect(page.getByTestId('typing-target')).toHaveText('水')
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('xuya:typing-progress:v2')!).drafts[0].nextIndex,
    ),
  ).toBe(1)
  await page.goto('/#/games/pinyin?level=sentences')
  await input.fill('你好')
  await expect(page.getByRole('status')).toContainText('接着输入')
  await input.fill('你好朋友')
  await expect(page.getByTestId('typing-target')).toHaveText('小鸟飞上天')
  await page.screenshot({ path: 'test-results/playful-pinyin.png', fullPage: true })
})
test('六卡任务可休息，中途游标刷新恢复，不把一组当成整个级别', async ({ page }) => {
  await page.goto('/#/games/keyboard')
  const input = page.getByLabel('输入字母或数字')
  for (const [index, target] of ['f', 'j', 'a', 's', 'd', 'g'].entries()) {
    await expect(page.getByTestId('typing-target')).toHaveText(target)
    await input.fill(target)
    if (index < 5) await expect(page.getByTestId('typing-target')).not.toHaveText(target)
  }
  await expect(page.getByTestId('mission-result')).toBeVisible()
  await expect(page.getByRole('button', { name: '再送一组 →' })).toBeVisible()
  await page.screenshot({ path: 'test-results/playful-checkpoint.png', fullPage: true })
  await page.getByRole('link', { name: '回到学习地图 →' }).click()
  await expect(page.getByRole('list', { name: '学习步骤' })).toContainText('6 / 26 卡 · 可继续')
  await page.getByRole('link', { name: '开始 / 继续' }).click()
  await expect(page.getByTestId('typing-target')).toHaveText('h')
  await page.reload()
  await expect(page.getByTestId('typing-target')).toHaveText('h')
  await page.getByRole('button', { name: '歇一会', exact: true }).click()
  await expect(page.getByRole('heading', { name: '歇一会，线索留在这里' })).toBeVisible()
  await page.getByRole('button', { name: '继续这次冒险 →' }).click()
  await expect(input).toBeFocused()
})
test('损坏与旧缓存安全迁移，存储失败仍可练习且明确提示', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('xuya:typing-progress:v2', '{broken')
    localStorage.setItem(
      'xuya:typing-progress:v1',
      JSON.stringify({
        version: 1,
        records: [
          {
            gameId: 'keyboard',
            levelId: 'letters',
            attempts: 26,
            completedAt: new Date().toISOString(),
          },
          {
            gameId: 'keyboard',
            levelId: 'mixed',
            attempts: 8,
            completedAt: new Date().toISOString(),
          },
        ],
      }),
    )
  })
  await page.goto('/')
  await expect(page.getByRole('link', { name: '开始 / 继续' })).toHaveAttribute(
    'href',
    '#/games/keyboard?level=uppercase',
  )
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'xuya:typing-progress:v2') throw new DOMException('full', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  await page.reload()
  await finishLevel(page, 'pinyin', 2)
  await expect(page.getByRole('alert')).toContainText('不能保存练习记录')
  await page.getByRole('link', { name: '回到学习地图 →' }).click()
  await expect(page.getByRole('alert')).toContainText('无法保存游戏练习记录')
  await page.goto('/#/games/unknown')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('游戏中心')
})
test('主题、琴音与减少动画可选择和恢复，静音时不创建新声音', async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as Window & { __learningTones?: number }
    state.__learningTones = 0
    const original = AudioContext.prototype.createOscillator
    AudioContext.prototype.createOscillator = function () {
      state.__learningTones!++
      return original.call(this)
    }
  })
  await page.goto('/#/games/keyboard?level=numbers')
  await page.getByRole('button', { name: '星光琴房', exact: true }).click()
  await expect(page.locator('.app-shell')).toHaveAttribute('data-learning-theme', 'piano')
  await page.getByRole('button', { name: '开启琴音', exact: true }).click()
  const input = page.getByLabel('输入字母或数字')
  await input.fill('1')
  await expect(page.getByTestId('typing-target')).toHaveText('2')
  await expect
    .poll(() =>
      page.evaluate(() => (window as Window & { __learningTones?: number }).__learningTones),
    )
    .toBeGreaterThan(0)
  await page.getByRole('button', { name: '琴音已开', exact: true }).click()
  const before = await page.evaluate(
    () => (window as Window & { __learningTones?: number }).__learningTones,
  )
  await input.fill('2')
  await expect(page.getByTestId('typing-target')).toHaveText('3')
  expect(
    await page.evaluate(() => (window as Window & { __learningTones?: number }).__learningTones),
  ).toBe(before)
  await page.getByRole('button', { name: '减少动画', exact: true }).click()
  await expect(page.locator('.app-shell')).toHaveAttribute('data-learning-motion', 'quiet')
  await page.reload()
  await expect(page.getByRole('button', { name: '星光琴房', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByRole('button', { name: '恢复动画', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByRole('button', { name: '开启琴音', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await page.screenshot({ path: 'test-results/playful-piano.png', fullPage: true })
  for (const target of ['3', '4', '5', '6', '7', '8']) {
    await expect(page.getByTestId('typing-target')).toHaveText(target)
    await input.fill(target)
    if (target === '8') await expect(page.getByTestId('mission-result')).toBeVisible()
    else await expect(page.getByTestId('typing-target')).not.toHaveText(target)
  }
  await page.getByRole('button', { name: '重听这段旋律', exact: true }).click()
  await expect(page.getByRole('button', { name: '琴音已开', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect
    .poll(() =>
      page.evaluate(() => (window as Window & { __learningTones?: number }).__learningTones),
    )
    .toBeGreaterThan(0)
  await page.screenshot({ path: 'test-results/playful-piano-result.png', fullPage: true })
  await page.getByRole('button', { name: '琴音已开', exact: true }).click()
  await page.getByRole('button', { name: '云朵绘画馆', exact: true }).click()
  await expect(page.locator('.app-shell')).toHaveAttribute('data-learning-theme', 'painting')
  await page.screenshot({ path: 'test-results/playful-painting.png', fullPage: true })
})
test('目标与输入框在桌面首屏可见，小屏可用级别选择和收起的设置', async ({ page }) => {
  for (const viewport of [
    { width: 1480, height: 980 },
    { width: 1265, height: 710 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/#/games/keyboard?level=uppercase')
    await expect(page.getByTestId('typing-target')).toHaveText('F')
    const input = page.getByLabel('输入字母或数字')
    await expect(input).toBeVisible()
    const bounds = await input.boundingBox()
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height)
    await input.fill('f')
    await expect(page.getByRole('status')).toContainText('大写 F')
    const feedback = await page.getByRole('status').boundingBox()
    expect(feedback!.y + feedback!.height).toBeLessThanOrEqual(viewport.height)
    await page.screenshot({ path: `test-results/playful-first-screen-${viewport.width}.png` })
  }
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/#/games/keyboard')
  await expect(page.getByLabel('选择练习级别')).toBeVisible()
  await page.getByLabel('选择练习级别').selectOption('uppercase')
  await expect(page.getByTestId('typing-target')).toHaveText('F')
  await page.getByText('粉色侦探社 · 主题、琴音和动画', { exact: true }).click()
  await page.getByRole('button', { name: '星光琴房', exact: true }).click()
  await expect(page.locator('.app-shell')).toHaveAttribute('data-learning-theme', 'piano')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({ path: 'test-results/playful-compact-mobile.png', fullPage: true })
})
test('三段本地视频可播放、暂停与显示字幕文字版，课堂短任务仍保留编辑运行', async ({ page }) => {
  for (const item of [
    { route: '/#/games/keyboard', title: '大小写怎样切换', seconds: 12 },
    { route: '/#/games/pinyin', title: '拼音怎样变成汉字', seconds: 12 },
    { route: '/#/classroom/story-cover', title: '改一个名字，看看程序的变化', seconds: 15 },
  ]) {
    await page.goto(item.route)
    await page.getByText('看一段演示：' + item.title, { exact: false }).click()
    const video = page.getByLabel(item.title, { exact: true })
    await expect(video).toBeVisible()
    await expect
      .poll(() => video.evaluate((element) => (element as HTMLVideoElement).duration))
      .toBeCloseTo(item.seconds, 0)
    expect(await video.locator('source').getAttribute('src')).toMatch(
      /^\/media\/learning\/.*\.mp4$/,
    )
    await expect(video.locator('track')).toHaveAttribute('srclang', 'zh')
    await video.evaluate(async (element) => {
      const player = element as HTMLVideoElement
      player.currentTime = 4
      await player.play()
    })
    await expect
      .poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime))
      .toBeGreaterThan(4.2)
    await video.evaluate((element) => (element as HTMLVideoElement).pause())
    expect(await video.evaluate((element) => (element as HTMLVideoElement).paused)).toBe(true)
    await page.getByText('文字版演示', { exact: true }).click()
    if (item.seconds === 15)
      await page.screenshot({ path: 'test-results/playful-program-video.png', fullPage: true })
  }
  const quest = page.getByRole('region', { name: '今天的小冒险' })
  await quest.getByRole('button', { name: '2 · 只改一处' }).click()
  await expect(quest).toContainText('月光森林')
  await quest.getByRole('button', { name: '到代码里试试 →' }).click()
  await expect(page.getByRole('textbox', { name: 'Python 代码编辑器', exact: true })).toBeVisible()
})
