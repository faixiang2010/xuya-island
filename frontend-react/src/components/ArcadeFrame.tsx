import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { typingGames, type GameId } from '../games/content'
import { useGameProgress } from '../games/progress'
import styles from './ArcadeFrame.module.css'

interface ArcadeFrameProps {
  gameId: GameId
  levelId: string
  onLevel: (id: string) => void
  children: ReactNode
}

/** 动脑小游戏共用的外壳：关卡切换、目标说明和统一的页面结构。 */
export default function ArcadeFrame({ gameId, levelId, onLevel, children }: ArcadeFrameProps) {
  const game = typingGames[gameId]
  const level = game.levels.find((item) => item.id === levelId) ?? game.levels[0]
  const records = useGameProgress((state) => state.records)
  const done = (id: string) =>
    records.some(
      (record) =>
        record.gameId === gameId && record.levelId === id && record.levelVersion === level.version,
    )
  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <Link className="back-link" to="/games">
            ← 返回游戏中心
          </Link>
          <span className="eyebrow">动脑小游戏 · 随时可以停</span>
          <h1>{game.title}</h1>
          <p>{game.description}</p>
        </div>
      </div>
      <nav className={styles.levels} aria-label="选择关卡">
        {game.levels.map((item) => (
          <button
            key={item.id}
            type="button"
            className={styles.level + (item.id === level.id ? ' ' + styles.levelActive : '')}
            aria-pressed={item.id === level.id}
            onClick={() => onLevel(item.id)}
          >
            {item.title}
            {done(item.id) && <CheckCircle2 size={15} aria-hidden="true" />}
          </button>
        ))}
        <Link
          className={styles.rankLink}
          to={`/games/leaderboard?game=${gameId}&level=${level.id}`}
        >
          看本关排行榜
        </Link>
      </nav>
      <div className={styles.brief}>
        <p>
          <strong>这一关</strong>
          {level.goal}
        </p>
        <p>
          <strong>小提示</strong>
          {level.discovery}
        </p>
      </div>
      <p className={styles.instruction}>{game.instruction}</p>
      {children}
    </main>
  )
}
