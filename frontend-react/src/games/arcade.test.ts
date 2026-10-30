import { describe, expect, it } from 'vitest'
import { typingGames, type GameId } from './content'
import { createTetris, hardDrop, movePiece, rotatePiece } from './tetris'
import { createMinesweeper, revealCell, toggleFlag } from './minesweeper'
import { createEcho, echoReachable, moveEcho, ping } from './echoMaze'
import { createWind, cycleArrow, runWind, type Direction } from './windCourier'
import { createMelody, melodyLevel, moveMelody, undoMelody } from './melodyPath'
import { appendPiano, createPiano } from './memoryPiano'
import { comparePainting, memoryLevel, mirrorLevel, mirrorStart, paintingMatches } from './pixelArt'

const arcadeIds: GameId[] = [
  'tetris',
  'minesweeper',
  'echo',
  'wind',
  'melody',
  'piano',
  'mirror',
  'memory',
]

describe('动脑小游戏注册', () => {
  it('八款游戏都有三级关卡，且不依赖打字卡片', () => {
    for (const id of arcadeIds) {
      const game = typingGames[id]
      expect(game.levels).toHaveLength(3)
      expect(game.levels.every((level) => level.version === 1)).toBe(true)
      expect(game.levels.every((level) => level.tasks.length === 0)).toBe(true)
    }
  })
})

describe('俄罗斯方块规则', () => {
  it('方块可以左右移动、旋转，并在落底后写入棋盘', () => {
    const state = createTetris(5, () => 0)
    expect(state.piece.type).toBe(0)
    expect(movePiece({ ...state, piece: { ...state.piece, x: 0 } }, -1, 0).piece.x).toBe(0)
    expect(rotatePiece(state).piece.shape).not.toEqual(state.piece.shape)
    const dropped = hardDrop(state, () => 0)
    expect(dropped.board.flat().some((cell) => cell !== 0)).toBe(true)
    expect(dropped.status).toBe('playing')
  })

  it('拼满一行会消除并累计消行数', () => {
    const base = createTetris(5, () => 0)
    const board = base.board.map((row) => [...row])
    board[19] = [1, 1, 1, 1, 1, 1, 1, 1, 0, 0]
    const state = {
      ...base,
      board,
      piece: {
        type: 1,
        shape: [
          [1, 1],
          [1, 1],
        ],
        x: 8,
        y: 18,
      },
    }
    const next = hardDrop(state, () => 0)
    expect(next.lines).toBe(1)
    expect(next.score).toBeGreaterThan(0)
    expect(next.board[19].filter((cell) => cell !== 0)).toHaveLength(2)
  })
})

describe('扫雷规则', () => {
  it('第一次点击安全，布雷数量正确，翻完安全格后通关', () => {
    let state = createMinesweeper('beach')
    state = revealCell(state, 4, 4, () => 0.42)
    expect(state.board[4][4].mine).toBe(false)
    expect(state.board.flat().filter((cell) => cell.mine)).toHaveLength(10)
    let flagX = 0
    let flagY = 0
    outer: for (let y = 0; y < state.height; y += 1)
      for (let x = 0; x < state.width; x += 1)
        if (!state.board[y][x].open) {
          flagX = x
          flagY = y
          break outer
        }
    const flagged = toggleFlag(state, flagX, flagY)
    expect(flagged.board[flagY][flagX].flag).toBe(true)
    for (let y = 0; y < state.height; y += 1)
      for (let x = 0; x < state.width; x += 1)
        if (!state.board[y][x].mine) state = revealCell(state, x, y, () => 0.42)
    expect(state.status).toBe('won')
  })
})

describe('回声迷宫规则', () => {
  it('迷宫起点到出口连通，声波有次数限制，墙不能穿过', () => {
    const state = createEcho('cave', () => 0.25)
    expect(echoReachable(state)).toBe(true)
    expect(state.revealed[1][1]).toBe(true)
    expect(ping(state).pings).toBe(state.pings - 1)
    expect(moveEcho(state, -1, 0).player).toEqual(state.player)
    const open = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].find(([dx, dy]) => !state.maze[1 + dy][1 + dx])!
    const moved = moveEcho(state, open[0], open[1])
    expect(moved.player).toEqual({ x: 1 + open[0], y: 1 + open[1] })
  })
})

