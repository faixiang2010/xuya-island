/** 回声迷宫：先凿出连通迷宫，再让玩家靠有限次数的声波探索。 */

export interface EchoLevel {
  size: number
  pings: number
}

export interface EchoState {
  maze: boolean[][]
  player: { x: number; y: number }
  exit: { x: number; y: number }
  revealed: boolean[][]
  pings: number
  status: 'playing' | 'won'
}

const LEVELS: Record<string, EchoLevel> = {
  cave: { size: 9, pings: 8 },
  grotto: { size: 11, pings: 9 },
  abyss: { size: 13, pings: 10 },
}

export function echoLevel(levelId: string): EchoLevel {
  return LEVELS[levelId] ?? LEVELS.cave
}

function carve(size: number, random: () => number) {
  const maze = Array.from({ length: size }, () => Array<boolean>(size).fill(true))
  const stack: [number, number][] = [[1, 1]]
  maze[1][1] = false
  while (stack.length) {
    const [x, y] = stack[stack.length - 1]
    const options: [number, number, number, number][] = []
    for (const [dx, dy] of [
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
    ] as const) {
      const nextX = x + dx
      const nextY = y + dy
      if (nextX > 0 && nextX < size - 1 && nextY > 0 && nextY < size - 1 && maze[nextY][nextX])
        options.push([nextX, nextY, x + dx / 2, y + dy / 2])
    }
    if (!options.length) {
      stack.pop()
      continue
    }
    const pick = options[Math.floor(random() * options.length)]
    maze[pick[3]][pick[2]] = false
    maze[pick[1]][pick[0]] = false
    stack.push([pick[0], pick[1]])
  }
  maze[size - 2][size - 2] = false
  maze[size - 2][size - 3] = false
  maze[size - 3][size - 2] = false
  return maze
}

function revealAround(revealed: boolean[][], x: number, y: number, radius: number) {
  const next = revealed.map((row) => [...row])
  for (let row = y - radius; row <= y + radius; row += 1)
    for (let column = x - radius; column <= x + radius; column += 1)
      if (row >= 0 && row < next.length && column >= 0 && column < next.length)
        next[row][column] = true
  return next
}

export function createEcho(levelId: string, random: () => number = Math.random): EchoState {
  const level = echoLevel(levelId)
  const maze = carve(level.size, random)
  const player = { x: 1, y: 1 }
  return {
    maze,
    player,
    exit: { x: level.size - 2, y: level.size - 2 },
    revealed: revealAround(
      Array.from({ length: level.size }, () => Array<boolean>(level.size).fill(false)),
      player.x,
      player.y,
      1,
    ),
    pings: level.pings,
    status: 'playing',
  }
}

export function ping(state: EchoState): EchoState {
  if (state.status !== 'playing' || state.pings <= 0) return state
  return {
    ...state,
    revealed: revealAround(state.revealed, state.player.x, state.player.y, 2),
    pings: state.pings - 1,
  }
}

export function moveEcho(state: EchoState, dx: number, dy: number): EchoState {
  if (state.status !== 'playing') return state
  const x = state.player.x + dx
  const y = state.player.y + dy
  if (x < 0 || x >= state.maze.length || y < 0 || y >= state.maze.length) return state
  if (state.maze[y][x]) return state
  const player = { x, y }
  return {
    ...state,
    player,
    revealed: revealAround(state.revealed, x, y, 1),
    status: x === state.exit.x && y === state.exit.y ? 'won' : 'playing',
  }
}

/** 测试与提示用：判断起点能否走到出口。 */
export function echoReachable(state: EchoState) {
  const seen = new Set<string>([`${state.player.x},${state.player.y}`])
  const queue: [number, number][] = [[state.player.x, state.player.y]]
  while (queue.length) {
    const [x, y] = queue.pop()!
    if (x === state.exit.x && y === state.exit.y) return true
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nextX = x + dx
      const nextY = y + dy
      const key = `${nextX},${nextY}`
      if (nextX < 0 || nextX >= state.maze.length || nextY < 0 || nextY >= state.maze.length)
        continue
      if (state.maze[nextY][nextX] || seen.has(key)) continue
      seen.add(key)
      queue.push([nextX, nextY])
    }
  }
  return false
}
