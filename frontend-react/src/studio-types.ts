import type { Drawing, RunResult } from './types'

export interface ProjectFile {
  path: string
  content: string
}
export interface ProjectPreferences {
  favoriteThemes: string[]
  humor: string
}
export interface StudioProject {
  id: string
  title: string
  scene: 'milk-tea' | 'free'
  lessonId: string | null
  sourceWorkId: string | null
  revision: number
  files: ProjectFile[]
  preferences: ProjectPreferences
  createdAt: string
  updatedAt: string
}
export interface ProjectVersion {
  revision: number
  title: string
  files: ProjectFile[]
  preferences: ProjectPreferences
  createdAt: string
}
export interface StudioCandidate {
  id: string
  projectId: string
  baseRevision: number
  files: ProjectFile[]
  explanation: string
  status: 'pending' | 'applied' | 'rejected'
  appliedRevision: number | null
  createdAt: string
}
export type StudioIntent = 'think' | 'edit' | 'build'
export interface StudySession {
  id: string
  projectId: string
  scene: 'milk-tea' | 'free'
  lessonId: string | null
  mode: 'lesson' | 'studio'
  createdAt: string
}
export interface StudioTask {
  commandId: string
  turnId: string
  runId: string | null
  error: string | null
  status:
    | 'queued'
    | 'starting'
    | 'running'
    | 'completed'
    | 'suspended'
    | 'interrupted'
    | 'failed'
    | 'cancelled'
}
export interface PendingRun {
  requestId: string
  toolCallId: string
  candidateId: string
  executionId: string | null
  status: 'waiting-runner' | 'running' | 'completed' | 'unknown'
  files: ProjectFile[]
}
export interface StudioSnapshot {
  capability?: 'auto' | 'tools' | 'text'
  session: StudySession
  cursor: number
  messages: { id: string; role: 'user' | 'assistant'; text: string }[]
  tasks: StudioTask[]
  candidates: StudioCandidate[]
  pendingRuns: PendingRun[]
  budget: {
    modelCalls: number
    activeMs: number
    repairAttempts: number
    limitCalls: number
    limitActiveMs: number
    limitRepairs: number
  }
}
export interface StudioRunResult {
  runId: string
  status: RunResult['status']
  output: string
  error: string
  durationMs: number
  drawings: Drawing[]
  files: { name: string; content: string }[]
  inputs: string[]
  stageEvents: unknown[]
  stageState: Record<string, unknown>
}
export interface RunExecution {
  id: string
  requestId: string
  candidateId: string
  status: 'running' | 'completed' | 'unknown'
  files: ProjectFile[]
  result: StudioRunResult | null
}
export interface StudioDraft {
  title: string
  revision: number
  files: ProjectFile[]
}
