import { type GameId } from './content'

export interface GameCategory {
  id: string
  title: string
  note: string
  ids: GameId[]
}

/** 游戏中心分类导航；新增游戏必须归入其中一类，见 categories.test.ts。 */
export const gameCategories: GameCategory[] = [
  {
    id: 'typing',
    title: '打字练习',
    note: '从认识键盘到十指盲打，再让单词从天上落下来。',
    ids: ['keyboard', 'pinyin', 'finger', 'falling'],
  },
  {
    id: 'reading',
    title: '课文阅读',
    note: '语文和英语分开练习，只保留 200–500 字长篇课文。',
    ids: ['passage', 'passage-en'],
  },
  {
    id: 'thinking',
    title: '动脑挑战',
    note: '经典玩法加上原创小游戏，练反应，也练规划。',
    ids: ['tetris', 'minesweeper', 'echo', 'wind'],
  },
  {
    id: 'creative',
    title: '音乐与画笔',
    note: '听旋律、记画面，用声音和颜色玩一会儿。',
    ids: ['melody', 'piano', 'mirror', 'memory'],
  },
  {
    id: 'fun',
    title: '趣味小站',
    note: '换个主题打打字、猜猜谜，轻松一下。',
    ids: ['style', 'quiz'],
  },
]

/** 卡片上的小标签：同类卡片不再重复同一个分类说明。 */
export const gameTags: Record<GameId, string> = {
  keyboard: '字母 · 数字',
  pinyin: '440 词 · 逐课',
  finger: '十指 · 盲打',
  falling: '单词雨 · 反应',
  passage: '六年级 · 语文部编版',
  'passage-en': '六年级 · 英语 PEP',
  tetris: '方块 · 规划',
  minesweeper: '推理 · 标记',
  echo: '记忆 · 回声',
  wind: '路径 · 风向',
  melody: '听音 · 跟唱',
  piano: '琴键 · 记忆',
  mirror: '对称 · 绘画',
  memory: '观察 · 复现',
  style: '造型 · 拼音',
  quiz: '问答 · 谜题',
}
