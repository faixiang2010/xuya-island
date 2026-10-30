import { Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import App from './App'
import AuthGate from './account/AuthGate'
import '@ant-design/v5-patch-for-react-19'
import HomeView from './views/HomeView'
import ClassroomView from './views/ClassroomView'
import ClassroomCatalogView from './views/ClassroomCatalogView'
import WorksView from './views/WorksView'
import AdventureView from './views/AdventureView'
import StudioView from './views/StudioView'
import GamesView from './views/GamesView'
import TypingGameView from './views/TypingGameView'
import LeaderboardView from './views/LeaderboardView'
import './styles.css'
import './styles-learning.css'
import './styles-theme.css'

const CodexView = lazy(() => import('./views/CodexView'))
const AccountAdminView = lazy(() => import('./views/AccountAdminView'))
const GrowthView = lazy(() => import('./views/GrowthView'))

createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <AuthGate>
      <Routes>
        <Route element={<App />}>
          <Route path="/" element={<HomeView />} />
          <Route path="/games" element={<GamesView />} />
          <Route path="/games/leaderboard" element={<LeaderboardView />} />
          <Route path="/games/:gameId" element={<TypingGameView />} />
          <Route path="/adventure/:episodeId" element={<AdventureView />} />
          <Route path="/studio" element={<StudioView />} />
          <Route path="/studio/:projectId" element={<StudioView />} />
          <Route path="/classroom" element={<ClassroomCatalogView />} />
          <Route path="/classroom/:lessonId" element={<ClassroomView />} />
          <Route path="/works" element={<WorksView />} />
          <Route
            path="/growth"
            element={
              <Suspense fallback={null}>
                <GrowthView />
              </Suspense>
            }
          />
          <Route
            path="/admin"
            element={
              <Suspense fallback={null}>
                <AccountAdminView />
              </Suspense>
            }
          />
          <Route path="/parent" element={<Navigate to="/" replace />} />
          <Route path="/codex" element={<CodexView />} />
          <Route path="/codex/:section" element={<CodexView />} />
          <Route path="*" element={<HomeView />} />
        </Route>
      </Routes>
    </AuthGate>
  </HashRouter>,
)
