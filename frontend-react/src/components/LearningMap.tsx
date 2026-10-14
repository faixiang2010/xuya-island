import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  Keyboard,
  Languages,
  Sprout,
  GitBranch,
  Palette,
  Gamepad2,
  Search,
  WandSparkles,
  ArrowRight,
  ArrowDown,
  ArrowLeft,
  Check,
  RotateCcw,
} from 'lucide-react'
import { useClassroomStore } from '../stores/classroom'
import { gameFinished, useGameProgress } from '../games/progress'
import { lessonStatus, nextLesson } from '../learning/path'
import { typingGames, type GameId } from '../games/content'
import styles from './LearningMap.module.css'

const steps = [
  {
    id: 'keyboard',
    title: '认识键盘',
    goal: '区分大小写，认识键位和数字',
    icon: Keyboard,
    gameId: 'keyboard',
  },
  {
    id: 'pinyin',
    title: '拼音打字',
    goal: '输入拼音，选出汉字和短句',
    icon: Languages,
    gameId: 'pinyin',
  },
  { id: 'story', title: '第一段程序', goal: '让程序说话，再改名字和数字', icon: Sprout },
  { id: 'interactive', title: '让故事做选择', goal: '用条件，让故事走不同的路', icon: GitBranch },
  { id: 'art', title: '用循环画画', goal: '重复画图案，试试列表和配色', icon: Palette },
  { id: 'game', title: '做自己的小游戏', goal: '学函数和状态，做一个背包冒险', icon: Gamepad2 },
  {
    id: 'detective',
    title: '数据小侦探',
    goal: '统计线索，读写虚拟文件',
    icon: Search,
    optional: true,
  },
  {
    id: 'studio',
    title: '自由创作',
    goal: '设计、测试和展示自己的作品',
    icon: WandSparkles,
    optional: true,
  },
] as const
const positions = [
  [18, 31],
  [51, 32],
  [84, 32],
  [84, 66],
  [51, 66],
  [18, 65],
  [34, 95],
  [73, 95],
]

