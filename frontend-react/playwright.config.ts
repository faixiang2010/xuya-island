import { defineConfig } from '@playwright/test'

if (process.env.XUYA_E2E_ISOLATED !== '1' || !process.env.XUYA_TEST_URL)
  throw new Error(
    '请使用 npm.cmd --prefix frontend-react run test:e2e，自动启动临时数据库，避免误写正式学习数据。',
  )

export default defineConfig({
  testDir: './tests',
  timeout: 150000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.XUYA_TEST_URL,
    channel: 'chrome',
    viewport: { width: 1480, height: 980 },
    trace: 'retain-on-failure',
  },
  reporter: 'list',
})
