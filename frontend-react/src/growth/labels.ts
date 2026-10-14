import { typingGames } from '../games/content'

const phases: Record<string, string> = {
  story: '故事表达与程序顺序',
  interactive: '互动选择与条件',
  art: '数据与生成艺术',
  game: '游戏规则与任务拆分',
  detective: '数据和文件探索',
  studio: '自由创作与调试',
}
export function knowledgeTitle(id: string) {
  const [module, level] = id.split(':', 2)
  if (module === 'keyboard' || module === 'pinyin')
    return (
      typingGames[module].levels
        .find((item) => item.id === level)
        ?.title.replace(/^\d+\s*·\s*/, '') ?? '输入练习'
    )
  if (module === 'python') return phases[level] ?? '编程探索'
  if (module === 'story') return level || '故事实验'
  return id
}
