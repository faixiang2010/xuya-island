import { Link } from 'react-router-dom'
import {
  Keyboard,
  Languages,
  Palette,
  Gamepad2,
  Hand,
  Zap,
  BookOpen,
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
  hand: Hand,
  meteor: Zap,
  palette: Palette,
  gamepad: Gamepad2,
  book: BookOpen,
}

const groups: { title: string; note: string; eyebrow: string; ids: GameId[] }[] = [
  {
    title: '基础练习',
    note: '先认识键盘和拼音输入，每次只玩一小段。',
    eyebrow: '热身 · 不用写代码',
    ids: ['keyboard', 'pinyin'],
  },
  {
    title: '进阶挑战',
    note: '练习十指分工和盲打，再让单词从天上落下来。',
    eyebrow: '指法 · 速度 · 准确率',
    ids: ['finger', 'falling'],
  },
  {
    title: '课文练习',
    note: '语文和英语分开练习，只保留 200–500 字长篇课文。',
    eyebrow: '六年级 · 语文部编版 · 英语 PEP',
    ids: ['passage', 'passage-en'],
  },
  {
    title: '趣味小站',
    note: '画画、猜谜，换一种方式动动脑。',
    eyebrow: '轻松一下',
    ids: ['style', 'quiz'],
  },
]

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
          <span className="eyebrow">起步练习 · 指法训练 · 长篇课文</span>
          <h1>游戏中心</h1>
          <p>从认识键盘到十指盲打，再到整篇课文。每次先玩一小段，准确比速度更重要。</p>
        </div>
        <LearningAtmosphere />
      </div>
      {groups.map((group) => (
        <section className={styles.group} key={group.title} aria-label={group.title}>
          <header className={styles.groupHeading}>
            <div>
              <h2>{group.title}</h2>
              <p>{group.note}</p>
            </div>
          </header>
          <div className={styles.cards}>
            {group.ids.map((id) => {
              const game = typingGames[id]
              const Icon = gameIcons[game.icon]
              const count = records.filter((record) => record.gameId === game.id).length
              const next =
                game.levels.find(
                  (level) =>
                    !records.some(
                      (record) => record.gameId === game.id && record.levelId === level.id,
                    ),
                ) ?? game.levels[0]
              const started = count > 0 || drafts.some((draft) => draft.gameId === game.id)
              const compact = game.id === 'passage' || game.id === 'passage-en'
              const previewLevels = compact
                ? [...game.levels.slice(0, 2), ...game.levels.slice(-2)]
                : game.levels
              const cardEyebrow =
                game.id === 'passage'
                  ? '六年级 · 语文部编版'
                  : game.id === 'passage-en'
                    ? '六年级 · 英语 PEP'
                    : group.eyebrow
              return (
                <section
                  key={game.id}
                  className={styles.card + (game.id === recommended ? ' ' + styles.cardNext : '')}
                >
                  {game.id === recommended && <span className={styles.badge}>接着玩</span>}
                  <div className={styles.icon}>
                    <Icon size={38} aria-hidden="true" />
                  </div>
                  <span className="eyebrow">{cardEyebrow}</span>
                  <h2>{game.title}</h2>
                  <p>{game.description}</p>
                  <ul>
                    {previewLevels.map((level) => (
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
                    {compact && (
                      <li>
                        共 {game.levels.length} 篇<span>六上 + 六下</span>
                      </li>
                    )}
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
                      {count} / {game.levels.length} {compact ? '篇' : '级'}已练完 · 进度可继续
                    </small>
                  </div>
                </section>
              )
            })}
          </div>
        </section>
      ))}
      <section className={styles.note}>
        <h2>第一次用电脑？</h2>
        <p>
          点输入框就能开始：字母用英文输入，汉字打拼音。想休息就离开，进度会留着；指法练习随时可以打开盲打模式。
        </p>
        <Link className="button secondary" to="/classroom/story-cover">
          已经会打字？试试第一段程序 →
        </Link>
      </section>
    </main>
  )
}
