import { fallingLevels } from './fallingWords.ts'
import { fingerLevels } from './fingerCourse.ts'
import { passageLevels } from './passages.ts'
import { sixthGradeWordGroups } from './chineseWords.ts'

export type GameId =
  | 'keyboard'
  | 'pinyin'
  | 'finger'
  | 'falling'
  | 'passage'
  | 'passage-en'
  | 'style'
  | 'quiz'
  | 'tetris'
  | 'minesweeper'
  | 'echo'
  | 'wind'
  | 'melody'
  | 'piano'
  | 'mirror'
  | 'memory'
export type GameInput = 'keyboard' | 'pinyin'
export type GameKind =
  | 'typing'
  | 'choice'
  | 'falling'
  | 'passage'
  | 'tetris'
  | 'minesweeper'
  | 'echo'
  | 'wind'
  | 'melody'
  | 'piano'
  | 'mirror'
  | 'memory'
export type GameIcon =
  | 'keyboard'
  | 'pinyin'
  | 'hand'
  | 'meteor'
  | 'palette'
  | 'gamepad'
  | 'book'
  | 'blocks'
  | 'bomb'
  | 'radar'
  | 'wind'
  | 'music'
  | 'piano'
  | 'brush'
  | 'images'
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
const arcadeLevels = (
  items: { id: string; title: string; goal: string; discovery: string }[],
): GameLevel[] => items.map((item) => ({ ...item, version: 1, tasks: [] }))
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
              '客人实在太多了',
              '它把“继续做早餐”听成了“永远别停”',
              '老板不让它休息',
              '它自己睡着了',
            ],
          },
          {
            prompt: '奶茶店的第一杯奶茶为什么堆成了一座山？',
            answer: '机器人把“加一点”做成了“无限加”',
            options: [
              '店员不小心打翻了杯子',
              '杯子自己破了',
              '奶茶太好喝停不下来',
              '机器人把“加一点”做成了“无限加”',
            ],
          },
          {
            prompt: '咕噜老板最爱说的口头禅是？',
            answer: '“多到忘掉烦恼”',
            options: ['“少一点更好”', '“今天不营业”', '“多到忘掉烦恼”', '“我也不会做”'],
          },
          {
            prompt: '小奇猜错的时候会怎么做？',
            answer: '大方承认自己猜错了',
            options: ['大方承认自己猜错了', '假装没有猜错', '责怪别人', '再也不说话'],
          },
          {
            prompt: '离谱小镇的机器为什么会做出离谱的事？',
            answer: '它们把愿望理解成了夸张的规则',
            options: ['它们故意捣乱', '它们没电了', '它们把愿望理解成了夸张的规则', '它们想偷懒'],
          },
          {
            prompt: '墨点被冤枉后，它靠什么帮自己？',
            answer: '继续找证据',
            options: ['大声哭闹', '继续找证据', '躲起来不见人', '随便怪别人'],
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
            options: ['一条小鱼', '一朵花', '一颗小石头', '一根羽毛'],
          },
          {
            prompt: '猫咪慢慢朝你眨眼，通常表示什么？',
            answer: '它喜欢你、很放松',
            options: ['它喜欢你、很放松', '它困了想睡觉', '它生气了', '它肚子饿了'],
          },
          {
            prompt: '章鱼一共有几颗心脏？',
            answer: '三颗',
            options: ['一颗', '两颗', '五颗', '三颗'],
          },
          {
            prompt: '海獭睡觉时有个习惯是什么？',
            answer: '手拉手，防止漂散',
            options: ['沉到海底', '手拉手，防止漂散', '睁着眼睛睡', '躲进洞里'],
          },
          {
            prompt: '蜜蜂会用舞蹈告诉同伴什么？',
            answer: '花在哪里',
            options: ['花在哪里', '天气怎么样', '谁最大', '今天吃什么'],
          },
          {
            prompt: '猫头鹰能把头转动大约多少度？',
            answer: '270 度',
            options: ['90 度', '180 度', '360 度', '270 度'],
          },
        ]),
      },
      {
        id: 'riddles',
        title: '3 · 脑筋急转弯',
        version: 1,
        goal: '动动脑筋，猜出藏在字面背后的答案。',
        discovery: '有些问题不能只看字面意思，换个角度想就通了。',
        tasks: quiz([
          {
            prompt: '什么门永远关不上？',
            answer: '球门',
            options: ['大门', '校门', '房门', '球门'],
          },
          {
            prompt: '什么东西越洗越脏？',
            answer: '水',
            options: ['手', '水', '衣服', '碗'],
          },
          {
            prompt: '什么马不会跑？',
            answer: '木马',
            options: ['木马', '白马', '斑马', '小马'],
          },
          {
            prompt: '什么东西有牙齿，却咬不动东西？',
            answer: '梳子',
            options: ['老虎', '狗', '梳子', '剪刀'],
          },
          {
            prompt: '什么杯子不能装水？',
            answer: '奖杯',
            options: ['水杯', '奖杯', '茶杯', '咖啡杯'],
          },
          {
            prompt: '谜语：一个小姑娘，坐在水中央，身穿粉红衫，坐在绿船上。这是什么？',
            answer: '荷花',
            options: ['荷叶', '小船', '荷花', '蝴蝶'],
          },
        ]),
      },
    ],
  },
  tetris: {
    id: 'tetris',
    title: '俄罗斯方块',
    description: '把不同形状的方块拼成整行，别让方块堆到顶端。',
    instruction: '左右键移动，上键旋转，下键加速，空格直接落下；拼满一行就会消除。',
    kind: 'tetris',
    input: 'keyboard',
    icon: 'blocks',
    badgeTitle: '方块建筑师',
    levels: arcadeLevels([
      {
        id: 'calm',
        title: '1 · 慢慢堆',
        goal: '消掉 5 行，熟悉移动和旋转。',
        discovery: '先想好落点，再用空格让方块快速落下。',
      },
      {
        id: 'steady',
        title: '2 · 稳稳放',
        goal: '消掉 10 行，保持场地整齐。',
        discovery: '给下一块留出平整的位置，比一次消很多行更重要。',
      },
      {
        id: 'swift',
        title: '3 · 快快消',
        goal: '消掉 15 行，方块会落得更快。',
        discovery: '贴着墙放可以减少空隙，速度越快越要提前判断。',
      },
    ]),
  },
  minesweeper: {
    id: 'minesweeper',
    title: '扫雷小岛',
    description: '根据数字提示找出所有地雷，第一次点击一定安全。',
    instruction: '左键翻开格子，右键插旗；数字表示周围八格的地雷数量。',
    kind: 'minesweeper',
    input: 'keyboard',
    icon: 'bomb',
    badgeTitle: '拆雷小侦探',
    levels: arcadeLevels([
      {
        id: 'beach',
        title: '1 · 小沙滩',
        goal: '在 9×9 的沙滩上找出 10 颗地雷。',
        discovery: '数字是周围八格的地雷数，先翻开大片安全区。',
      },
      {
        id: 'reef',
        title: '2 · 礁石区',
        goal: '在 12×12 的礁石区找出 24 颗地雷。',
        discovery: '两个数字相减，可以推断出夹在中间的格子。',
      },
      {
        id: 'trench',
        title: '3 · 深海沟',
        goal: '在 16×16 的深海沟找出 40 颗地雷。',
        discovery: '不确定时先插旗标记，再回头验证。',
      },
    ]),
  },
  echo: {
    id: 'echo',
    title: '回声迷宫',
    description: '迷宫一片漆黑，靠声波照亮墙壁，记住路线走到出口。',
    instruction: '方向键移动，空格发出声波；声波次数有限，出口在角落闪着光。',
    kind: 'echo',
    input: 'keyboard',
    icon: 'radar',
    badgeTitle: '回声领航员',
    levels: arcadeLevels([
      {
        id: 'cave',
        title: '1 · 浅洞',
        goal: '在 9×9 的黑暗迷宫里找到出口。',
        discovery: '声波会照亮附近两格，先照清周围再决定方向。',
      },
      {
        id: 'grotto',
        title: '2 · 回声洞',
        goal: '在 11×11 的迷宫里找到出口。',
        discovery: '记住已经照亮的墙，别在同一条死路浪费声波。',
      },
      {
        id: 'abyss',
        title: '3 · 无光深渊',
        goal: '在 13×13 的迷宫里找到出口。',
        discovery: '沿着墙走更容易记住路线，出口总在角落。',
      },
    ]),
  },
  wind: {
    id: 'wind',
    title: '风向邮差',
    description: '给叶子排好风向指令，让它绕过礁石把信送到邮筒。',
    instruction: '点空格子放置风向，再点“放叶子”；叶子会按箭头一步步前进。',
    kind: 'wind',
    input: 'keyboard',
    icon: 'wind',
    badgeTitle: '风向指挥官',
    levels: arcadeLevels([
      {
        id: 'breeze',
        title: '1 · 微风',
        goal: '用 6 个风向把叶子送到邮筒。',
        discovery: '先把整条路线想好，再一次性放好箭头。',
      },
      {
        id: 'gale',
        title: '2 · 海风',
        goal: '绕过礁石，用 9 个风向完成任务。',
        discovery: '箭头可以重复使用，拐弯处要提前转向。',
      },
      {
        id: 'storm',
        title: '3 · 风暴',
        goal: '收集信件后再到邮筒，风向数量有限。',
        discovery: '先经过信件，再去邮筒，顺序错了就得重来。',
      },
    ]),
  },
  melody: {
    id: 'melody',
    title: '音符小径',
    description: '在音符格子上走出一条小路，按顺序弹出目标旋律。',
    instruction: '从起点出发，点相邻格子移动；每走一步会响一个音，走错可以重来。',
    kind: 'melody',
    input: 'keyboard',
    icon: 'music',
    badgeTitle: '小岛作曲家',
    levels: arcadeLevels([
      {
        id: 'first',
        title: '1 · 三音小调',
        goal: '在 4×4 格子上连出 4 个音。',
        discovery: '每个格子都有自己的音高，路线就是旋律。',
      },
      {
        id: 'climb',
        title: '2 · 爬音阶',
        goal: '在 5×5 格子上连出 5 个音。',
        discovery: '目标旋律会标出音名，先找第一个音再往前推。',
      },
      {
        id: 'song',
        title: '3 · 小岛之歌',
        goal: '在 6×6 格子上连出 6 个音。',
        discovery: '同一条路线不能重复走，必要时绕一个弯。',
      },
    ]),
  },
  piano: {
    id: 'piano',
    title: '记忆琴房',
    description: '听小岛弹一段旋律，再凭记忆在琴键上弹回来。',
    instruction: '点“听一遍”播放旋律；听完后按顺序点琴键，弹对会进入下一轮。',
    kind: 'piano',
    input: 'keyboard',
    icon: 'piano',
    badgeTitle: '记忆琴师',
    levels: arcadeLevels([
      {
        id: 'short',
        title: '1 · 短旋律',
        goal: '记住并弹回 4 个音。',
        discovery: '旋律每次多一个音，先记住开头两个音。',
      },
      {
        id: 'long',
        title: '2 · 长旋律',
        goal: '记住并弹回 6 个音。',
        discovery: '可以把旋律分成两小段来记。',
      },
      {
        id: 'song',
        title: '3 · 完整歌',
        goal: '记住并弹回 8 个音。',
        discovery: '琴键从左到右越来越高，音高会帮你找回顺序。',
      },
    ]),
  },
  mirror: {
    id: 'mirror',
    title: '镜像画室',
    description: '左半边已经画好，把右半边补成对称的图案。',
    instruction: '选一种颜色，点右半边的格子作画；画完点“检查画作”。',
    kind: 'mirror',
    input: 'keyboard',
    icon: 'brush',
    badgeTitle: '对称小画家',
    levels: arcadeLevels([
      {
        id: 'heart',
        title: '1 · 爱心',
        goal: '在 8×8 画布上补完爱心。',
        discovery: '左右对称时，第 1 列对应最后 1 列。',
      },
      {
        id: 'flower',
        title: '2 · 小花',
        goal: '在 10×10 画布上补完小花。',
        discovery: '先数清每一行左边有几个色块，再补右边。',
      },
      {
        id: 'fish',
        title: '3 · 小鱼',
        goal: '在 12×12 画布上补完小鱼。',
        discovery: '颜色也要对称，不只是位置对称。',
      },
    ]),
  },
  memory: {
    id: 'memory',
    title: '记忆画廊',
    description: '看几秒小岛的画，再凭记忆把它重新画出来。',
    instruction: '先点“看画”记住颜色和位置；画消失后用调色板重画，再点“检查”。',
    kind: 'memory',
    input: 'keyboard',
    icon: 'images',
    badgeTitle: '记忆收藏家',
    levels: arcadeLevels([
      {
        id: 'card',
        title: '1 · 明信片',
        goal: '记住 6×6 的明信片图案。',
        discovery: '先记大色块的位置，再补小角落。',
      },
      {
        id: 'poster',
        title: '2 · 海报',
        goal: '记住 8×8 的海报图案。',
        discovery: '把画面分成四块，一块一块记。',
      },
      {
        id: 'gallery',
        title: '3 · 画廊',
        goal: '记住 10×10 的画廊作品。',
        discovery: '颜色变多时，先记每种颜色出现的位置。',
      },
    ]),
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
