/** 风向邮差：先在格子里排好风向，再让叶子按指令前进。 */

export type Direction = 0 | 1 | 2 | 3

export interface WindPoint {
  x: number
  y: number
}

export interface WindLevel {
  size: number
  budget: number
  start: WindPoint
  goal: WindPoint
  letters: WindPoint[]
  walls: WindPoint[]
}

export interface WindState {
  arrows: (Direction | null)[][]
  placed: number
  status: 'editing' | 'running' | 'won' | 'lost'
  leaf: WindPoint
  path: WindPoint[]
  collected: number
  message: string
}

const DIRECTIONS: [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
]

const LEVELS: Record<string, WindLevel> = {
  breeze: {
    size: 7,
    budget: 6,
    start: { x: 0, y: 3 },
    goal: { x: 6, y: 3 },
    letters: [],
    walls: [
      { x: 3, y: 1 },
      { x: 3, y: 2 },
      { x: 3, y: 4 },
      { x: 3, y: 5 },
    ],
  },
  gale: {
    size: 8,
    budget: 10,
    start: { x: 0, y: 1 },
    goal: { x: 7, y: 5 },
    letters: [],
    walls: [
      { x: 6, y: 0 },
      { x: 6, y: 1 },
      { x: 6, y: 2 },
      { x: 6, y: 3 },
      { x: 3, y: 3 },
      { x: 3, y: 4 },
      { x: 3, y: 5 },
      { x: 3, y: 6 },
    ],
  },
  storm: {
    size: 9,
    budget: 15,
    start: { x: 0, y: 0 },
    goal: { x: 8, y: 8 },
    letters: [
      { x: 2, y: 0 },
      { x: 2, y: 4 },
      { x: 6, y: 4 },
    ],
    walls: [
      { x: 4, y: 2 },
      { x: 4, y: 3 },
      { x: 4, y: 5 },
      { x: 4, y: 6 },
      { x: 7, y: 1 },
      { x: 7, y: 2 },
      { x: 1, y: 6 },
      { x: 2, y: 6 },
    ],
  },
}

export function windLevel(levelId: string): WindLevel {
  return LEVELS[levelId] ?? LEVELS.breeze
}

function key(point: WindPoint) {
  return `${point.x},${point.y}`
}

function blocked(level: WindLevel, x: number, y: number) {
  return (
    x < 0 ||
    y < 0 ||
    x >= level.size ||
    y >= level.size ||
    level.walls.some((wall) => wall.x === x && wall.y === y)
  )
}

export function createWind(levelId: string): WindState {
  const level = windLevel(levelId)
  // 起点自带一个向右的出发指令，不占管理员的风向预算；玩家只需要排好后面的路线。
  const arrows = Array.from({ length: level.size }, () =>
    Array.from({ length: level.size }, () => null as Direction | null),
  )
  arrows[level.start.y][level.start.x] = 0
  return {
    arrows,
    placed: 0,
    status: 'editing',
    leaf: { ...level.start },
    path: [{ ...level.start }],
    collected: 0,
    message: '',
  }
}

export function cycleArrow(state: WindState, levelId: string, x: number, y: number): WindState {
  if (state.status === 'running' || state.status === 'won') return state
  const level = windLevel(levelId)
  if (blocked(level, x, y)) return state
  if (level.start.x === x && level.start.y === y) return state
  if (level.goal.x === x && level.goal.y === y) return state
  const current = state.arrows[y][x]
  const arrows = state.arrows.map((row) => [...row])
  if (current === null) {
    if (state.placed >= level.budget) return state
    arrows[y][x] = 0
    return { ...state, arrows, placed: state.placed + 1, status: 'editing', message: '' }
  }
  if (current >= 3) {
    arrows[y][x] = null
    return { ...state, arrows, placed: state.placed - 1, status: 'editing', message: '' }
  }
  arrows[y][x] = (current + 1) as Direction
  return { ...state, arrows, status: 'editing', message: '' }
}

export function clearWind(levelId: string): WindState {
  return createWind(levelId)
}

export function runWind(state: WindState, levelId: string): WindState {
  const level = windLevel(levelId)
  const letterKeys = new Set(level.letters.map(key))
  const collectedKeys = new Set<string>()
  const visited = new Set<string>([key(level.start)])
  const path: WindPoint[] = [{ ...level.start }]
  let current = { ...level.start }
  let collected = 0
  for (let step = 0; step < level.size * level.size * 2; step += 1) {
    if (current.x === level.goal.x && current.y === level.goal.y) {
      if (collected === level.letters.length)
        return { ...state, status: 'won', leaf: current, path, collected, message: '信送到了！' }
      return {
        ...state,
        status: 'lost',
        leaf: current,
        path,
        collected,
        message: '还有信件没收集，再检查一下路线。',
      }
    }
    const direction = state.arrows[current.y][current.x]
    if (direction === null)
      return {
        ...state,
        status: 'lost',
        leaf: current,
        path,
        collected,
        message: '这里没有风向指令，叶子停住了。',
      }
    const [dx, dy] = DIRECTIONS[direction]
    const next = { x: current.x + dx, y: current.y + dy }
    if (blocked(level, next.x, next.y))
      return {
        ...state,
        status: 'lost',
        leaf: current,
        path,
        collected,
        message: '叶子撞上了礁石或走出了小岛。',
      }
    current = next
    path.push(current)
    if (letterKeys.has(key(current)) && !collectedKeys.has(key(current))) {
      collectedKeys.add(key(current))
      collected += 1
    }
    if (visited.has(key(current)))
      return {
        ...state,
        status: 'lost',
        leaf: current,
        path,
        collected,
        message: '叶子在原地绕圈了，检查一下箭头方向。',
      }
    visited.add(key(current))
  }
  return {
    ...state,
    status: 'lost',
    leaf: current,
    path,
    collected,
    message: '路线太长了，再简化一下。',
  }
}
