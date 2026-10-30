import { Link, useSearchParams } from 'react-router-dom'
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
  Blocks,
  Bomb,
  Radar,
  Wind,
  Music,
  Piano,
  Brush,
  Images,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import { typingGames, type GameIcon, type GameId, type TypingGame } from '../games/content'
import { gameCategories, gameTags } from '../games/categories'
import { gameFinished, useGameProgress, type GameRecord } from '../games/progress'
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
  blocks: Blocks,
  bomb: Bomb,
  radar: Radar,
  wind: Wind,
  music: Music,
  piano: Piano,
  brush: Brush,
  images: Images,
}

function levelDone(records: GameRecord[], gameId: GameId, level: { id: string; version: number }) {
  return records.some(
    (record) =>
      record.gameId === gameId &&
      record.levelId === level.id &&
      record.levelVersion === level.version,
  )
}

function gameProgress(gameId: GameId, records: GameRecord[]) {
  const levels = typingGames[gameId].levels
  return {
    done: levels.filter((level) => levelDone(records, gameId, level)).length,
    total: levels.length,
  }
}

function categoryProgress(ids: GameId[], records: GameRecord[]) {
  return ids.reduce(
    (sum, id) => {
      const progress = gameProgress(id, records)
      return { done: sum.done + progress.done, total: sum.total + progress.total }
    },
    { done: 0, total: 0 },
  )
}

function GameCard({
  game,
  records,
  drafts,
  recommended,
}: {
  game: TypingGame
  records: GameRecord[]
  drafts: { gameId: GameId }[]
  recommended: boolean
}) {
  const Icon = gameIcons[game.icon]
  const progress = gameProgress(game.id, records)
  const next = game.levels.find((level) => !levelDone(records, game.id, level)) ?? game.levels[0]
  const started = progress.done > 0 || drafts.some((draft) => draft.gameId === game.id)
  const compact = game.id === 'passage' || game.id === 'passage-en'
  const previewLevels = compact
    ? [...game.levels.slice(0, 2), ...game.levels.slice(-2)]
    : game.levels
  return (
    <section className={styles.card + (recommended ? ' ' + styles.cardNext : '')}>
      {recommended && <span className={styles.badge}>接着玩</span>}
      <div className={styles.icon}>
        <Icon size={38} aria-hidden="true" />
      </div>
      <span className="eyebrow">{gameTags[game.id]}</span>
      <h3>{game.title}</h3>
      <p>{game.description}</p>
      <ul>
        {previewLevels.map((level) => (
          <li key={level.id}>
            {level.title}
            {levelDone(records, game.id, level) && (
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
        {!started ? '开始练习' : progress.done === progress.total ? '再玩一次' : '继续练习'}
        <ArrowRight size={17} aria-hidden="true" />
      </Link>
      <div className={styles.progress}>
        <progress
          value={progress.done}
          max={progress.total}
          aria-label={`${game.title} 已完成级别`}
        />
        <small>
          {progress.done} / {progress.total} {compact ? '篇' : '级'}已练完 · 进度可继续
        </small>
      </div>
    </section>
  )
}

export default function GamesView() {
  const records = useGameProgress((state) => state.records)
  const drafts = useGameProgress((state) => state.drafts)
  const [search, setSearch] = useSearchParams()
  // 还没练完的第一个小站作为推荐起点，避免出现“第二张卡莫名变色”。
  const recommended = (Object.keys(typingGames) as GameId[]).find(
    (id) => !gameFinished(id, records),
  )
  const recommendedCategory = gameCategories.find(
    (category) => recommended && category.ids.includes(recommended),
  )
  const active =
    gameCategories.find((category) => category.id === search.get('category')) ??
    recommendedCategory ??
    gameCategories[0]
  const continueGame = recommended ? typingGames[recommended] : undefined
  const continueLevel = continueGame
    ? (continueGame.levels.find((level) => !levelDone(records, continueGame.id, level)) ??
      continueGame.levels[0])
    : undefined
  const continueProgress = continueGame ? gameProgress(continueGame.id, records) : undefined

  function selectCategory(id: string) {
    // 分类属于同一页的视图状态：替换当前历史记录，返回键直接离开游戏中心。
    setSearch({ category: id }, { replace: true })
    // 从长列表底部点吸顶标签时，把新分类的标题移回可视区顶部；页首点击则保留“接着玩”。
    const group = document.getElementById('game-category')
    if (group && group.getBoundingClientRect().top < 0) group.scrollIntoView({ block: 'start' })
  }

  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <Link className="back-link" to="/">
            ← 返回学习地图
          </Link>
          <span className="eyebrow">
            {gameCategories.map((category) => category.title).join(' · ')}
          </span>
          <h1>游戏中心</h1>
          <p>
            {Object.keys(typingGames).length} 款游戏分成 {gameCategories.length}{' '}
            类。每次先玩一小段，准确和思考比速度更重要。
          </p>
        </div>
        <LearningAtmosphere />
      </div>

      {continueGame && continueLevel && continueProgress && (
        <section className={styles.continue} aria-label="接着玩">
          <div>
            <span className="eyebrow">接着玩</span>
            <p className={styles.continueTitle}>{continueGame.title}</p>
            <p className={styles.continueNote}>
              {continueLevel.title} · {continueProgress.done} / {continueProgress.total} 已完成
            </p>
          </div>
          <div className={styles.continueActions}>
            <Link
              className="button primary"
              to={`/games/${continueGame.id}?level=${continueLevel.id}`}
            >
              继续
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <Link className="button secondary" to="/games/leaderboard">
              <Trophy size={17} aria-hidden="true" />
              排行榜
            </Link>
          </div>
        </section>
      )}

      <nav className={styles.categories} aria-label="游戏分类">
        {gameCategories.map((category) => {
          const progress = categoryProgress(category.ids, records)
          return (
            <button
              key={category.id}
              type="button"
              className={
                styles.category + (category.id === active.id ? ' ' + styles.categoryActive : '')
              }
              aria-pressed={category.id === active.id}
              aria-controls="game-category"
              aria-label={`${category.title}，已完成 ${progress.done} / ${progress.total}`}
              onClick={() => selectCategory(category.id)}
            >
              <span>{category.title}</span>
              <small>
                {progress.done} / {progress.total}
              </small>
            </button>
          )
        })}
      </nav>

      <section className={styles.group} aria-label={active.title} id="game-category">
        <header className={styles.groupHeading}>
          <div>
            <h2>{active.title}</h2>
            <p>{active.note}</p>
          </div>
          <Link className="button secondary" to="/games/leaderboard">
            <Trophy size={17} aria-hidden="true" />
            查看排行榜
          </Link>
        </header>
        <div className={styles.cards}>
          {active.ids.map((id) => (
            <GameCard
              key={id}
              game={typingGames[id]}
              records={records}
              drafts={drafts}
              recommended={id === recommended}
            />
          ))}
        </div>
      </section>

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
