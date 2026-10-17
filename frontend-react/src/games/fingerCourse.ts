/** 指法学院：每关只引入一组新键，旧键在后续关卡继续出现。 */
export const fingerLevels = [
  {
    id: 'home',
    title: '1 · 家位 ASDF JKL;',
    version: 1,
    goal: '左手放 ASDF，右手放 JKL;，食指摸到 F 和 J 的凸点。',
    discovery: '每次按完别的键，都让手指回到这八个家位，下一次就不用低头找。',
    tasks: ['f', 'j', 'd', 'k', 's', 'l', 'a', ';', 'g', 'h'].map((target) => ({ target })),
  },
  {
    id: 'top',
    title: '2 · 上排 QWERTY',
    version: 1,
    goal: '从家位向上伸手指，按完立刻回到 ASDF JKL;。',
    discovery: '上排由小指、无名指、中指和食指分工，左右手各管一半。',
    tasks: ['e', 'i', 'r', 'u', 't', 'y', 'q', 'p', 'w', 'o'].map((target) => ({ target })),
  },
  {
    id: 'bottom',
    title: '3 · 下排 ZXCVBNM',
    version: 1,
    goal: '从家位向下伸手指，注意左右手的食指负责 V B 和 N M。',
    discovery: '下排最容易整只手跑偏；手指动，手掌尽量留在原处。',
    tasks: ['v', 'n', 'c', 'm', 'x', ',', 'z', '.', 'b', '/'].map((target) => ({ target })),
  },
  {
    id: 'numbers',
    title: '4 · 数字行',
    version: 1,
    goal: '从家位向上伸到数字行，左右手各管五个数字。',
    discovery: '数字 1 和 0 由小指负责，4、5 和 6、7 由两侧食指负责。',
    tasks: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((target) => ({ target })),
  },
  {
    id: 'shift',
    title: '5 · Shift 大写',
    version: 1,
    goal: '用小指按住另一侧的 Shift，再按字母键，打出大写。',
    discovery: '左手打字母时用右 Shift，右手打字母时用左 Shift，两只手不会挤在一起。',
    tasks: ['F', 'J', 'A', 'S', 'K', 'L', 'H', 'D', 'G', 'Q'].map((target) => ({ target })),
  },
  {
    id: 'words',
    title: '6 · 全键盘短词',
    version: 1,
    goal: '把家位、上排、下排和 Shift 合起来，打出常用短词。',
    discovery: '盲打不是背位置，而是让每根手指记住自己负责的那一列。',
    tasks: ['the', 'and', 'you', 'for', 'cat', 'dog', 'home', 'jump', 'quiz', 'milk'].map(
      (target) => ({ target }),
    ),
  },
]
