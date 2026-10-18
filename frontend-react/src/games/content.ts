import { fallingLevels } from './fallingWords.ts'
import { fingerLevels } from './fingerCourse.ts'
import { passageLevels } from './passages.ts'
import { sixthGradeWordGroups } from './chineseWords.ts'

export type GameId =
  'keyboard' | 'pinyin' | 'finger' | 'falling' | 'passage' | 'passage-en' | 'style' | 'quiz'
export type GameInput = 'keyboard' | 'pinyin'
export type GameKind = 'typing' | 'choice' | 'falling' | 'passage'
export type GameIcon = 'keyboard' | 'pinyin' | 'hand' | 'meteor' | 'palette' | 'gamepad' | 'book'
export interface TypingTask {
  target: string
  pinyin?: string
  prompt?: string
  options?: string[]
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
  kind: GameKind
  input: GameInput
  icon: GameIcon
  badgeTitle: string
  levels: GameLevel[]
}
const letterOrder = [...'fjasdghklqwertyuiopzxcvbnm']
const cards = (targets: string[]): TypingTask[] => targets.map((target) => ({ target }))
const chinese = (pairs: [string, string][]): TypingTask[] =>
  pairs.map(([target, pinyin]) => ({ target, pinyin }))
const quiz = (items: { prompt: string; answer: string; options: string[] }[]): TypingTask[] =>
  items.map(({ prompt, answer, options }) => ({ target: answer, prompt, options }))
