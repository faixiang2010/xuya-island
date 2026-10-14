export type GameId = 'keyboard' | 'pinyin'
export interface TypingTask {
  target: string
  pinyin?: string
}
export interface GameLevel {
  id: string
  title: string
  version: number
  goal: string
  discovery: string
  tasks: TypingTask[]
}
export interface TypingGame {
  id: GameId
  title: string
  description: string
  instruction: string
  levels: GameLevel[]
}
const letterOrder = [...'fjasdghklqwertyuiopzxcvbnm']
const cards = (targets: string[]): TypingTask[] => targets.map((target) => ({ target }))
const chinese = (pairs: [string, string][]): TypingTask[] =>
  pairs.map(([target, pinyin]) => ({ target, pinyin }))
export const missionSize = 6
export const typingGames: Record<GameId, TypingGame> = {
  keyboard: {
    id: 'keyboard',
    title: '字母数字小站',
    description: '从小写到大写，破解藏在字母和数字里的线索。',
    instruction: '照着目标输入，大小写要一致。打对会自动送达，不用点确认；打错可以退格修改。',
    levels: [
      {
        id: 'letters',
        title: '1 · 小写字母',
        version: 1,
        goal: '英文模式输入小写，认识键位。',
        discovery: '键盘上印着大写字母，英文模式下通常先打出小写。',
        tasks: cards(letterOrder),
      },
      {
        id: 'uppercase',
        title: '2 · 大写字母',
        version: 1,
        goal: '按住 Shift，再按字母键，练习大写。',
        discovery: '按住 Shift + 字母可以打出大写；松开 Shift 后回到小写。',
        tasks: cards(letterOrder.map((letter) => letter.toUpperCase())),
      },
      {
        id: 'case-switch',
        title: '3 · 大小写切换',
        version: 1,
        goal: '分清 a 和 A，试着一小一大交替输入。',
        discovery: 'a 和 A 是同一个字母的不同写法。程序和密码常常要区分它们。',
        tasks: cards(['a', 'A', 'f', 'F', 'j', 'J', 'm', 'M', 's', 'S', 'z', 'Z']),
      },
      {
        id: 'numbers',
        title: '4 · 数字线索',
        version: 1,
        goal: '找到数字行，先不用 Shift。',
        discovery: '输入这些数字不需要按住 Shift；按 Shift 可能变成符号。',
        tasks: cards(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']),
      },
      {
        id: 'mixed',
        title: '5 · 混合密码',
        version: 2,
        goal: '把大小写和数字组合起来，逐位看清楚。',
        discovery: '输入组合时要逐位核对，Ab3 与 ab3 并不相同。',
        tasks: cards(['a1', 'A1', 'b2', 'B2', 'Ab3', 'aB4', 'Fj5', 'Jf6']),
      },
    ],
  },
  pinyin: {
    id: 'pinyin',
    title: '拼音汉字小站',
    description: '用拼音寻找汉字，把你的中文点子送进故事里。',
    instruction: '切换到中文拼音输入法，输入拼音并选出汉字。选字完成后自动送达，途中不会判错。',
    levels: [
      {
        id: 'characters',
        title: '1 · 一个汉字',
        version: 1,
        goal: '输入拼音，在候选里选出目标汉字。',
        discovery: '同一个拼音可能有多个汉字，选字时还要看清意思。',
        tasks: chinese([
          ['山', 'shan'],
          ['水', 'shui'],
          ['日', 'ri'],
          ['月', 'yue'],
          ['人', 'ren'],
          ['大', 'da'],
          ['小', 'xiao'],
          ['天', 'tian'],
        ]),
      },
      {
        id: 'words',
        title: '2 · 词语朋友',
        version: 1,
        goal: '连着输入词语的拼音，再选出完整词语。',
        discovery: '词语可以一起输入，选好词语后再继续下一段。',
        tasks: chinese([
          ['你好', 'ni hao'],
          ['小鸟', 'xiao niao'],
          ['白云', 'bai yun'],
          ['太阳', 'tai yang'],
          ['月亮', 'yue liang'],
          ['开心', 'kai xin'],
          ['朋友', 'peng you'],
          ['故事', 'gu shi'],
        ]),
      },
      {
        id: 'sentences',
        title: '3 · 写一句话',
        version: 1,
        goal: '把短句写完整，中途选字也没关系。',
        discovery: '一句话可以分几次选字，程序会等你把目标短句写完整。',
        tasks: chinese([
          ['你好朋友', 'ni hao peng you'],
          ['小鸟飞上天', 'xiao niao fei shang tian'],
          ['我喜欢故事', 'wo xi huan gu shi'],
          ['今天真开心', 'jin tian zhen kai xin'],
        ]),
      },
    ],
  },
}
export type TypingState = 'empty' | 'partial' | 'correct' | 'case' | 'invalid' | 'mismatch'
export function checkTyping(
  gameId: GameId,
  target: string,
  input: string,
): { correct: boolean; state: TypingState; message: string } {
  const answer = gameId === 'pinyin' ? input.trim() : input
  if (!answer)
    return { correct: false, state: 'empty', message: '点一下输入框，开始寻找第一条线索。' }
  if (gameId === 'keyboard' && !/^[a-z0-9]+$/i.test(answer))
    return {
      correct: false,
      state: 'invalid',
      message: '这里只练字母和数字。请切换到英文输入，再试一次。',
    }
  if (gameId === 'pinyin' && /^[a-z\s']+$/i.test(answer))
    return {
      correct: false,
      state: 'invalid',
      message: '拼音写好了！请用中文拼音输入法选出汉字，就会自动送达。',
    }
  if (answer === target)
    return { correct: true, state: 'correct', message: '线索找到了，正在送达！' }
  if (target.startsWith(answer))
    return { correct: false, state: 'partial', message: '这一段对了，接着输入后面的内容。' }
  if (gameId === 'keyboard') {
    const position = [...answer].findIndex((letter, index) => letter !== target[index])
    const expected = target[position]
    if (
      expected &&
      answer[position]?.toLowerCase() === expected.toLowerCase() &&
      /[a-z]/i.test(expected)
    ) {
      const uppercase = expected === expected.toUpperCase()
      return {
        correct: false,
        state: 'case',
        message: uppercase
          ? '这里需要大写 ' + expected + '。按住 Shift 再按字母键，或用 Caps Lock 切换。'
          : '这里需要小写 ' + expected + '。松开 Shift，并看看 Caps Lock 是否打开。',
      }
    }
  }
  return {
    correct: false,
    state: 'mismatch',
    message: '有一位和线索不同，看看目标，用退格修改就好。',
  }
}
export function nextRequiredCharacter(target: string, answer: string) {
  const mismatch = [...answer].findIndex((letter, index) => letter !== target[index])
  return target[Math.min(mismatch < 0 ? answer.length : mismatch, target.length - 1)]
}
