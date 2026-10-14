/** 家庭成长页面使用的真实接口投影，不推断未保存的表现。 */
export interface Completion {
  awarded: number
  summary: { firstCorrect: number; total: number; accuracy: number }
  awards: { reason: string; points: number; notice: string }[]
}
export interface ActivitySpecification {
  title?: string
  completion?: Completion
}
export interface LearningSession {
  id: string
  module: string
  activity_id: string
  status: string
  started_at: string
  content_version: string
  specification: string | ActivitySpecification
}
export interface Skill {
  knowledgeId: string
  state: string
  evidenceCount: number
  independentCount: number
  notice: string
}
export interface Reward {
  id: string
  title: string
  description: string
  cost: number
  stock: number
  enabled: boolean
  revision: number
}
export interface Redemption {
  id: string
  title: string
  cost: number
  status: string
  created_at: string
  revision: number
}
export interface LearningReport extends Record<string, unknown> {
  period: string
  conclusion: string
  completed: number
  unfinished: number
  learningCount: number
  helpSources: string[]
  timingNotice: string
  consolidate: Skill[]
}
export interface Dashboard {
  learner: { id: string; nickname: string }
  sessions: LearningSession[]
  skills: Skill[]
  reviews: { knowledge_id: string; next_at: string; module: string; activity_id: string }[]
  balance: { balance: number; frozen: number }
  ledger: { id: string; reason: string; delta: number; frozen_delta: number }[]
  redemptions: Redemption[]
  report: LearningReport
  savedRuns: { id: string; lesson_id: string; status: string; source: string; gmt_create: string }[]
}
export function specification(row: LearningSession): ActivitySpecification {
  try {
    const value: unknown =
      typeof row.specification === 'string' ? JSON.parse(row.specification) : row.specification
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as ActivitySpecification)
      : {}
  } catch {
    return {}
  }
}
/** 只链接已知活动类型，不把服务端内容当作任意URL。 */
export function activityPath(
  row: Pick<LearningSession, 'module' | 'activity_id'>,
): string | undefined {
  if (row.module === 'typing') {
    const [game, level, ...extra] = row.activity_id.split(':')
    if (['keyboard', 'pinyin'].includes(game) && level && !extra.length)
      return `/games/${game}?level=${encodeURIComponent(level)}`
  }
  if (['classroom', 'adventure'].includes(row.module) && /^[a-zA-Z0-9_-]+$/.test(row.activity_id))
    return `/${row.module}/${row.activity_id}`
  return undefined
}
export const activityStatuses: Record<string, string> = {
  active: '正在探索',
  paused: '等你继续',
  completed: '已经完成',
  ended: '留下了一次尝试',
  pending: '等待家人确认',
  approved: '已批准，等待兑现',
  fulfilled: '已经兑现',
  rejected: '家人暂未同意',
  cancelled: '已取消',
  refunded: '积分已退回',
}
