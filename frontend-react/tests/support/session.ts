import { expect, type Locator, type Page } from '@playwright/test'

/** 浏览器用例共用的本机管理员账号；临时库每次运行重新初始化。 */
export const TEST_ADMIN = {
  username: 'familyadmin',
  nickname: '家庭管理员',
  password: 'admin-password',
} as const

async function authState(page: Page) {
  return (await page.request.get('/api/v1/auth/state')).json()
}

async function shown(locator: Locator) {
  return locator.isVisible().catch(() => false)
}

/**
 * 保证用例开始前处于管理员已登录状态。
 *
 * 临时库未初始化时先创建管理员，并关闭验证码，让同一轮运行的后续用例可以直接
 * 登录；已初始化但未登录时用共用账号登录。判断状态只看页面元素，不在提交前调用
 * 接口，避免页面里的连接凭据被提前轮换。管理员同时具备学习者角色，课堂、游戏、
 * 创作与家庭管理页面都能访问。
 */
export async function signInAsAdministrator(page: Page) {
  await page.goto('/#/')
  const sidebar = page.locator('.sidebar')
  const account = page.getByLabel('账号', { exact: true })
  // 页面是异步渲染的：先等到登录卡片或主界面出现，再判断当前状态。
  await expect(sidebar.or(account).first()).toBeVisible({ timeout: 20000 })
  if (await shown(page.getByRole('heading', { name: '先请大人准备小岛' }))) {
    await account.fill(TEST_ADMIN.username)
    await page.getByLabel('管理员昵称').fill(TEST_ADMIN.nickname)
    await page.getByLabel('密码', { exact: true }).fill(TEST_ADMIN.password)
    await page.getByRole('button', { name: '准备好我的小岛' }).click()
  } else if (await shown(page.getByRole('button', { name: '出发，去探险' }))) {
    await account.fill(TEST_ADMIN.username)
    await page.getByLabel('密码', { exact: true }).fill(TEST_ADMIN.password)
    await page.getByRole('button', { name: '出发，去探险' }).click()
  }
  await expect(sidebar).toBeVisible({ timeout: 20000 })
  const current = await authState(page)
  if (current.csrf)
    await page.request.put('/api/v1/system/security', {
      headers: { Origin: process.env.XUYA_TEST_URL!, 'X-Xuya-CSRF': current.csrf },
      data: { captchaMode: 'off' },
    })
}

/** 当前会话的请求头，用于在用例里直接调用需要 CSRF 的接口。 */
export async function administratorHeaders(page: Page) {
  const current = await authState(page)
  return { Origin: process.env.XUYA_TEST_URL!, 'X-Xuya-CSRF': current.csrf }
}

/** 当前账户在浏览器存储里的前缀：草稿和进度按 user.id 隔离。 */
export async function accountStoragePrefix(page: Page) {
  const state = await authState(page)
  return `xuya:account:${state.user.id}:`
}

/**
 * 读取当前账户里按逻辑键后缀匹配的存储值。账户草稿都带 `xuya:account:{id}:`
 * 前缀，用例不能直接读无前缀键，但也不必关心具体账户 id。
 */
export async function scopedValue(page: Page, logicalKey: string) {
  return page.evaluate((key) => {
    const match = Object.keys(localStorage).find((item) => item.endsWith(key))
    return match ? localStorage.getItem(match) : null
  }, logicalKey)
}

/**
 * 按账户前缀写入浏览器存储并完整重载，让应用在新文档里读到种子数据。
 * 直接 `page.goto` 到 hash 路由只在同一文档内跳转，`addInitScript` 不会执行，
 * 因此这里用 evaluate 写入后 reload，确保下次渲染读到干净状态。
 */
export async function seedAccountStorage(page: Page, entries: Record<string, string>) {
  const prefix = await accountStoragePrefix(page)
  await page.evaluate(
    ({ prefix, entries }) => {
      for (const [key, value] of Object.entries(entries))
        localStorage.setItem(prefix + key, value)
    },
    { prefix, entries },
  )
  await page.reload()
}

/**
 * 清空当前账户的打字进度缓存，并让服务端进度接口返回空。
 *
 * 临时库在整轮运行里共用同一个管理员账户，服务端会累积前面用例的打字记录，
 * 需要“干净学习地图”的用例先清掉本地缓存并停用服务端合并，再完整重载页面。
 */
export async function resetTypingProgress(page: Page) {
  await page.route('**/api/v1/learning/typing-progress', (route) =>
    route.fulfill({ json: { version: 2, records: [], drafts: [] } }),
  )
  const prefix = await accountStoragePrefix(page)
  await page.evaluate((value) => {
    localStorage.removeItem(value + 'xuya:typing-progress:v2')
    localStorage.removeItem(value + 'xuya:typing-progress:v1')
  }, prefix)
  await page.reload()
}
