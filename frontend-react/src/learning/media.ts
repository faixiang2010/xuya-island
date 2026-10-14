export type LearningMediaId = 'keyboard' | 'pinyin' | 'program'
export const learningMedia = {
  keyboard: {
    title: '大小写怎样切换',
    duration: '12 秒',
    file: 'case-switch',
    transcript: [
      '英文模式下，按 A 键通常输入小写 a。',
      '按住 Shift，再按 A，得到大写 A；松开 Shift 后回到小写。',
      '目标是 A 时，输入 a 需要修正，大小写必须一致。',
      'Caps Lock 可以切换持续大写；回到小写时再关掉它。',
    ],
  },
  pinyin: {
    title: '拼音怎样变成汉字',
    duration: '12 秒',
    file: 'pinyin-entry',
    transcript: [
      '先切换到设备上的中文拼音输入法。',
      '输入 shan，在候选中选择“山”。',
      '选字过程中页面会等待，不急着判断对错。',
      '选好的“山”进入输入框后，正确答案自动送达。候选界面因输入法而异。',
    ],
  },
  program: {
    title: '改一个名字，看看程序的变化',
    duration: '15 秒',
    file: 'first-program',
    transcript: [
      '先运行 print("月光森林")，观察输出“月光森林”。',
      '只把引号里的故事名改成“云朵邮局”，保留英文引号和括号。',
      '再次运行，输出跟着变成“云朵邮局”。',
      '猜一个新变化，改一处，再观察。参考不会代替你自己的版本。',
    ],
  },
} as const
