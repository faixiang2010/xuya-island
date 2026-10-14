export interface Lesson {
  id: string
  number: number
  title: string
  subtitle: string
  mission: string
  starterCode: string
  goals: string[]
  hints: string[]
  previewType: 'cover' | 'drawing'
  version: string
  phaseId: string
  track: 'core' | 'extension'
  prerequisites: string[]
  minutes: number
  explanation: string
  prediction: string
  creation: string
  quickChallenge: string
  commonErrors: string[]
  parentPrompt: string
  reflectionPrompts: string[]
  exercises: Exercise[]
  rubric: string[]
  exampleInput: string[]
}

export interface Exercise {
  id: string
  title: string
  instruction: string
  referenceCode: string
  tests: ExerciseCase[]
}
export interface ExerciseCase {
  name: string
  input: string[]
  outputContains: string[]
  minDrawings: number
  expectedFiles: string[]
}
export interface Phase {
  id: string
  title: string
  track: 'core' | 'extension'
  project: string
  description: string
}
export interface Curriculum {
  version: string
  phases: Phase[]
  lessons: Lesson[]
}
export interface Progress {
  lessonId: string
  lessonVersion: string
  status: 'not-started' | 'in-progress' | 'completed' | 'needs-review'
  hintLevel: number
  referenceViewed: boolean
  reflection: string
  parentObservation: string
  updatedAt: string
}
export interface VirtualFile {
  name: string
  content: string
}

export interface Work {
  id: string
  lessonId: string
  title: string
  code: string
  revision: number
  createdAt: string
  updatedAt: string
}

export interface Draft {
  workId?: string
  revision: number
  title: string
  code: string
  dirty: boolean
}

export interface Drawing {
  kind: 'circle' | 'rectangle' | 'text'
  x: number
  y: number
  radius?: number
  width?: number
  height?: number
  text?: string
  color: string
}

export interface RunResult {
  runId: string
  status: 'success' | 'error' | 'stopped' | 'timeout'
  output: string
  error: string
  durationMs: number
  drawings: Drawing[]
  outputTruncated: boolean
  inputs?: string[]
  files?: VirtualFile[]
  stageEvents?: StageEvent[]
  stageState?: StageState
}

export interface StageEvent {
  kind: 'cup' | 'pour' | 'lid' | 'pearls' | 'drink' | 'say' | 'actor' | 'move' | 'size' | 'counter'
  amount?: number
  value?: string | number
  actor?: string
  text?: string
  x?: number
  y?: number
}

export interface StageActor {
  kind: 'monster' | 'robot' | 'cat' | 'ghost'
  x: number
  y: number
  size: number
  text: string
}

export interface StageState {
  cupOpen: boolean
  filled: number
  spilled: number
  pearls: number
  drinks: number
  flavour: string
  lastSpeech: string
  actors: Record<string, StageActor>
  counters: Record<string, number>
}

export interface TutorStatus {
  configured: boolean
  provider: string
  model: string
  protocol: string
}
