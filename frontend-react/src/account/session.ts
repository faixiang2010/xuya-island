let csrf = ''
let accountId = ''
let channel: BroadcastChannel | undefined

export function accountIdentity() {
  return accountId
}
export function watchFamilySession(changed: () => void) {
  if (typeof BroadcastChannel === 'undefined') return () => {}
  channel = new BroadcastChannel('xuya-family-session')
  channel.onmessage = changed
  return () => {
    channel?.close()
    channel = undefined
  }
}
export function announceFamilySession() {
  channel?.postMessage('changed')
}

export function bindSession(id: string, value: string) {
  accountId = id
  csrf = value
}

export function csrfHeaders(headers: HeadersInit = {}) {
  const result = new Headers(headers)
  if (csrf) result.set('X-Xuya-CSRF', csrf)
  if (accountId) result.set('X-Xuya-Account', accountId)
  return result
}

/** 每个账户独立的浏览器草稿。未绑定身份时不迁移历史数据。 */
function scoped(storage: () => Storage): Storage {
  const prefix = () => (accountId ? `xuya:account:${accountId}:` : '')
  const keys = () => {
    const target = storage()
    return Array.from({ length: target.length }, (_, i) => target.key(i)!).filter((key) =>
      key.startsWith(prefix()),
    )
  }
  return {
    get length() {
      return keys().length
    },
    key: (index) => keys()[index]?.slice(prefix().length) ?? null,
    getItem: (key) => storage().getItem(prefix() + key),
    setItem: (key, value) => storage().setItem(prefix() + key, value),
    removeItem: (key) => storage().removeItem(prefix() + key),
    clear: () => keys().forEach((key) => storage().removeItem(key)),
  }
}

export const accountStorage = scoped(() => localStorage)
export const accountSessionStorage = scoped(() => sessionStorage)

export function sessionExpired() {
  window.dispatchEvent(new Event('xuya:session-expired'))
}
