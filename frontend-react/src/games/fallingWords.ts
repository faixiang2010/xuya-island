/** 字母雨/词雨：五档难度共用一份词库，速度和生成间隔逐档提升。 */
export interface FallingDifficulty {
  id: string
  title: string
  version: number
  goal: string
  discovery: string
  words: string[]
  spawnMs: number
  fallSeconds: number
  target: number
  durationSeconds: number
}

export const fallingDifficulties: FallingDifficulty[] = [
  {
    id: 'letters',
    title: '1 · 单字母雨',
    version: 1,
    goal: '字母慢慢落下，按对应键把它击落。',
    discovery: '先看落得最低的字母，输入正确后再抬头找下一个。',
    words: [...'fjasdghklqwertyuiopzxcvbnm'],
    spawnMs: 1900,
    fallSeconds: 9,
    target: 12,
    durationSeconds: 75,
  },
  {
    id: 'short-words',
    title: '2 · 三字母词',
    version: 1,
    goal: '短词开始落下，连续输入完整单词才能击落。',
    discovery: '输入首字母后，游戏会锁定最靠近底部的一个词，不用自己选目标。',
    words: [
      'the',
      'and',
      'you',
      'for',
      'cat',
      'dog',
      'run',
      'sun',
      'map',
      'red',
      'big',
      'hat',
      'pen',
      'box',
      'cup',
      'key',
      'top',
      'bus',
      'bed',
      'six',
    ],
    spawnMs: 1700,
    fallSeconds: 8,
    target: 15,
    durationSeconds: 80,
  },
  {
    id: 'pep-six',
    title: '3 · 六年级英语词',
    version: 1,
    goal: '练习 PEP 六年级常见单词，手指要在全键盘上移动。',
    discovery: '长单词不要一个字母一个字母找，先把它读成一整段再输入。',
    words: [
      'cinema',
      'hospital',
      'crossing',
      'subway',
      'plane',
      'train',
      'slow',
      'stop',
      'wait',
      'tomorrow',
      'lesson',
      'dinner',
      'hobby',
      'dancing',
      'singing',
      'reading',
      'factory',
      'postman',
      'pilot',
      'coach',
      'angry',
      'afraid',
      'sad',
      'worried',
      'happy',
    ],
    spawnMs: 1500,
    fallSeconds: 7,
    target: 18,
    durationSeconds: 90,
  },
  {
    id: 'long-words',
    title: '4 · 长单词',
    version: 1,
    goal: '更长的单词掉落更快，保持准确比抢速度重要。',
    discovery: '打错一个字母时先用退格改掉，不要硬着头皮继续输入。',
    words: [
      'museum',
      'bookstore',
      'dictionary',
      'comic',
      'science',
      'straight',
      'restaurant',
      'supermarket',
      'businessman',
      'fisherman',
      'scientist',
      'university',
      'together',
      'different',
      'important',
      'exercise',
    ],
    spawnMs: 1350,
    fallSeconds: 6.5,
    target: 20,
    durationSeconds: 95,
  },
  {
    id: 'mixed',
    title: '5 · 综合快打',
    version: 1,
    goal: '单词更密、更快，练习在压力下保持准确。',
    discovery: '准确率高于 95% 时速度会逐步加快，低于 85% 时会自动放慢。',
    words: [
      'weekend',
      'countryside',
      'football',
      'basketball',
      'kungfu',
      'hiking',
      'camping',
      'cycling',
      'swimming',
      'dancing',
      'studying',
      'working',
      'fishing',
      'painting',
      'reading',
      'singing',
    ],
    spawnMs: 1100,
    fallSeconds: 5.5,
    target: 22,
    durationSeconds: 100,
  },
]

export function fallingDifficulty(id: string) {
  return fallingDifficulties.find((item) => item.id === id) ?? fallingDifficulties[0]
}

export function fallingLevels() {
  return fallingDifficulties.map(({ id, title, version, goal, discovery }) => ({
    id,
    title,
    version,
    goal,
    discovery,
    tasks: [{ target: id }],
  }))
}
