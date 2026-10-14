import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { familyApi, type FamilyState } from './api'
import { bindSession, watchFamilySession, announceFamilySession } from './session'
import LoginView from './LoginView'
import { synchronizeLearning } from '../growth/outbox'

export const FamilyContext = createContext<FamilyState | undefined>(undefined)
export function useFamily() {
  const value = useContext(FamilyContext)
  if (!value?.user) throw new Error('账户身份还未加载')
  return value
}
export function hasPermission(state: FamilyState, permission: string) {
  if (permission === 'system:manage' && !state.user?.roles.includes('super-admin')) return false
  if (permission.startsWith('codex:') && !state.localHost) return false
  return !!state.user?.permissions.some((value) => value === '*' || value === permission)
}
export async function signOut() {
  await familyApi('/auth/logout', 'POST', {})
  announceFamilySession()
  window.location.hash = '/'
  window.location.reload()
}
function routePermission(path: string) {
  if (path.startsWith('/admin')) return 'system:manage'
  if (path.startsWith('/codex')) return 'codex:access'
  if (path.startsWith('/games')) return 'games:use'
  if (path.startsWith('/studio')) return 'studio:use'
  if (path.startsWith('/classroom')) return 'classroom:use'
  if (path.startsWith('/adventure')) return 'adventure:use'
  if (path.startsWith('/works')) return 'works:manage'
  return 'learning:read'
}
export default function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FamilyState>()
  const [error, setError] = useState('')
  const location = useLocation()
  async function load() {
    setError('')
    try {
      const value = await familyApi<FamilyState>('/auth/state')
      bindSession(value.user?.id ?? '', value.csrf)
      setState(value)
      if (value.user && !value.user.changePassword) void synchronizeLearning().catch(() => {})
    } catch {
      setError('小岛暂时没有连接好，请确认叙芽岛服务正在运行。')
    }
  }
  useEffect(() => {
    void load()
    const expired = () => {
      window.location.reload()
    }
    window.addEventListener('xuya:session-expired', expired)
    const online = () => {
      void synchronizeLearning().catch(() => {})
    }
    window.addEventListener('online', online)
    const unwatch = watchFamilySession(expired)
    return () => {
      window.removeEventListener('xuya:session-expired', expired)
      window.removeEventListener('online', online)
      unwatch()
    }
  }, [])
  if (!state)
    return (
      <main className="passport-loading">
        <h1>正在打开叙芽岛…</h1>
        <p>{error || '小奇正在准备你的通行证。'}</p>
        {error && <button onClick={() => void load()}>重新连接</button>}
      </main>
    )
  if (!state.user || state.user.changePassword)
    return (
      <LoginView
        state={state}
        onSignedIn={(value) => {
          bindSession(value.user?.id ?? '', value.csrf)
          setState(value)
          announceFamilySession()
          if (value.user && !value.user.changePassword) void synchronizeLearning().catch(() => {})
        }}
      />
    )
  if (!hasPermission(state, routePermission(location.pathname)))
    return (
      <main className="passport-loading">
        <h1>这条小路暂时没有开放</h1>
        <p>请联系家庭管理员调整账户权限。</p>
        {state.menus
          .filter(
            (menu) =>
              menu.kind === 'menu' && menu.path && hasPermission(state, routePermission(menu.path)),
          )
          .map((menu) => (
            <a key={menu.id} href={'#' + menu.path}>
              {menu.title}
            </a>
          ))}
        <button onClick={() => void signOut()}>切换账户</button>
      </main>
    )
  return <FamilyContext.Provider value={state}>{children}</FamilyContext.Provider>
}
