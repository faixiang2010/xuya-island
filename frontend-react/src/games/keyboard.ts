/** 全键盘布局与十指分区：指法学院和所有键盘提示共用这一份定义。 */
export type FingerId =
  | 'left-pinky'
  | 'left-ring'
  | 'left-middle'
  | 'left-index'
  | 'left-thumb'
  | 'right-thumb'
  | 'right-index'
  | 'right-middle'
  | 'right-ring'
  | 'right-pinky'

export type Hand = 'left' | 'right'

export interface FingerInfo {
  id: FingerId
  hand: Hand
  name: string
  short: string
  color: string
}

export interface KeyDef {
  key: string
  label?: string
  finger?: FingerId
  width?: number
  home?: boolean
}

export interface KeyRow {
  id: string
  keys: KeyDef[]
}

export const fingerInfo: Record<FingerId, FingerInfo> = {
  'left-pinky': { id: 'left-pinky', hand: 'left', name: '左手小指', short: '小', color: '#d76a9b' },
  'left-ring': {
    id: 'left-ring',
    hand: 'left',
    name: '左手无名指',
    short: '无名',
    color: '#e59a52',
  },
  'left-middle': {
    id: 'left-middle',
    hand: 'left',
    name: '左手中指',
    short: '中',
    color: '#d9bd45',
  },
  'left-index': {
    id: 'left-index',
    hand: 'left',
    name: '左手食指',
    short: '食',
    color: '#69b98f',
  },
  'left-thumb': { id: 'left-thumb', hand: 'left', name: '左手拇指', short: '拇', color: '#8c9aab' },
  'right-thumb': {
    id: 'right-thumb',
    hand: 'right',
    name: '右手拇指',
    short: '拇',
    color: '#8c9aab',
  },
  'right-index': {
    id: 'right-index',
    hand: 'right',
    name: '右手食指',
    short: '食',
    color: '#4f9bd6',
  },
  'right-middle': {
    id: 'right-middle',
    hand: 'right',
    name: '右手中指',
    short: '中',
    color: '#7d86d8',
  },
  'right-ring': {
    id: 'right-ring',
    hand: 'right',
    name: '右手无名指',
    short: '无名',
    color: '#b874c9',
  },
  'right-pinky': {
    id: 'right-pinky',
    hand: 'right',
    name: '右手小指',
    short: '小',
    color: '#c95b86',
  },
}

/** 左右手从外到内的顺序，用于手指示意图。 */
export const leftFingers: FingerId[] = [
  'left-pinky',
  'left-ring',
  'left-middle',
  'left-index',
  'left-thumb',
]
export const rightFingers: FingerId[] = [
  'right-thumb',
  'right-index',
  'right-middle',
  'right-ring',
  'right-pinky',
]

/** 家位键：孩子每次输入前应先回到这八个位置。 */
export const homeKeys = ['a', 's', 'd', 'f', 'j', 'k', 'l', ';'] as const

const digit = (key: string, finger: FingerId): KeyDef => ({ key, finger })
const letter = (key: string, finger: FingerId): KeyDef => ({
  key,
  finger,
  home: (homeKeys as readonly string[]).includes(key),
})
const modifier = (key: string, label: string, width: number, finger?: FingerId): KeyDef => ({
  key,
  label,
  width,
  finger,
})

export const keyRows: KeyRow[] = [
  {
    id: 'numbers',
    keys: [
      digit('`', 'left-pinky'),
      digit('1', 'left-pinky'),
      digit('2', 'left-ring'),
      digit('3', 'left-middle'),
      digit('4', 'left-index'),
      digit('5', 'left-index'),
      digit('6', 'right-index'),
      digit('7', 'right-index'),
      digit('8', 'right-middle'),
      digit('9', 'right-ring'),
      digit('0', 'right-pinky'),
      digit('-', 'right-pinky'),
      digit('=', 'right-pinky'),
      modifier('Backspace', '退格', 2, 'right-pinky'),
    ],
  },
  {
    id: 'top',
    keys: [
      modifier('Tab', 'Tab', 1.5, 'left-pinky'),
      letter('q', 'left-pinky'),
      letter('w', 'left-ring'),
      letter('e', 'left-middle'),
      letter('r', 'left-index'),
      letter('t', 'left-index'),
      letter('y', 'right-index'),
      letter('u', 'right-index'),
      letter('i', 'right-middle'),
      letter('o', 'right-ring'),
      letter('p', 'right-pinky'),
      digit('[', 'right-pinky'),
      digit(']', 'right-pinky'),
      modifier('\\', '\\', 1.5, 'right-pinky'),
    ],
  },
  {
    id: 'home',
    keys: [
      modifier('CapsLock', 'Caps', 1.75, 'left-pinky'),
      letter('a', 'left-pinky'),
      letter('s', 'left-ring'),
      letter('d', 'left-middle'),
      letter('f', 'left-index'),
      letter('g', 'left-index'),
      letter('h', 'right-index'),
      letter('j', 'right-index'),
      letter('k', 'right-middle'),
      letter('l', 'right-ring'),
      letter(';', 'right-pinky'),
      digit("'", 'right-pinky'),
      modifier('Enter', '回车', 2.25, 'right-pinky'),
    ],
  },
  {
    id: 'bottom',
    keys: [
      modifier('ShiftLeft', 'Shift', 2.25, 'left-pinky'),
      letter('z', 'left-pinky'),
      letter('x', 'left-ring'),
      letter('c', 'left-middle'),
      letter('v', 'left-index'),
      letter('b', 'left-index'),
      letter('n', 'right-index'),
      letter('m', 'right-index'),
      digit(',', 'right-middle'),
      digit('.', 'right-ring'),
      digit('/', 'right-pinky'),
      modifier('ShiftRight', 'Shift', 2.75, 'right-pinky'),
    ],
  },
  {
    id: 'space',
    keys: [
      modifier('ControlLeft', 'Ctrl', 1.25, 'left-pinky'),
      modifier('MetaLeft', 'Win', 1.25, 'left-pinky'),
      modifier('AltLeft', 'Alt', 1.25, 'left-thumb'),
      modifier('Space', '空格', 6.25, 'right-thumb'),
      modifier('AltRight', 'Alt', 1.25, 'right-thumb'),
      modifier('Fn', 'Fn', 1.25),
      modifier('MetaRight', '菜单', 1.25, 'right-pinky'),
      modifier('ControlRight', 'Ctrl', 1.25, 'right-pinky'),
    ],
  },
]

const fingerByKey = new Map<string, FingerId>()
for (const row of keyRows)
  for (const item of row.keys)
    if (item.finger && item.key.length === 1) fingerByKey.set(item.key.toLowerCase(), item.finger)

/** 返回某个字符应由哪根手指输入；修饰键用固定名称单独判断。 */
export function fingerForKey(key: string): FingerId | undefined {
  if (!key) return undefined
  if (key === ' ') return 'right-thumb'
  return fingerByKey.get(key.toLowerCase())
}

export function fingerName(key: string) {
  const finger = fingerForKey(key)
  if (!finger) return ''
  if (key === ' ') return '左右手拇指都可以按空格'
  return fingerInfo[finger].name
}

export function fingerColor(key: string) {
  const finger = fingerForKey(key)
  return finger ? fingerInfo[finger].color : undefined
}

/** 字母、数字和分号等可练字符，供指法关卡与测试核对覆盖范围。 */
export function practiceCharacters() {
  return [...fingerByKey.keys()]
}

export function isLetterKey(key: string) {
  return /^[a-z]$/i.test(key)
}
