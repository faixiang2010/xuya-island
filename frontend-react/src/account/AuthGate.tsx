import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import { ApiError, familyApi, type FamilyState } from './api'
import { bindSession, watchFamilySession, announceFamilySession } from './session'
import LoginView from './LoginView'
import ServiceConnecting from './ServiceConnecting'
import './connecting.css'
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

/** 指数退避：1s → 2s → 4s → 8s → 封顶 16s。后端一好就立刻通。 */
function backoff(attempts: number): number {
  return Math.min(2 ** Math.max(0, attempts - 1), 16)
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FamilyState>()
  const [attempts, setAttempts] = useState(0)
  const [nextRetryIn, setNextRetryIn] = useState(0)
  const [lastError, setLastError] = useState('')
  // 用 ref 读取最新值，避免 useCallback / useEffect 闭包陈旧化。
  const attemptsRef = useRef(0)
  const stateRef = useRef<FamilyState | undefined>(undefined)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null!)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null!)
  const cancelledRef = useRef(false)
  const location = useLocation()

  // 保持 ref 与 state 同步。
  useEffect(() => {
    stateRef.current = state
  }, [state])
  useEffect(() => {
    attemptsRef.current = attempts
  }, [attempts])

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
  }, [])

  /** 加载 /auth/state 接口。重试逻辑里用 ref 读最新 attempts，
   *  这样 setTimeout 里的 load() 永远拿到递增的 attempt 数，指数退避才真的生效。 */
  const load = useCallback(
    async (manualRetry = false) => {
      if (cancelledRef.current) return
      clearTimers()
      setState(undefined)
      setLastError('')
      setNextRetryIn(0)
      try {
        const value = await familyApi<FamilyState>('/auth/state')
        if (cancelledRef.current) return
        clearTimers()
        bindSession(value.user?.id ?? '', value.csrf)
        setState(value)
        setAttempts(0)
        attemptsRef.current = 0
        if (value.user && !value.user.changePassword) void synchronizeLearning().catch(() => {})
      } catch (error) {
        if (cancelledRef.current) return
        const message =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : '未知错误'
        setLastError(message)
        const next = manualRetry ? 1 : attemptsRef.current + 1
        setAttempts(next)
        attemptsRef.current = next
        const delay = backoff(next)
        setNextRetryIn(delay)
        // 倒计时显示
        countdownRef.current = setInterval(() => {
          setNextRetryIn((prev) => {
            if (prev <= 1) {
              if (countdownRef.current) clearInterval(countdownRef.current)
              return 0
            }
            return prev - 1
          })
        }, 1000)
        timerRef.current = setTimeout(() => {
          void load()
        }, delay * 1000)
      }
    },
    [clearTimers],
  )

  const manualRetry = useCallback(() => {
    attemptsRef.current = 0
    setAttempts(0)
    void load(true)
  }, [load])

  useEffect(() => {
    cancelledRef.current = false
    void load()
    const expired = () => {
      window.location.reload()
    }
    window.addEventListener('xuya:session-expired', expired)
    // 浏览器从离线恢复在线时，用 stateRef 读最新状态：
    // 已登录用户只同步学习数据，未登录 / 正在连接的才重新探测。
    const online = () => {
      const latest = stateRef.current
      if (!latest) {
        attemptsRef.current = 0
        void load(true)
      } else {
        void synchronizeLearning().catch(() => {})
      }
    }
    window.addEventListener('online', online)
    const unwatch = watchFamilySession(expired)
    return () => {
      cancelledRef.current = true
      clearTimers()
      window.removeEventListener('xuya:session-expired', expired)
      window.removeEventListener('online', online)
      unwatch()
    }
    // 只在首次挂载时触发，后续 state 变化由 load 内部处理。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!state)
    return (
      <ServiceConnecting
        lastError={lastError}
        attempts={attempts}
        nextRetryIn={nextRetryIn}
        onRetry={manualRetry}
      />
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