function place(
  state: ReturnType<typeof createWind>,
  levelId: string,
  x: number,
  y: number,
  direction: Direction,
) {
  let next = state
  for (let step = 0; step <= direction; step += 1) next = cycleArrow(next, levelId, x, y)
  return next
}

describe('风向邮差规则', () => {
  it('按路线放置风向可以把叶子送到邮筒', () => {
    let state = createWind('breeze')
    for (let x = 1; x <= 5; x += 1) state = cycleArrow(state, 'breeze', x, 3)
    expect(state.placed).toBe(5)
    state = runWind(state, 'breeze')
    expect(state.status).toBe('won')
  })

  it('没有指令时叶子会停下', () => {
    expect(runWind(createWind('breeze'), 'breeze').status).toBe('lost')
  })

  it('风暴关能收集三封信并到达邮筒', () => {
    let state = createWind('storm')
    for (const [x, y, direction] of [
      [1, 0, 0],
      [2, 0, 1],
      [2, 1, 1],
      [2, 2, 1],
      [2, 3, 1],
      [2, 4, 0],
      [3, 4, 0],
      [4, 4, 0],
      [5, 4, 0],
      [6, 4, 1],
      [6, 5, 1],
      [6, 6, 1],
      [6, 7, 1],
      [6, 8, 0],
      [7, 8, 0],
    ] as const)
      state = place(state, 'storm', x, y, direction)
    state = runWind(state, 'storm')
    expect(state.status).toBe('won')
    expect(state.collected).toBe(3)
  })
})

describe('音符小径规则', () => {
  it('沿着预设路线可以奏出目标旋律，撤销后可以重走', () => {
    const level = melodyLevel('first')
    let state = createMelody('first')
    for (const point of level.solution.slice(1)) state = moveMelody(state, point.x, point.y)
    expect(state.status).toBe('won')
    expect(state.notes).toEqual(level.melody)
    const undone = undoMelody(state)
    expect(undone.status).toBe('playing')
    expect(undone.notes).toHaveLength(level.melody.length - 1)
  })
})

describe('记忆琴房规则', () => {
  it('弹对会让旋律变长，弹错会重听同一段', () => {
    let state = createPiano('short', () => 0)
    expect(state.sequence).toHaveLength(2)
    state = appendPiano(state, state.sequence[0], () => 0)
    state = appendPiano(state, state.sequence[1], () => 0)
    expect(state.sequence).toHaveLength(3)
    const wrong = appendPiano(state, 6, () => 0)
    expect(wrong.mistakes).toBe(1)
    expect(wrong.input).toEqual([])
    let guard = 0
    while (state.status !== 'won' && guard < 20) {
      state = appendPiano(state, state.sequence[state.input.length], () => 0)
      guard += 1
    }
    expect(state.status).toBe('won')
    expect(state.sequence).toHaveLength(4)
  })
})

describe('画笔小游戏规则', () => {
  it('镜像图案左右对称，右半边补完后与目标一致', () => {
    const level = mirrorLevel('heart')
    expect(level.target).toHaveLength(8)
    for (const row of level.target) {
      expect(row).toHaveLength(8)
      expect(row.join('')).toBe([...row].reverse().join(''))
    }
    const start = mirrorStart(level.target)
    expect(start[0].slice(0, 4)).toEqual(level.target[0].slice(0, 4))
    expect(start[0].slice(4).every((cell) => cell === '')).toBe(true)
    expect(comparePainting(start, level.target).wrong).toBeGreaterThan(0)
    expect(paintingMatches(level.target, level.target)).toBe(true)
  })

  it('记忆画廊的目标图案尺寸与关卡一致', () => {
    expect(memoryLevel('card').target).toHaveLength(6)
    expect(memoryLevel('poster').target).toHaveLength(8)
    expect(memoryLevel('gallery').target).toHaveLength(10)
    for (const level of [memoryLevel('card'), memoryLevel('poster'), memoryLevel('gallery')])
      expect(level.target.every((row) => row.length === level.size)).toBe(true)
  })
})
