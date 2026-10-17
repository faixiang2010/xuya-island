import { csrfHeaders, sessionExpired } from './session'

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

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

/** 统一的本地服务探测：Vite 代理目标不通时 fetch 抛 TypeError，
 *  代理返回 502 HTML 时 response.json() 抛 SyntaxError。
 *  两者都归为 OFFLINE，让上层可以明确呈现「连接等待」界面。 */
export async function familyApi<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      signal: AbortSignal.timeout(15000),
      credentials: 'same-origin',
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))
      throw new ApiError(0, 'TIMEOUT', '等待超过了时间限制，请稍后再试。')
    throw new ApiError(0, 'OFFLINE', '本地服务暂时没有连接。')
  }
  let value: any
  try {
    value = await response.json()
  } catch {
    // Vite 代理在后端挂掉时可能返回 502 HTML，json 解析失败。
    throw new ApiError(response.status || 0, 'OFFLINE', '本地服务暂时没有连接。')
  }
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) sessionExpired()
    throw new ApiError(
      response.status,
      value.code ?? 'REQUEST_FAILED',
      value.message ?? '这次操作没有完成，请重试。',
    )
  }
  return value as T
}