export default function LearningMap() {
  const lessons = useClassroomStore((state) => state.lessons)
  const progress = useClassroomStore((state) => state.progress)
  const records = useGameProgress((state) => state.records)
  const drafts = useGameProgress((state) => state.drafts)
  const cacheAvailable = useGameProgress((state) => state.cacheAvailable)
  const [selection, setSelection] = useState<string>()
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const startLink = useRef<HTMLAnchorElement>(null)
  const suggested = nextLesson(lessons, progress)
  const nodes = steps.map((step) => {
    if ('gameId' in step) {
      const gameId: GameId = step.gameId
      const game = typingGames[gameId]
      const matched = game.levels.filter((level) =>
        records.some(
          (record) =>
            record.gameId === gameId &&
            record.levelId === level.id &&
            record.levelVersion === level.version,
        ),
      )
      const next = game.levels.find((level) => !matched.includes(level)) ?? game.levels[0]
      const draft = drafts.find(
        (item) =>
          item.gameId === gameId && item.levelId === next.id && item.levelVersion === next.version,
      )
      return {
        ...step,
        optional: false,
        done: gameFinished(gameId, records),
        status: draft
          ? `${draft.nextIndex} / ${next.tasks.length} 卡 · 可继续`
          : matched.length
            ? `${matched.length} / ${game.levels.length} 级已练完`
            : '未开始',
        url: `/games/${gameId}?level=${next.id}`,
        detail: `${next.title} · 每次最多6张卡片`,
        invitation:
          gameId === 'keyboard'
            ? '先试6张字母卡，找到键盘上的小线索。'
            : '输入拼音，选出汉字，把线索送到故事里。',
      }
    }
    const optional = 'optional' in step && step.optional
    const activities = lessons
      .filter(
        (lesson) =>
          lesson.phaseId === step.id && lesson.number > 0 && (optional || lesson.track === 'core'),
      )
      .sort((a, b) => a.number - b.number)
    const completed = activities.filter(
      (lesson) => lessonStatus(lesson, progress) === 'completed',
    ).length
    const next =
      activities.find((lesson) => lessonStatus(lesson, progress) === 'needs-review') ??
      activities.find((lesson) => lessonStatus(lesson, progress) !== 'completed') ??
      activities[0]
    const needsReview = activities.some(
      (lesson) => lessonStatus(lesson, progress) === 'needs-review',
    )
    return {
      ...step,
      optional,
      done: activities.length > 0 && completed === activities.length,
      status: needsReview
        ? '建议复习'
        : activities.length
          ? `${completed} / ${activities.length} 活动已完成`
          : '等待课程连接',
      url: next ? `/classroom/${next.id}` : '/classroom',
      detail: next?.title ?? '课程准备中',
      invitation: `${step.goal}。一次只改一处，再看看发生了什么。`,
    }
  })
  const recommended =
    nodes.slice(0, 2).find((node) => !node.done) ??
    nodes.find((node) => node.id === suggested?.phaseId) ??
    nodes.slice(2, 6).find((node) => !node.done)
  const active = nodes.find((node) => node.id === selection) ?? recommended ?? nodes[7]
  const isRecommended = !selection || active.id === recommended?.id
  const allMainDone = nodes.slice(0, 6).every((node) => node.done)
  const creating = allMainDone && !selection
  const destination = creating ? '/studio' : active.url
  const reviewing = !creating && active.status === '建议复习'
  const Icon = active.icon
  function resetSelection() {
    setSelection(undefined)
    const index = nodes.findIndex((node) => node.id === recommended?.id)
    if (index >= 0) buttons.current[index]?.focus()
    else startLink.current?.focus()
  }
  function selectWithKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'Escape') {
      event.preventDefault()
      resetSelection()
      return
    }
    const offset =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0
    if (!offset) return
    event.preventDefault()
    const next = (index + offset + nodes.length) % nodes.length
    setSelection(nodes[next].id)
    buttons.current[next]?.focus()
  }
  return (
    <section className={styles.notebook} aria-label="我的学习地图">
      <section className={styles.task} aria-label="当前学习任务">
        <img
          className={styles.clue}
          src="/art/notebook/keyboard-clue.webp"
          width="1464"
          height="1075"
          alt=""
          fetchPriority="high"
        />
        <h2 className={styles.invitation}>
          {creating ? (
            <>
              我的点子，
              <br />
              可以变成作品了。
            </>
          ) : reviewing ? (
            <>
              回头看看，
              <br />
              找到新的办法。
            </>
          ) : (
            <>
              {isRecommended ? '今天，' : '这一站，'}
              <br />
              {active.id === 'keyboard' ? '找到第一条线索。' : '探索一个新本领。'}
            </>
          )}
        </h2>
        <div className={styles.skill}>
          <Icon size={27} aria-hidden="true" />
          <div>
            <h3 id="selected-stage-title">{creating ? '做一个自己的作品' : active.title}</h3>
            <p>{creating ? '带着你的想法，和小奇一起做出第一版。' : active.invitation}</p>
          </div>
        </div>
        <p className={styles.progress} aria-live="polite">
          {creating ? '推荐主线已完成 · 可以自由创作' : active.status}
        </p>
        <Link
          ref={startLink}
          className={'button primary ' + styles.start}
          to={destination}
          aria-label="开始 / 继续"
        >
          {reviewing
            ? '回去找线索'
            : creating
              ? '开始创作'
              : active.status === '未开始'
                ? '开始探索'
                : '继续探索'}
          <ArrowRight size={20} aria-hidden="true" />
        </Link>
        <details className={styles.details} key={creating ? 'create' : active.id}>
          <summary>学习详情</summary>
          <div className={styles.detailBody}>
            <p>{creating ? '把熟悉的本领用在自己的想法上。' : active.goal}</p>
            <p>{creating ? '自由创作室 · 可以随时返回作品集' : active.detail}</p>
            <small>
              {creating
                ? '可以先选一个小点子，做出第一版，再慢慢改。'
                : active.optional
                  ? '这是可选探索，主线完成后可以来试试。'
                  : '可以分几次慢慢完成。完成由练习记录或你的课堂自评决定。'}
            </small>
          </div>
        </details>
        {selection && active.id !== recommended?.id ? (
          <button className={styles.textButton} onClick={resetSelection}>
            <RotateCcw size={13} aria-hidden="true" />
            回到推荐起点
          </button>
        ) : (
          <Link className={styles.shortcut} to={allMainDone ? '/works' : '/classroom/story-cover'}>
            {allMainDone ? '去看看我的作品 →' : '已经会打字？从编程开始 →'}
          </Link>
        )}
        {!cacheAvailable && (
          <p role="alert" className={styles.cache}>
            当前浏览器无法保存游戏练习记录，可以继续学习；刷新后地图可能回到之前的位置。
          </p>
        )}
      </section>
      <div className={styles.route} data-testid="learning-island">
        <img
          className={styles.routeArt}
          src="/art/notebook/learning-route-v2.webp"
          width="1239"
          height="1269"
          alt=""
          fetchPriority="high"
        />
        <p className={styles.mobileGuide}>按编号探索，选一站看看要学什么。</p>
        <ol className={styles.steps} aria-label="学习步骤">
          {nodes.map((node, index) => {
            const StageIcon = node.icon
            const selected = node.id === active.id && (!allMainDone || !!selection)
            return (
              <li
                key={node.id}
                style={
                  {
                    '--x': `${positions[index][0]}%`,
                    '--y': `${positions[index][1]}%`,
                  } as CSSProperties
                }
                className={`${node.optional ? styles.optional : ''} ${selected ? styles.selected : ''}`}
              >
                <button
                  type="button"
                  ref={(element) => {
                    buttons.current[index] = element
                  }}
                  className={styles.stage}
                  aria-pressed={selected}
                  aria-current={node.id === recommended?.id ? 'step' : undefined}
                  onClick={() => setSelection(node.id)}
                  onKeyDown={(event) => selectWithKey(event, index)}
                >
                  <span className={styles.marker}>
                    {node.done ? <Check size={18} aria-hidden="true" /> : index + 1}
                  </span>
                  {selected && (
                    <span className={styles.here}>{isRecommended ? '你在这里' : '已选这一站'}</span>
                  )}
                  <span className={styles.artSpace}>
                    <StageIcon size={36} aria-hidden="true" />
                  </span>
                  <span className={styles.stageTitle}>{node.title}</span>
                  {node.optional && <small>可选探索</small>}
                  <span className={styles.srOnly}>：{node.status}</span>
                </button>
                {index < 5 && (
                  <span className={styles.mobileConnector} aria-hidden="true">
                    {index === 1 || index === 3 ? (
                      <ArrowDown size={19} />
                    ) : index === 2 ? (
                      <ArrowLeft size={19} />
                    ) : (
                      <ArrowRight size={19} />
                    )}
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
