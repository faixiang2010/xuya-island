import { csrfHeaders, sessionExpired } from './session'

export interface FamilyUser {
  id: string
  username: string
  nickname: string
  enabled: boolean
  changePassword: boolean
  roles: string[]
  permissions: string[]
}
export interface FamilyMenu {
  id: string
  parentId: string | null
  title: string
  path: string
  permission: string
  kind: string
  sortOrder: number
  enabled: boolean
}
export interface FamilyRole {
  id: string
  name: string
  description: string
  enabled: boolean
  protectedRole: boolean
  menuIds: string[]
}
export interface FamilyState {
  initialized: boolean
  localSetup: boolean
  localHost: boolean
  captchaMode: string
  csrf: string
  user: FamilyUser | null
  menus: FamilyMenu[]
}

export async function familyApi<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method,
    signal: AbortSignal.timeout(15000),
    credentials: 'same-origin',
    headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const value = await response.json()
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) sessionExpired()
    throw new Error(value.message || '这次操作没有完成，请重试。')
  }
  return value as T
}
