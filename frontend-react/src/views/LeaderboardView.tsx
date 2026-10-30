import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { RefreshCw, Trophy } from 'lucide-react'
import LearningAtmosphere from '../components/LearningAtmosphere'
import { typingGames, type GameId } from '../games/content'
import { gameCategories } from '../games/categories'
import {
  formatAchievedAt,
  formatDuration,
  leaderboardGameIds,
  rankingMetric,
  readLeaderboard,
  type GameLeaderboard,
} from '../games/leaderboard'
import styles from './LeaderboardView.module.css'

export default function LeaderboardView() {
  const [search, setSearch] = useSearchParams()
  const requested = search.get('game') as GameId | null
  const gameId =
    requested && leaderboardGameIds.includes(requested) ? requested : leaderboardGameIds[0]
  const game = typingGames[gameId]
  const level = game.levels.find((item) => item.id === search.get('level')) ?? game.levels[0]
  const category = gameCategories.find((item) => item.ids.includes(gameId)) ?? gameCategories[0]
  const metric = rankingMetric(gameId)
  const [board, setBoard] = useState<GameLeaderboard>()
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let active = true
    setStatus('loading')
    setMessage('')
    readLeaderboard(gameId, level.id, level.version)
      .then((value) => {
        if (!active) return
        setBoard(value)
        setStatus('ready')
      })
      .catch((error: Error) => {
        if (!active) return
        setMessage(error.message)
        setStatus('error')
      })
    return () => {
      active = false
    }
  }, [gameId, level.id, level.version, refresh])

  function choose(nextGame: GameId, nextLevel: string) {
    setSearch({ game: nextGame, level: nextLevel })
  }

  function chooseCategory(nextCategoryId: string) {
    const next = gameCategories.find((item) => item.id === nextCategoryId) ?? gameCategories[0]
    choose(next.ids[0], typingGames[next.ids[0]].levels[0].id)
  }

  function showScore(score: number) {
    return metric === 'accuracy' ? `${score}%` : String(score)
  }

  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <Link className="back-link" to="/games">
            ← 返回游戏中心
          </Link>
          <span className="eyebrow">家庭共享 · 每关最佳记录</span>
          <h1>小游戏排行榜</h1>
          <p>
            街机小游戏先比得分，打字、课文和问答小游戏先比准确率；成绩相同再比用时。每位家人只保留自己的最好成绩。
          </p>
        </div>
        <LearningAtmosphere />
      </div>

      <section className={styles.filters} aria-label="选择排行榜">
        <div className={styles.categories} role="group" aria-label="游戏分类">
          {gameCategories.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={item.id === category.id}
              className={styles.level + (item.id === category.id ? ' ' + styles.levelActive : '')}
              onClick={() => chooseCategory(item.id)}
            >
              {item.title}
            </button>
          ))}
        </div>
        <div className={styles.categories} role="group" aria-label="选择游戏">
          {category.ids.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={id === gameId}
              className={styles.level + (id === gameId ? ' ' + styles.levelActive : '')}
              onClick={() => choose(id, typingGames[id].levels[0].id)}
            >
              {typingGames[id].title}
            </button>
          ))}
        </div>
        <div className={styles.levels} role="group" aria-label="选择关卡">
          {game.levels.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={item.id === level.id}
              className={styles.level + (item.id === level.id ? ' ' + styles.levelActive : '')}
              onClick={() => choose(gameId, item.id)}
            >
              {item.title}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.board} aria-label={`${game.title}排行榜`}>
        <header className={styles.boardHead}>
          <div>
            <h2>
              <Trophy size={20} aria-hidden="true" />
              {game.title} · {level.title}
            </h2>
            <p>
              {status === 'ready' && board
                ? `共有 ${board.total} 位家人完成过这一关`
                : '正在读取家庭成绩'}
            </p>
          </div>
          <div className={styles.boardActions}>
            <Link className="button secondary" to={`/games/${gameId}?level=${level.id}`}>
              去练这一关
            </Link>
            <button
              type="button"
              className="button secondary"
              disabled={status === 'loading'}
              onClick={() => setRefresh((value) => value + 1)}
            >
              <RefreshCw size={16} aria-hidden="true" />
              刷新
            </button>
          </div>
        </header>

        {status === 'loading' && <p className={styles.notice}>正在读取榜单…</p>}
        {status === 'error' && (
          <div className={styles.notice} role="alert">
            <p>{message || '榜单暂时没有读到。'}</p>
            <button
              type="button"
              className="button secondary"
              onClick={() => setRefresh((value) => value + 1)}
            >
              再试一次
            </button>
          </div>
        )}
        {status === 'ready' && board && board.entries.length === 0 && (
          <p className={styles.notice}>这一关还没有人完成，去玩一局就能留下第一条记录。</p>
        )}
        {status === 'ready' && board && board.entries.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>名次</th>
                <th>玩家</th>
                <th>{metric === 'accuracy' ? '准确率' : '得分'}</th>
                <th>用时</th>
                <th>达成时间</th>
              </tr>
            </thead>
            <tbody>
              {board.entries.map((entry, index) => (
                <tr key={`${entry.rank}-${index}`} className={entry.self ? styles.self : undefined}>
                  <td>
                    <span
                      className={
                        styles.rank + (entry.rank <= 3 ? ' ' + styles['rank' + entry.rank] : '')
                      }
                    >
                      {entry.rank}
                    </span>
                  </td>
                  <td>
                    {entry.nickname}
                    {entry.self && <span className={styles.selfTag}>我</span>}
                  </td>
                  <td className={styles.score}>{showScore(entry.score)}</td>
                  <td>{formatDuration(entry.durationMs)}</td>
                  <td className={styles.time}>{formatAchievedAt(entry.achievedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {status === 'ready' && board?.mine && !board.entries.some((entry) => entry.self) && (
          <p className={styles.mine}>
            我的最佳：第 {board.mine.rank} 名 · {showScore(board.mine.score)} ·{' '}
            {formatDuration(board.mine.durationMs)}
          </p>
        )}
      </section>
    </main>
  )
}
