import { useEffect, useMemo, useRef, useState, useId } from 'react'
import type { StageEvent } from '../types'
import { deriveStageState, readStageEvents } from '../runner/stage'
import '../styles-stage.css'

interface Props {
  events?: StageEvent[]
  scene?: string
}

export default function StagePreview({ events: eventsProp, scene = 'milk-tea' }: Props) {
  const clipId = 'cup-liquid-' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const events = useMemo(() => readStageEvents(eventsProp), [eventsProp])
  const [cursor, setCursor] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const previousRef = useRef<StageEvent[]>([])
  const eventsRef = useRef(events)
  const cursorRef = useRef(cursor)
  const playingRef = useRef(playing)
  const speedRef = useRef(speed)
  eventsRef.current = events
  cursorRef.current = cursor
  playingRef.current = playing
  speedRef.current = speed

  const state = useMemo(() => deriveStageState(events.slice(0, cursor)), [events, cursor])
  const pearls = Array.from({ length: Math.min(36, Math.floor(state.pearls)) }, (_, i) => i)
  const cups = Array.from({ length: Math.min(6, Math.floor(state.drinks)) }, (_, i) => i)
  const characters = Object.entries(state.actors).filter(([id]) => id !== 'bubu')
  const currentAction = events[cursor - 1]?.kind
  const liquidHeight = Math.min(112, state.filled * 58)
  const speech =
    state.lastSpeech ||
    (events.length ? '我盯紧每一步了。大概。' : '准备好了就运行，让代码开动小镇。')

  function stopTimer() {
    clearInterval(timerRef.current)
    timerRef.current = undefined
  }
  function tick() {
    const list = eventsRef.current
    if (!playingRef.current || cursorRef.current >= list.length) {
      stopTimer()
      return
    }
    const next = Math.min(list.length, cursorRef.current + (speedRef.current === 4 ? 4 : 1))
    cursorRef.current = next
    setCursor(next)
  }
  function startTimer() {
    if (!timerRef.current && playingRef.current && cursorRef.current < eventsRef.current.length) {
      tick()
      timerRef.current = setInterval(tick, speedRef.current === 4 ? 110 : 480)
    }
  }
  function replay() {
    stopTimer()
    cursorRef.current = 0
    setCursor(0)
    playingRef.current = true
    setPlaying(true)
    startTimer()
  }
  function toggle() {
    const next = !playingRef.current
    playingRef.current = next
    setPlaying(next)
    if (next) startTimer()
    else stopTimer()
  }
  function fastForward() {
    stopTimer()
    const next = speedRef.current === 4 ? 1 : 4
    speedRef.current = next
    setSpeed(next)
    playingRef.current = true
    setPlaying(true)
    startTimer()
  }

  useEffect(() => {
    const next = events
    const prefixMatches = previousRef.current.every(
      (event, index) => JSON.stringify(event) === JSON.stringify(next[index]),
    )
    if (!prefixMatches || next.length === 0) {
      stopTimer()
      cursorRef.current = 0
      setCursor(0)
      playingRef.current = true
      setPlaying(true)
      speedRef.current = 1
      setSpeed(1)
    }
    previousRef.current = next.map((event) => ({ ...event }))
    startTimer()
    return stopTimer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events])

  return (
    <section className="stage-preview" aria-label="Python 动画舞台" data-testid="animation-stage">
      <div className="stage-heading">
        <span className="stage-location">
          {scene === 'milk-tea' ? '离谱小镇 · 咕噜奶茶店' : '我的离谱小舞台'}
        </span>
        <span className="stage-live">
          <i></i>
          {cursor < events.length
            ? '小镇正在开动'
            : events.length
              ? '看看发生了什么'
              : '等你的第一行代码'}
        </span>
      </div>
      <svg
        className="town-stage"
        viewBox="0 0 760 380"
        role="img"
        aria-label={`舞台：杯中奶${state.filled}份，漏奶${state.spilled}份，珍珠${state.pearls}颗，饮品${state.drinks}杯`}
      >
        <defs>
          <clipPath id={clipId}>
            <path d="M435 187 L543 187 L531 309 Q490 328 449 309 Z" />
          </clipPath>
          <pattern id="town-paper-dots" width="18" height="18" patternUnits="userSpaceOnUse">
            <circle cx="3" cy="3" r="1" fill="#c5b6e5" opacity=".15" />
          </pattern>
        </defs>
        <rect width="760" height="380" rx="22" fill="#f6efff" />
        <rect width="760" height="380" fill="url(#town-paper-dots)" />
        <circle cx="690" cy="63" r="29" fill="#ffd779" />
        <path d="M28 93 Q65 66 89 94 Q126 69 143 100 H28Z" fill="white" opacity=".9" />
        <path d="M559 79 Q580 49 604 75 Q638 51 653 82 H559Z" fill="white" opacity=".8" />
        <path d="M0 270 Q133 243 266 269 T536 269 T760 264 V380 H0Z" fill="#d9e9d5" />
        <path d="M0 339 Q240 302 420 342 T760 329 V380 H0Z" fill="#c8bde4" opacity=".5" />
        {scene === 'milk-tea' ? (
          <g>
            <rect
              x="321"
              y="91"
              width="311"
              height="218"
              rx="15"
              fill="#fff8e6"
              stroke="#5e426e"
              strokeWidth="3"
            />
            <path
              d="M307 118 L324 67 H627 L646 118 Z"
              fill="#ffb5a1"
              stroke="#5e426e"
              strokeWidth="3"
            />
            <path
              d="M348 69 L344 116 M397 69 L392 116 M447 69 L445 116 M496 69 L500 116 M547 69 L555 116 M598 69 L608 116"
              stroke="#fff8e6"
              strokeWidth="23"
            />
            <rect
              x="389"
              y="31"
              width="176"
              height="54"
              rx="15"
              fill="#fff"
              stroke="#5e426e"
              strokeWidth="3"
              transform="rotate(-3 477 58)"
            />
            <text x="477" y="65" textAnchor="middle" fill="#5e426e" fontSize="24" fontWeight="800">
              咕噜奶茶
            </text>
            <rect
              x="302"
              y="301"
              width="356"
              height="23"
              rx="8"
              fill="#b896cd"
              stroke="#5e426e"
              strokeWidth="3"
            />
            {state.spilled > 0 && (
              <ellipse
                className="stage-puddle"
                cx="530"
                cy="333"
                rx={Math.min(110, 38 + state.spilled * 20)}
                ry="14"
                fill="#e7caa0"
              />
            )}
            <g
              className={
                currentAction === 'pour' || currentAction === 'pearls' ? 'cup-bounce' : undefined
              }
            >
              <path
                d="M435 187 L543 187 L531 309 Q490 328 449 309 Z"
                fill="#fff"
                fillOpacity=".65"
                stroke="#5e426e"
                strokeWidth="3"
              />
              <g clipPath={`url(#${clipId})`}>
                <rect
                  x="434"
                  y={318 - liquidHeight}
                  width="110"
                  height={liquidHeight}
                  fill="#dfbe93"
                />
                {pearls.map((pearl) => (
                  <circle
                    key={pearl}
                    cx={451 + (pearl % 8) * 11}
                    cy={304 - Math.floor(pearl / 8) * 12}
                    r="5"
                    fill="#634552"
                  />
                ))}
              </g>
              <ellipse
                cx="489"
                cy="187"
                rx="54"
                ry="9"
                fill={state.cupOpen ? '#fffbf6' : '#aa8bcc'}
                stroke="#5e426e"
                strokeWidth="3"
              />
              {!state.cupOpen && (
                <path
                  d="M491 186 L503 148"
                  stroke="#ee8c92"
                  strokeWidth="7"
                  strokeLinecap="round"
                />
              )}
            </g>
            {cups.map((item) => (
              <g key={item} transform={`translate(${337 + item * 48} 337)`}>
                <path d="M0 0 H30 L26 27 H4 Z" fill="#e4c491" stroke="#5e426e" strokeWidth="2" />
                <path
                  d="M-2 0 H32 M16 0 L20 -15"
                  stroke="#5e426e"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </g>
            ))}
            <text x="342" y="160" fill="#76647c" fontSize="14">
              今天也努力正常营业
            </text>
          </g>
        ) : (
          <g>
            <rect
              x="320"
              y="221"
              width="383"
              height="99"
              rx="28"
              fill="#bca0d7"
              stroke="#69517e"
              strokeWidth="3"
            />
            <path d="M335 236 H688" stroke="#e7d8f7" strokeWidth="3" strokeDasharray="6 8" />
            <text x="511" y="349" textAnchor="middle" fill="#69517e" fontSize="17">
              你的故事，在这里开演
            </text>
          </g>
        )}
        <g className="stage-robot" transform="translate(126 201)">
          <path d="M38 -45 V-58" stroke="#5e426e" strokeWidth="5" />
          <circle cx="38" cy="-64" r="7" fill="#ffb587" stroke="#5e426e" strokeWidth="3" />
          <rect
            x="-8"
            y="-38"
            width="94"
            height="75"
            rx="20"
            fill="#c6b5eb"
            stroke="#5e426e"
            strokeWidth="3"
          />
          <rect x="2" y="-22" width="75" height="36" rx="12" fill="#fff8ee" />
          <ellipse cx="25" cy="-4" rx="6" ry="8" fill="#5e426e" />
          <ellipse cx="57" cy="-4" rx="6" ry="8" fill="#5e426e" />
          <path
            d={state.spilled > 0 ? 'M31 25 Q42 16 53 25' : 'M31 22 Q42 30 53 22'}
            fill="none"
            stroke="#5e426e"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <rect
            x="4"
            y="44"
            width="72"
            height="57"
            rx="16"
            fill="#ffcf8e"
            stroke="#5e426e"
            strokeWidth="3"
          />
          <circle cx="40" cy="68" r="10" fill="#fff8ee" stroke="#5e426e" strokeWidth="2" />
          <path
            d="M2 58 L-25 75 M78 57 L101 73 M19 102 L14 121 M61 102 L65 121"
            stroke="#5e426e"
            strokeWidth="8"
            strokeLinecap="round"
          />
        </g>
        {characters.map(([id, person], index) => (
          <g
            key={id}
            transform={`translate(${400 + (index % 3) * 95 + Math.max(-150, Math.min(150, person.x))} ${255 + Math.max(-95, Math.min(45, person.y))}) scale(${person.size})`}
          >
            <path
              d={
                person.kind === 'ghost'
                  ? 'M-33 30 V-7 A33 33 0 0 1 33 -7 V30 L20 19 L7 30 L-6 19 L-19 30 Z'
                  : 'M-37 25 Q-50 -20 -26 -36 Q-5 -55 17 -35 Q54 -22 37 25 Q0 49 -37 25'
              }
              fill={
                person.kind === 'cat' ? '#ffbb8c' : person.kind === 'ghost' ? '#fffdf7' : '#b39adc'
              }
              stroke="#5e426e"
              strokeWidth="3"
            />
            {person.kind === 'cat' && (
              <path
                d="M-28 -32 L-32 -60 L-6 -41 M12 -41 L33 -58 L30 -26"
                fill="#ffbb8c"
                stroke="#5e426e"
                strokeWidth="3"
              />
            )}
            <circle cx="-12" cy="-7" r="4" fill="#5e426e" />
            <circle cx="14" cy="-7" r="4" fill="#5e426e" />
            <path
              d="M-7 8 Q3 17 13 8"
              fill="none"
              stroke="#5e426e"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <text y="66" textAnchor="middle" fill="#5e426e" fontSize="13">
              {id}
            </text>
          </g>
        ))}
        <foreignObject x="42" y="90" width="257" height="96">
          <div className="stage-speech" aria-live="polite">
            {speech}
          </div>
        </foreignObject>
        {state.pearls > 36 && (
          <text x="646" y="246" textAnchor="middle" fill="#5e426e" fontSize="19" fontWeight="800">
            {state.pearls}颗！
          </text>
        )}
      </svg>
      <div className="stage-facts" data-testid="stage-facts" aria-live="polite">
        {scene === 'milk-tea' ? (
          <span>
            杯中奶 <b>{state.filled}</b> · 漏奶 <b>{state.spilled}</b> · 珍珠 <b>{state.pearls}</b>{' '}
            · 饮品 <b>{state.drinks}</b> 杯
          </span>
        ) : (
          <span>
            {characters.length ? `登场 ${characters.length} 位角色` : '试着请一个角色登场吧'}
          </span>
        )}
        {state.flavour && <span className="stage-flavour">{state.flavour}</span>}
        {Object.entries(state.counters).map(([key, value]) => (
          <span key={key}>
            {key}：{value}
          </span>
        ))}
      </div>
      <div className="stage-controls">
        <button type="button" disabled={!events.length} onClick={replay}>
          ↺ 重播
        </button>
        <button type="button" disabled={!events.length} onClick={toggle}>
          {playing ? 'Ⅱ 暂停动画' : '▷ 继续动画'}
        </button>
        <button type="button" disabled={!events.length} onClick={fastForward}>
          {speed === 4 ? '恢复速度' : '» 快进'}
        </button>
        <span>
          {cursor} / {events.length} 个动作
        </span>
      </div>
    </section>
  )
}
