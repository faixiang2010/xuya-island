import { Link } from 'react-router-dom'
import { Keyboard, Languages, ArrowRight, CheckCircle2 } from 'lucide-react'
import { typingGames } from '../games/content'
import { useGameProgress } from '../games/progress'
import LearningAtmosphere from '../components/LearningAtmosphere'
import styles from './GamesView.module.css'

export default function GamesView() {
  const records = useGameProgress((state) => state.records)
  const drafts = useGameProgress((state) => state.drafts)
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
      </div>
      <LearningAtmosphere />
      <div className={styles.cards}>
        {Object.values(typingGames).map((game, index) => {
          const Icon = game.id === 'keyboard' ? Keyboard : Languages
          const count = records.filter((record) => record.gameId === game.id).length
          const next =
            game.levels.find(
              (level) =>
                !records.some((record) => record.gameId === game.id && record.levelId === level.id),
            ) ?? game.levels[0]
          return (
            <section key={game.id} className={styles.card}>
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
                {count === 0 && !drafts.some((draft) => draft.gameId === game.id)
                  ? '开始练习'
                  : count === game.levels.length
                    ? '再玩一次'
                    : '继续练习'}
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <small>
                {count} / {game.levels.length} 级已练完 · 自动送达，进度可继续
              </small>
            </section>
          )
        })}
      </div>
      <section className={styles.note}>
        <h2>第一次用电脑？和家人一起试试</h2>
        <p>
          点一下输入框，让光标出现。字母数字用英文输入；汉字用中文拼音输入法。拼音还不熟，可以请家人读卡片、一起选字。
        </p>
        <p>
          每张正确卡片的进度保存在当前浏览器。可以随时休息，再回来继续；练习完成不代表已经掌握编程知识。
        </p>
        <Link className="button secondary" to="/classroom/story-cover">
          已经会打字？试试第一段程序 →
        </Link>
      </section>
    </main>
  )
}
