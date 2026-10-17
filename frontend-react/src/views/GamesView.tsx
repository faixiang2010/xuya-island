import { Link } from 'react-router-dom'
import {
  Keyboard,
  Languages,
  Palette,
  Gamepad2,
  ArrowRight,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-react'
import { typingGames, type GameIcon, type GameId } from '../games/content'
import { gameFinished, useGameProgress } from '../games/progress'
import LearningAtmosphere from '../components/LearningAtmosphere'
import styles from './GamesView.module.css'

const gameIcons: Record<GameIcon, LucideIcon> = {
  keyboard: Keyboard,
  pinyin: Languages,
  palette: Palette,
  gamepad: Gamepad2,
}

export default function GamesView() {
  const records = useGameProgress((state) => state.records)
  const drafts = useGameProgress((state) => state.drafts)
  // 还没练完的第一个小站作为推荐起点，避免出现“第二张卡莫名变色”。
  const recommended: GameId | undefined = (Object.keys(typingGames) as GameId[]).find(
    (id) => !gameFinished(id, records),
  )
  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <Link className="back-link" to="/">
            ← 返回学习地图
          </Link>
          <span className="eyebrow">起步练习 · 不用写代码</span>
          <h1>游戏中心</h1>
          <p>选一个主题，找线索、收集灵感，或让输入变成一段旋律。每次先玩 6 张卡片。</p>
        </div>
        <LearningAtmosphere />
      </div>
      <div className={styles.cards}>
        {Object.values(typingGames).map((game, index) => {
          const Icon = gameIcons[game.icon]
          const count = records.filter((record) => record.gameId === game.id).length
          const next =
            game.levels.find(
              (level) =>
                !records.some((record) => record.gameId === game.id && record.levelId === level.id),
            ) ?? game.levels[0]
          const started = count > 0 || drafts.some((draft) => draft.gameId === game.id)
          return (
            <section
              key={game.id}
              className={styles.card + (game.id === recommended ? ' ' + styles.cardNext : '')}
            >
              {game.id === recommended && <span className={styles.badge}>接着玩</span>}
              <div className={styles.icon}>
                <Icon size={38} aria-hidden="true" />
              </div>
              <span className="eyebrow">学习地图第 {index + 1} 步</span>
              <h2>{game.title}</h2>
              <p>{game.description}</p>
              <ul>
                {game.levels.map((level) => (
                  <li key={level.id}>
                    {level.title}
                    {records.some(
                      (record) => record.gameId === game.id && record.levelId === level.id,
                    ) && (
                      <span>
                        <CheckCircle2 size={14} aria-hidden="true" /> 已练完
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <Link className="button primary" to={`/games/${game.id}?level=${next.id}`}>
                {!started ? '开始练习' : count === game.levels.length ? '再玩一次' : '继续练习'}
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <div className={styles.progress}>
                <progress
                  value={count}
                  max={game.levels.length}
                  aria-label={`${game.title} 已完成级别`}
                />
                <small>
                  {count} / {game.levels.length} 级已练完 · 自动送达，进度可继续
                </small>
              </div>
            </section>
          )
        })}
      </div>
      <section className={styles.note}>
        <h2>第一次用电脑？</h2>
        <p>点输入框就能开始：字母用英文输入，汉字打拼音。想休息就离开，进度会留着。</p>
        <Link className="button secondary" to="/classroom/story-cover">
          已经会打字？试试第一段程序 →
        </Link>
      </section>
    </main>
  )
}
