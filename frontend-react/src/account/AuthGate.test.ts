import { describe, expect, it } from 'vitest'
import { hasPermission } from './AuthGate'
import type { FamilyState } from './api'

const state: FamilyState = {
  initialized: true,
  localSetup: false,
  localHost: true,
  captchaMode: 'off',
  csrf: 'test',
  menus: [],
  user: {
    id: 'family',
    username: 'family',
    nickname: '家人',
    enabled: true,
    changePassword: false,
    roles: ['developer'],
    permissions: ['*'],
  },
}
describe('实际入口权限', () => {
  it('菜单授权不能代替超级管理员身份', () =>
    expect(hasPermission(state, 'system:manage')).toBe(false))
  it('局域网超级管理员仍不能进入成人开发工作台', () =>
    expect(
      hasPermission(
        { ...state, localHost: false, user: { ...state.user!, roles: ['super-admin'] } },
        'codex:access',
      ),
    ).toBe(false))
  it('本机开发权限和学习权限可以各自开放', () => {
    expect(hasPermission(state, 'codex:access')).toBe(true)
    expect(hasPermission({ ...state, localHost: false }, 'learning:read')).toBe(true)
  })
})
