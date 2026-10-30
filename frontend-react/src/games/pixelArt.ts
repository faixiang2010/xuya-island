/** 画笔小游戏共用的像素图案与比对工具。 */

export const PIXEL_COLORS: Record<string, string> = {
  A: '#e78a9a',
  B: '#f4c95d',
  C: '#8fd3a8',
  D: '#7ec8e3',
}

export interface PixelLevel {
  size: number
  palette: string[]
  target: string[][]
  revealSeconds: number
}

const MIRROR_LEVELS: Record<string, { half: string[]; palette: string[] }> = {
  heart: {
    palette: ['A', 'B'],
    half: ['..AA', '.AAA', 'AABA', 'AAAA', '.AAA', '..AA', '...A', '....'],
  },
  flower: {
    palette: ['A', 'B', 'C'],
    half: [
      '..A..',
      '.ABA.',
      'AACAA',
      '.ABA.',
      '..A..',
      '..B..',
      '..C..',
      '.AAA.',
      'A.A.A',
      '.....',
    ],
  },
  fish: {
    palette: ['A', 'B', 'C', 'D'],
    half: [
      '......',
      '...AAD',
      '..AAAA',
      '.AABBA',
      'AABBBB',
      '.AABBA',
      '..AAAA',
      '...AA.',
      '....C.',
      '...C..',
      '......',
      '......',
    ],
  },
}

const MEMORY_LEVELS: Record<string, { rows: string[]; palette: string[]; seconds: number }> = {
  card: {
    palette: ['A', 'B'],
    seconds: 4,
    rows: ['..A...', '.AAAA.', 'AAABAA', 'AAABAA', '.AAAA.', '..A...'],
  },
  poster: {
    palette: ['A', 'B', 'C'],
    seconds: 5,
    rows: [
      '..AAA...',
      '.AAAAA..',
      'AAABAAA.',
      'AABBBAAA',
      'AACBBAAA',
      'AAABAAA.',
      '.AAAAA..',
      '..AAA...',
    ],
  },
  gallery: {
    palette: ['A', 'B', 'C', 'D'],
    seconds: 6,
    rows: [
      '....AA....',
      '...AAAA...',
      '..AABAAA..',
      '.AABBBAAA.',
      'AABBCBBAAA',
      'AABBCBBAAA',
      '.AABBBAAA.',
      '..AABAAA..',
      '...AAAA...',
      '....DD....',
    ],
  },
}

function parse(rows: string[]) {
  return rows.map((row) => [...row])
}

export function mirrorLevel(levelId: string): PixelLevel {
  const level = MIRROR_LEVELS[levelId] ?? MIRROR_LEVELS.heart
  const left = parse(level.half)
  const target = left.map((row) => [...row, ...[...row].reverse()])
  return {
    size: target.length,
    palette: level.palette,
    target,
    revealSeconds: 0,
  }
}

export function memoryLevel(levelId: string): PixelLevel {
  const level = MEMORY_LEVELS[levelId] ?? MEMORY_LEVELS.card
  const target = parse(level.rows)
  return {
    size: target.length,
    palette: level.palette,
    target,
    revealSeconds: level.seconds,
  }
}

export function emptyPainting(size: number): string[][] {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => ''))
}

/** 镜像画室的开局：左半边已经画好，右半边留白。 */
export function mirrorStart(target: string[][]): string[][] {
  const size = target.length
  return target.map((row) => row.map((cell, x) => (x < size / 2 ? cell : '')))
}

export function comparePainting(painted: string[][], target: string[][]) {
  let wrong = 0
  let total = 0
  for (let y = 0; y < target.length; y += 1)
    for (let x = 0; x < target.length; x += 1) {
      if (target[y][x]) total += 1
      if (painted[y][x] !== target[y][x]) wrong += 1
    }
  return { wrong, total }
}

export function paintingMatches(painted: string[][], target: string[][]) {
  return painted.every((row, y) => row.every((cell, x) => cell === target[y][x]))
}
