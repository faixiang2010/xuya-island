import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { existsSync, readFileSync } from 'node:fs'
const configuredPorts = new URL('../backend/config/ports.json', import.meta.url)
const ports = JSON.parse(
  readFileSync(
    existsSync(configuredPorts)
      ? configuredPorts
      : new URL('../backend/config/ports.example.json', import.meta.url),
    'utf8',
  ),
)

export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Permissions-Policy': `cross-origin-isolated=(self "http://127.0.0.1:${process.env.XUYA_RUNNER_PORT || ports.runner}")`,
    },
    port: Number(process.env.XUYA_FRONTEND_PORT || ports.frontend),
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.XUYA_PORT || ports.backend}`,
        // 终端输入走 /api/v1/codex/terminal/socket 的 WebSocket 升级，开发代理必须显式转发隧道。
        ws: true,
      },
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
})
