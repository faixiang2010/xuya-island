import type { Draft } from '../types'

export function readDraft(storage: Pick<Storage, 'getItem'>, lessonId: string): Draft | undefined {
  try {
    const value = JSON.parse(storage.getItem(`xuya:draft:${lessonId}`) ?? 'null')
    if (
      !value ||
      typeof value.code !== 'string' ||
      typeof value.title !== 'string' ||
      typeof value.dirty !== 'boolean' ||
      !Number.isInteger(value.revision) ||
      value.revision < 0 ||
      (value.workId !== undefined && typeof value.workId !== 'string')
    )
      return undefined
    return value
  } catch {
    return undefined
  }
}

export function writeDraft(
  storage: Pick<Storage, 'setItem'>,
  lessonId: string,
  draft: Draft,
): boolean {
  try {
    storage.setItem(`xuya:draft:${lessonId}`, JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}
