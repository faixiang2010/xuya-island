import { validResponse } from './schema'
import { csrfHeaders, sessionExpired } from '../account/session'

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

/** API 调用不包含模型密钥。客户端错误与网络中断分开处理。 */
export async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${url}`, {
      ...options,
      credentials: 'same-origin',
      headers: csrfHeaders({ 'Content-Type': 'application/json', ...options.headers }),
    })
  } catch (error) {
    if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))
      throw new ApiError(0, 'TIMEOUT', '等待超过了时间限制，请稍后再试。')
    throw new ApiError(0, 'OFFLINE', '本地服务暂时没有连接。代码仍保留在这个浏览器里。')
  }
  if (!response.ok) {
    if (response.status === 401) sessionExpired()
    const detail = await response.json().catch(() => ({}))
    throw new ApiError(
      response.status,
      detail.code ?? 'REQUEST_FAILED',
      detail.message ?? '这次操作没有完成，请重试。',
    )
  }
  const value: unknown = await response.json().catch(() => undefined)
  if (!validResponse(url, value))
    throw new ApiError(
      502,
      'INVALID_RESPONSE',
      '服务返回的数据格式不正确，请更新或重新启动本地服务。草稿仍保留着。',
    )
  return value as T
}
