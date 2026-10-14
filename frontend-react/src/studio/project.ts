import type { ProjectFile, StudioDraft, StudioProject, StudioRunResult } from '../studio-types'
import type { RunResult } from '../types'

export function validFiles(value: unknown): value is ProjectFile[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) return false
  const paths = new Set<string>()
  let bytes = 0
  for (const file of value) {
    if (
      !file ||
      typeof file.path !== 'string' ||
      typeof file.content !== 'string' ||
      file.path.length > 240 ||
      file.path.includes('..') ||
      file.path.split('/').length > 4 ||
      file.path
        .split('/')
        .some((part: string) => part === '.' || !/^[\w\u4e00-\u9fff. -]{1,80}$/.test(part)) ||
      paths.has(file.path)
    )
      return false
    paths.add(file.path)
    const size = new TextEncoder().encode(file.content).length
    if (size > 65536) return false
    bytes += size
  }
  return paths.has('main.py') && bytes <= 524288
}

export const copyFiles = (files: ProjectFile[]) => files.map((file) => ({ ...file }))
export function sameFiles(left: ProjectFile[], right: ProjectFile[]): boolean {
  return (
    left.length === right.length &&
    left.every((file) =>
      right.some((other) => other.path === file.path && other.content === file.content),
    )
  )
}
export function draftKey(id: string) {
  return `xuya:studio:draft:${id}`
}
export function readStudioDraft(
  storage: Pick<Storage, 'getItem'>,
  id: string,
): StudioDraft | undefined {
  try {
    const value = JSON.parse(storage.getItem(draftKey(id)) ?? 'null')
    if (
      !value ||
      typeof value.title !== 'string' ||
      !Number.isSafeInteger(value.revision) ||
      value.revision < 1 ||
      !validFiles(value.files)
    )
      return
    return value
  } catch {
    return
  }
}
export function writeStudioDraft(
  storage: Pick<Storage, 'setItem'>,
  id: string,
  draft: StudioDraft,
): boolean {
  try {
    storage.setItem(draftKey(id), JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}
export function candidateDiff(project: Pick<StudioProject, 'files'>, files: ProjectFile[]) {
  const paths = [...new Set([...project.files.map((f) => f.path), ...files.map((f) => f.path)])]
  return paths.flatMap((path) => {
    const before = project.files.find((f) => f.path === path)?.content
    const after = files.find((f) => f.path === path)?.content
    if (before === after) return []
    return [
      {
        path,
        before: before ?? '',
        after: after ?? '',
        kind: before === undefined ? 'added' : after === undefined ? 'removed' : 'changed',
      },
    ]
  })
}
export function studioResult(result: RunResult): StudioRunResult {
  return {
    runId: result.runId,
    status: result.status,
    output: result.output,
    error: result.error,
    durationMs: result.durationMs,
    drawings: result.drawings,
    files: result.files ?? [],
    inputs: result.inputs ?? [],
    stageEvents: ('stageEvents' in result ? result.stageEvents : []) ?? [],
    stageState: (('stageState' in result ? result.stageState : {}) ?? {}) as Record<
      string,
      unknown
    >,
  }
}
