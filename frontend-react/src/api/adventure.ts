import { request } from './client'

export interface AdventureEpisode {
  id: string
  number: number
  chapterId: string
  title: string
  subtitle: string
  hook: string
  mission: string
  concept: string
  starterCode: string
  referenceCode: string
  hints: string[]
  prediction: string
  remixes: { title: string; description: string }[]
  transfer: string
  dialogue: { speaker: string; text: string }[]
  exampleInput: string[]
  scene: string
  checks: {
    name: string
    input: string[]
    expectedState: Record<string, string | number | boolean>
  }[]
  minutes: number
}

export interface AdventureCurriculum {
  version: string
  chapters: { id: string; title: string; description: string }[]
  episodes: AdventureEpisode[]
}

type ObjectValue = Record<string, unknown>
const object = (value: unknown): value is ObjectValue =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

export function isAdventureEpisode(value: unknown): value is AdventureEpisode {
  if (!object(value)) return false
  return (
    [
      'id',
      'chapterId',
      'title',
      'subtitle',
      'hook',
      'mission',
      'concept',
      'starterCode',
      'referenceCode',
      'prediction',
      'transfer',
      'scene',
    ].every((key) => typeof value[key] === 'string') &&
    Number.isSafeInteger(value.number) &&
    Number(value.number) > 0 &&
    Number.isSafeInteger(value.minutes) &&
    Number(value.minutes) > 0 &&
    strings(value.hints) &&
    value.hints.length === 3 &&
    strings(value.exampleInput) &&
    Array.isArray(value.remixes) &&
    value.remixes.length >= 2 &&
    value.remixes.every(
      (item) =>
        object(item) && typeof item.title === 'string' && typeof item.description === 'string',
    ) &&
    Array.isArray(value.dialogue) &&
    value.dialogue.length > 0 &&
    value.dialogue.every(
      (item) => object(item) && typeof item.speaker === 'string' && typeof item.text === 'string',
    ) &&
    Array.isArray(value.checks) &&
    value.checks.length > 0 &&
    value.checks.every(
      (item) =>
        object(item) &&
        typeof item.name === 'string' &&
        strings(item.input) &&
        object(item.expectedState) &&
        Object.keys(item.expectedState).length > 0 &&
        Object.values(item.expectedState).every(
          (state) =>
            typeof state === 'string' ||
            typeof state === 'boolean' ||
            (typeof state === 'number' && Number.isFinite(state)),
        ),
    )
  )
}

export async function getAdventure(): Promise<AdventureCurriculum> {
  const value = await request<unknown>('/adventure')
  if (
    !object(value) ||
    value.version !== 'absurd-town-1.0' ||
    !Array.isArray(value.chapters) ||
    !value.chapters.every(
      (item) =>
        object(item) &&
        ['id', 'title', 'description'].every((key) => typeof item[key] === 'string'),
    ) ||
    !Array.isArray(value.episodes) ||
    !value.episodes.every(isAdventureEpisode)
  )
    throw new Error('小镇目录格式不正确，请重新启动本地服务。')
  return value as unknown as AdventureCurriculum
}

export async function getEpisode(id: string): Promise<AdventureEpisode> {
  const value = await request<unknown>(`/adventure/episodes/${encodeURIComponent(id)}`)
  if (!isAdventureEpisode(value)) throw new Error('这集故事的数据格式不正确，草稿仍保留着。')
  return value
}

/** 只检查真实执行的场景状态；通过不等同于孩子掌握或原创。 */
export function matchesScene(
  status: string,
  state: unknown,
  expected: Record<string, string | number | boolean>,
): boolean {
  return (
    status === 'success' &&
    object(state) &&
    Object.entries(expected).every(([key, value]) => state[key] === value)
  )
}

export function readAdventureDraft(
  storage: Pick<Storage, 'getItem'>,
  id: string,
): string | undefined {
  try {
    const value: unknown = JSON.parse(
      storage.getItem(`xuya:adventure:absurd-town-1.0:${id}`) ?? 'null',
    )
    return object(value) &&
      typeof value.code === 'string' &&
      new TextEncoder().encode(value.code).length <= 65536
      ? value.code
      : undefined
  } catch {
    return undefined
  }
}
