import { Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Map,
  Compass,
  Sprout,
  WandSparkles,
  FolderHeart,
  Sparkles,
  Code2,
  Gamepad2,
} from 'lucide-react'
import { useClassroomStore } from './stores/classroom'
import { useGameProgress, synchronizeGameProgress } from './games/progress'
import { useLearningPreferences } from './learning/preferences'
import styles from './App.module.css'
import { useFamily, signOut } from './account/AuthGate'
const menuClasses: Record<string, string> = {
  '/': 'home',
  '/games': 'games',
  '/classroom': 'classroom',
  '/adventure/town-cup-order': 'town',
  '/studio': 'studio',
  '/works': 'works',
  '/codex': 'codex',
}
const menuIcons: Record<string, typeof Sprout> = {
  '/': Map,
  '/games': Gamepad2,
  '/classroom': Sprout,
  '/adventure/town-cup-order': Compass,
  '/studio': WandSparkles,
  '/works': FolderHeart,
  '/codex': Code2,
}

export default function App() {
  const location = useLocation()
  const family = useFamily()
  const savedCount = useClassroomStore((state) => state.savedCount)
  const initialize = useClassroomStore((state) => state.initialize)
  const [ready, setReady] = useState(false)
  const [startupError, setStartupError] = useState('')
  const codexMode = location.pathname.startsWith('/codex')
  const theme = useLearningPreferences((state) => state.theme)
  const motion = useLearningPreferences((state) => state.motion)

  useEffect(() => {
    useGameProgress.getState().hydrate()
    useLearningPreferences.getState().hydrate()
  }, [])

  async function start() {
    if (ready) return
    setStartupError('')
    try {
      await initialize(family.user!.permissions)
      if (
        family.user!.permissions.some(
          (permission) => permission === '*' || permission === 'games:use',
        )
      )
        await synchronizeGameProgress().catch(() => {})
      setReady(true)
    } catch (error) {
      setStartupError(error instanceof Error ? error.message : '本地服务暂时没有连接。')
    }
  }

  useEffect(() => {
    window.scrollTo(0, 0)
    if (!codexMode && !ready) void start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  if (codexMode) {
    return (
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    )
  }

  return (
    <div
      className="app-shell"
      data-learning-theme={theme}
      data-learning-motion={motion ? 'full' : 'quiet'}
      data-learning-surface={location.pathname === '/' ? 'notebook' : undefined}
    >
      <aside className="sidebar">
        <Link to="/" className="brand" aria-label="叙芽岛首页">
          <span className="brand-mark">芽</span>
          <span>
            叙芽岛
            <small>XUYA ISLAND</small>
          </span>
        </Link>
        <div className="sidebar-caption">我的创作小岛</div>
        <nav aria-label="主导航" className={styles.navigation}>
          {family.menus
            .filter((menu) => menu.kind === 'menu' && menu.path)
            .map((menu) => (
              <NavLink
                key={menu.id}
                to={menu.path}
                end={menu.path === '/'}
                className={({ isActive }) =>
                  'nav-item nav-' + (menuClasses[menu.path] ?? 'home') + (isActive ? ' active' : '')
                }
              >
                <span className="nav-icon">
                  {(() => {
                    const Icon = menuIcons[menu.path] ?? Sparkles
                    return <Icon size={20} aria-hidden="true" />
                  })()}
                </span>
                {menu.title}
                {menu.path === '/works' && <em>{savedCount}</em>}
              </NavLink>
            ))}
        </nav>
        <div className="sidebar-note">
          <Sparkles className="little-sprout" size={30} aria-hidden="true" />
          <strong>
            每一个怪点子
            <br />
            都能改变小镇。
          </strong>
          <p>和小奇一起，把“如果”试出来。</p>
        </div>
        <div className="sidebar-bottom">
          <span className="avatar">{family.user!.nickname.slice(0, 1)}</span>
          <span>
            {family.user!.nickname}
            <small>一起探索</small>
          </span>
          <button type="button" className="account-switch" onClick={() => void signOut()}>
            切换
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>创作，是最好的学习方式</span>
          <span className="local-badge">
            <i></i>
            本机学习空间
          </span>
        </header>
        {!ready ? (
          <main className="startup-screen">
            <span className="brand-mark">芽</span>
            <h1>{startupError ? '岛屿还没有连接好' : '正在打开你的创作小岛…'}</h1>
            <p>{startupError || '课程和作品，马上就来。'}</p>
            {startupError && (
              <button className="button primary" onClick={() => void start()}>
                重新连接
              </button>
            )}
            {startupError && <p className="muted">请先运行 node backend/scripts/dev.mjs。</p>}
          </main>
        ) : (
          <Outlet key={location.pathname} />
        )}
      </div>
    </div>
  )
}
