import type { Drawing, RunResult } from '../types'
import { deriveStageState, readStageEvents } from './stage'

const coordinate = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 10000
const color = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)

export const safeVirtualPath = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= 240 &&
  value.split('/').length <= 4 &&
  value
    .split('/')
    .every(
      (part) => /^[\w\u4e00-\u9fff. -]{1,80}$/.test(part) && part !== '.' && !part.includes('..'),
    )

/** 执行域消息视为不可信数据；只渲染有限的文字和画笔指令。 */
export function safeDrawing(value: unknown): Drawing | undefined {
  if (!value || typeof value !== 'object') return
  const draw = value as Drawing
  if (!coordinate(draw.x) || !coordinate(draw.y) || !color(draw.color)) return
  if (draw.kind === 'circle' && coordinate(draw.radius) && draw.radius >= 0 && draw.radius <= 2000)
    return { kind: draw.kind, x: draw.x, y: draw.y, radius: draw.radius, color: draw.color }
  if (
    draw.kind === 'rectangle' &&
    coordinate(draw.width) &&
    coordinate(draw.height) &&
    draw.width >= 0 &&
    draw.height >= 0
  )
    return {
      kind: draw.kind,
      x: draw.x,
      y: draw.y,
      width: draw.width,
      height: draw.height,
      color: draw.color,
    }
  if (draw.kind === 'text' && typeof draw.text === 'string')
    return {
      kind: draw.kind,
      x: draw.x,
      y: draw.y,
      text: draw.text.slice(0, 200),
      color: draw.color,
    }
}

export function readResult(value: unknown, runId: string): RunResult | undefined {
  if (!value || typeof value !== 'object') return
  const message = value as Record<string, unknown>
  if (
    message.runId !== runId ||
    !['success', 'error', 'stopped', 'timeout'].includes(String(message.status))
  )
    return
  if (typeof message.output !== 'string' || typeof message.error !== 'string') return
  const stageEvents = readStageEvents(message.stageEvents)
  const files: NonNullable<RunResult['files']> = []
  const names = new Set<string>()
  let totalBytes = 0
  if (Array.isArray(message.files)) {
    for (const file of message.files.slice(0, 32)) {
      if (
        !file ||
        !safeVirtualPath(file.name) ||
        typeof file.content !== 'string' ||
        names.has(file.name)
      )
        continue
      const bytes = new TextEncoder().encode(file.content).length
      if (bytes > 65536 || totalBytes + bytes > 524288) continue
      files.push({ name: file.name, content: file.content })
      names.add(file.name)
      totalBytes += bytes
    }
  }
  return {
    runId,
    status: message.status as RunResult['status'],
    output: message.output.slice(0, 20000),
    error: message.error.slice(0, 20000),
    durationMs:
      typeof message.durationMs === 'number' && Number.isFinite(message.durationMs)
        ? Math.min(600000, Math.max(0, Math.round(message.durationMs)))
        : 0,
    drawings: Array.isArray(message.drawings)
      ? message.drawings
          .slice(0, 5000)
          .map(safeDrawing)
          .filter((item): item is Drawing => !!item)
      : [],
    outputTruncated: message.outputTruncated === true,
    stageEvents,
    stageState: deriveStageState(stageEvents),
    inputs: Array.isArray(message.inputs)
      ? message.inputs
          .filter((item): item is string => typeof item === 'string')
          .slice(0, 50)
          .map((item) => item.slice(0, 4096))
      : [],
    files,
  }
}