export const missionSize = 6
export const typingGames: Record<GameId, TypingGame> = {
  keyboard: {
    id: 'keyboard',
    title: '字母数字小站',
    description: '从小写到大写，破解藏在字母和数字里的线索。',
    instruction: '照着目标输入，大小写要一致。打对会自动送达，不用点确认；打错可以退格修改。',
    kind: 'typing',
    input: 'keyboard',
    icon: 'keyboard',
    badgeTitle: '键盘小达人',
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
    description: '部编版六年级上下册全部“看拼音写词语”，共 440 个词语逐课练习。',
    instruction:
      '切换到中文拼音输入法，按课文顺序输入六年级上下册全部词语的拼音并选出汉字。选字完成后自动送达，途中不会判错。',
    kind: 'typing',
    input: 'pinyin',
    icon: 'pinyin',
    badgeTitle: '拼音小达人',
    levels: [
      ...sixthGradeWordGroups.map((group) => ({
        id: group.id,
        title: group.title,
        version: 3,
        goal: `${group.lessons}的看拼音写词语，共 ${group.words.length} 个。`,
        discovery: '同一个拼音可能对应多个汉字，先看清词语再选字；长词可以分几次选字。',
        tasks: chinese(group.words),
      })),
      {
        id: 'sentences',
        title: '5 · 六年级句子',
        version: 3,
        goal: '把六年级课文里的短句写完整，中途选字也没关系。',
        discovery: '句子可以分几次选字，程序会等你把目标句子写完整。',
        tasks: chinese([
          ['草原上空气清鲜', 'cao yuan shang kong qi qing xian'],
          ['我们只有一个地球', 'wo men zhi you yi ge di qiu'],
          ['少年闰土聪明能干', 'shao nian run tu cong ming neng gan'],
          ['夏天是万物生长的季节', 'xia tian shi wan wu sheng zhang de ji jie'],
          ['北京的春节真热闹', 'bei jing de chun jie zhen re nao'],
        ]),
      },
    ],
  },
  finger: {
    id: 'finger',
    title: '指法学院',
    description: '十根手指各管一片区域，从家位开始学会不看键盘。',
    instruction:
      '把左手放在 ASDF，右手放在 JKL;。看亮起的键和手指提示，按完让手指回到原位；熟练后可以打开盲打模式。',
    kind: 'typing',
    input: 'keyboard',
    icon: 'hand',
    badgeTitle: '指法毕业生',
    levels: fingerLevels,
  },
  falling: {
    id: 'falling',
    title: '字母雨 · 词雨',
    description: 'PEP 六年级上下册的单词和短语从天上落下，输入正确就能把它们击落。',
    instruction:
      '输入落得最低的词或短语，空格、连字符和点号直接敲；打对会自动击落，漏掉会扣一格护盾。先保证准确，再慢慢加快。',
    kind: 'falling',
    input: 'keyboard',
    icon: 'meteor',
    badgeTitle: '词雨守护者',
    levels: fallingLevels(),
  },
  passage: {
    id: 'passage',
    title: '语文课文',
    description: '用六年级语文长篇课文练习整段输入。',
    instruction:
      '选一篇语文长篇课文，一段一段照着输入。中文直接使用拼音输入法，选好汉字后继续；整段完成后自动进入下一段。',
    kind: 'passage',
    input: 'keyboard',
    icon: 'book',
    badgeTitle: '课文打字员',
    levels: passageLevels('zh'),
  },
  'passage-en': {
    id: 'passage-en',
    title: '英语课文',
    description: '用 PEP 六年级英语长文练习整段输入。',
    instruction: '选一篇英语长篇课文，一段一段照着输入。英文直接敲键盘，打完整段会自动进入下一段。',
    kind: 'passage',
    input: 'keyboard',
    icon: 'book',
    badgeTitle: '英语课文打字员',
    levels: passageLevels('en'),
  },
  style: {
    id: 'style',
    title: '星座造型小站',
    description: '输入星座和搭配灵感，点亮你的专属造型。',
    instruction: '切换到中文拼音输入法，输入拼音并选出汉字。选字完成后自动送达，途中不会判错。',
    kind: 'typing',
    input: 'pinyin',
    icon: 'palette',
    badgeTitle: '造型小达人',
    levels: [
      {
        id: 'stars',
        title: '1 · 认识星座',
        version: 1,
        goal: '输入星座名，认识十二星座。',
        discovery: '星座名由两个字加“座”组成，拼音连起来输入再选字。',
        tasks: chinese([
          ['白羊座', 'bai yang zuo'],
          ['金牛座', 'jin niu zuo'],
          ['双子座', 'shuang zi zuo'],
          ['巨蟹座', 'ju xie zuo'],
          ['狮子座', 'shi zi zuo'],
          ['处女座', 'chu nv zuo'],
          ['天蝎座', 'tian xie zuo'],
          ['双鱼座', 'shuang yu zuo'],
        ]),
      },
      {
        id: 'colors',
        title: '2 · 造型颜色',
        version: 1,
        goal: '输入颜色词，为造型挑一个主色。',
        discovery: '颜色词常由两个汉字组成，拼音连起来输入更快。',
        tasks: chinese([
          ['樱花粉', 'ying hua fen'],
          ['天空蓝', 'tian kong lan'],
          ['薄荷绿', 'bo he lv'],
          ['柠檬黄', 'ning meng huang'],
          ['奶茶色', 'nai cha se'],
          ['香芋紫', 'xiang yu zi'],
          ['月光白', 'yue guang bai'],
          ['星星金', 'xing xing jin'],
        ]),
      },
      {
        id: 'accessories',
        title: '3 · 配饰单品',
        version: 1,
        goal: '输入配饰名，凑齐今天的搭配。',
        discovery: '配饰名有长有短，可以分几次选字，不必一次打完。',
        tasks: chinese([
          ['蝴蝶结', 'hu die jie'],
          ['珍珠发夹', 'zhen zhu fa jia'],
          ['星星耳环', 'xing xing er huan'],
          ['月亮项链', 'yue liang xiang lian'],
          ['花朵手链', 'hua duo shou lian'],
          ['云朵包', 'yun duo bao'],
        ]),
      },
      {
        id: 'outfit',
        title: '4 · 我的造型',
        version: 1,
        goal: '写一句造型宣言，完成今天的搭配。',
        discovery: '一句话分几次选字也没关系，程序会等你写完。',
        tasks: chinese([
          ['我喜欢蝴蝶结', 'wo xi huan hu die jie'],
          ['今天穿樱花粉', 'jin tian chuan ying hua fen'],
          ['配一颗星星', 'pei yi ke xing xing'],
          ['云朵包真好看', 'yun duo bao zhen hao kan'],
        ]),
      },
    ],
  },
  quiz: {
    id: 'quiz',
    title: '离谱小镇猜猜看',
    description: '读一读小镇里的怪点子，选出你觉得对的答案。',
    instruction: '读题目，点一个选项。答对自动进入下一题，答错可以再选，不扣分。',
    kind: 'choice',
    input: 'pinyin',
    icon: 'gamepad',
    badgeTitle: '猜谜小达人',
    levels: [
      {
        id: 'town',
        title: '1 · 小镇怪事',
        version: 1,
        goal: '读一读离谱小镇里的怪事，选出对的答案。',
        discovery: '很多“离谱”的结果，都来自机器把一句话理解错了。',
        tasks: quiz([
          {
            prompt: '早餐机为什么宣布永不下班？',
            answer: '它把“继续做早餐”听成了“永远别停”',
            options: [
              '它把“继续做早餐”听成了“永远别停”',
              '客人实在太多了',
              '老板不让它休息',
              '它自己睡着了',
            ],
          },
          {
            prompt: '奶茶店的第一杯奶茶为什么堆成了一座山？',
            answer: '机器人把“加一点”做成了“无限加”',
            options: [
              '机器人把“加一点”做成了“无限加”',
              '店员不小心打翻了杯子',
              '杯子自己破了',
              '奶茶太好喝停不下来',
            ],
          },
          {
            prompt: '咕噜老板最爱说的口头禅是？',
            answer: '“多到忘掉烦恼”',
            options: ['“多到忘掉烦恼”', '“少一点更好”', '“今天不营业”', '“我也不会做”'],
          },
          {
            prompt: '小奇猜错的时候会怎么做？',
            answer: '大方承认自己猜错了',
            options: ['大方承认自己猜错了', '假装没有猜错', '责怪别人', '再也不说话'],
          },
          {
            prompt: '离谱小镇的机器为什么会做出离谱的事？',
            answer: '它们把愿望理解成了夸张的规则',
            options: ['它们把愿望理解成了夸张的规则', '它们故意捣乱', '它们没电了', '它们想偷懒'],
          },
          {
            prompt: '墨点被冤枉后，它靠什么帮自己？',
            answer: '继续找证据',
            options: ['继续找证据', '大声哭闹', '躲起来不见人', '随便怪别人'],
          },
        ]),
      },
      {
        id: 'animals',
        title: '2 · 动物小侦探',
        version: 1,
        goal: '猜一猜动物们的冷知识。',
        discovery: '很多动物都有让人意想不到的小本领。',
        tasks: quiz([
          {
            prompt: '企鹅“求婚”的时候，会送什么礼物？',
            answer: '一颗小石头',
            options: ['一颗小石头', '一条小鱼', '一朵花', '一根羽毛'],
          },
          {
            prompt: '猫咪慢慢朝你眨眼，通常表示什么？',
            answer: '它喜欢你、很放松',
            options: ['它喜欢你、很放松', '它困了想睡觉', '它生气了', '它肚子饿了'],
          },
          {
            prompt: '章鱼一共有几颗心脏？',
            answer: '三颗',
            options: ['三颗', '一颗', '两颗', '五颗'],
          },
          {
            prompt: '海獭睡觉时有个习惯是什么？',
            answer: '手拉手，防止漂散',
            options: ['手拉手，防止漂散', '沉到海底', '睁着眼睛睡', '躲进洞里'],
          },
          {
            prompt: '蜜蜂会用舞蹈告诉同伴什么？',
            answer: '花在哪里',
            options: ['花在哪里', '天气怎么样', '谁最大', '今天吃什么'],
          },
          {
            prompt: '猫头鹰能把头转动大约多少度？',
            answer: '270 度',
            options: ['270 度', '90 度', '180 度', '360 度'],
          },
        ]),
      },
      {
        id: 'stars',
        title: '3 · 星座小侦探',
        version: 1,
        goal: '认识十二星座的小标志。',
        discovery: '每个星座都有自己独特的标志和故事。',
        tasks: quiz([
          {
            prompt: '狮子座的标志是什么？',
            answer: '狮子',
            options: ['狮子', '老虎', '小猫', '豹子'],
          },
          {
            prompt: '双鱼座的样子是？',
            answer: '两条鱼连在一起',
            options: ['两条鱼连在一起', '一只大鲸鱼', '一条会飞的鱼', '一只海豚'],
          },
          {
            prompt: '射手座的标志武器是？',
            answer: '弓箭',
            options: ['弓箭', '长剑', '盾牌', '流星锤'],
          },
          {
            prompt: '双子座代表什么？',
            answer: '一对双胞胎',
            options: ['一对双胞胎', '两颗星星', '两座山', '两条路'],
          },
          {
            prompt: '水瓶座的标志是？',
            answer: '一个倒水的水瓶',
            options: ['一个倒水的水瓶', '一个水杯', '一片大海', '一朵浪花'],
          },
          {
            prompt: '天秤座的标志是？',
            answer: '一把天平',
            options: ['一把天平', '一个钟表', '一把钥匙', '一面镜子'],
          },
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
  const mode = typingGames[gameId].input
  const answer = mode === 'pinyin' ? input.trim() : input
  if (!answer)
    return { correct: false, state: 'empty', message: '点一下输入框，开始寻找第一条线索。' }
  if (
    mode === 'keyboard' &&
    !(gameId === 'finger' ? /^[a-z0-9;,./-]+$/i : /^[a-z0-9]+$/i).test(answer)
  )
    return {
      correct: false,
      state: 'invalid',
      message:
        gameId === 'finger'
          ? '这里练习字母、数字和常用符号。请切换到英文输入，再试一次。'
          : '这里只练字母和数字。请切换到英文输入，再试一次。',
    }
  if (mode === 'pinyin' && /^[a-z\s']+$/i.test(answer))
    return {
      correct: false,
      state: 'invalid',
      message: '拼音写好了！请用中文拼音输入法选出汉字，就会自动送达。',
    }
  if (answer === target)
    return { correct: true, state: 'correct', message: '线索找到了，正在送达！' }
  if (target.startsWith(answer))
    return { correct: false, state: 'partial', message: '这一段对了，接着输入后面的内容。' }
  if (mode === 'keyboard') {
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
export function checkChoice(
  target: string,
  answer: string,
): { correct: boolean; state: TypingState; message: string } {
  if (!answer) return { correct: false, state: 'empty', message: '点一个你觉得对的选项。' }
  if (answer === target) return { correct: true, state: 'correct', message: '答对啦，正在送达！' }
  return { correct: false, state: 'mismatch', message: '再想想，试试另一个选项。' }
}
export function nextRequiredCharacter(target: string, answer: string) {
  const mismatch = [...answer].findIndex((letter, index) => letter !== target[index])
  return target[Math.min(mismatch < 0 ? answer.length : mismatch, target.length - 1)]
}
