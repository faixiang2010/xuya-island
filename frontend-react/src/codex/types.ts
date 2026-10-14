import type { components as AgentComponents } from './generated/agent-v1'
import type { components as CodexComponents } from './generated/codex-v1'
import type { paths as CodexPaths } from './generated/codex-v1'

/** 真实 OpenAPI 是传输 DTO 来源；视图模型只补足本地选择/展示字段。 */
export type AgentSchemas = AgentComponents['schemas']
export type CodexSchemas = CodexComponents['schemas']
export type WorkspaceCreateRequest =
  CodexPaths['/api/v1/codex/projects/{id}/workspaces']['post']['requestBody']['content']['application/json']

export type PermissionMode = 'ask' | 'auto' | 'full'
export type RunStatus =
  'queued' | 'running' | 'waiting' | 'completed' | 'cancelled' | 'failed' | 'interrupted'
export interface ModelProfile {
  id: string
  name: string
  provider: string
  reasoningEfforts: string[]
  vision: boolean
  audio: boolean
  configured: boolean
}
export interface Capabilities {
  agentId: string
  configured: boolean
  models: ModelProfile[]
  features: Record<string, boolean | string | Record<string, unknown>>
  defaults: { permissionMode: PermissionMode; maxTokens: number; maxActiveMs: number }
  protocols: string[]
}
export interface Project {
  id: string
  name: string
  path: string
  mode: 'worktree' | 'isolated-copy'
  createdAt?: string
  workspaces?: Workspace[]
}
export interface Workspace {
  id: string
  projectId: string
  path: string
  mode: string
  environment: string
  baseRef?: string
  sourceRevision?: string
  status?: string
  [key: string]: unknown
}
export interface Conversation extends Omit<
  Required<AgentSchemas['Conversation']>,
  'modelId' | 'reasoningEffort' | 'permissionMode'
> {
  modelId?: string
  reasoningEffort?: string
  permissionMode: PermissionMode
}
export interface Attachment {
  id: string
  name: string
  mimeType: string
  size?: number
  relativePath?: string
  url?: string
  previewUrl?: string
}
export interface Message {
  id: string
  role: string
  content: string
  attachments?: Attachment[]
}
export interface Execution {
  executionId: string
  status: string
  [key: string]: unknown
}
export interface Interaction {
  id: string
  kind: string
  toolCallId?: string
  toolName?: string
  arguments?: unknown
  responseSchema?: Record<string, unknown>
  message?: string
  [key: string]: unknown
}
export interface PlanStep {
  id: string
  title: string
  status: string
}
export interface Plan {
  title: string
  steps: PlanStep[]
}
export interface Goal {
  id: string
  conversationId: string
  title: string
  status: string
  maxTokens?: number
  maxActiveMs?: number
  [key: string]: unknown
}
export interface Automation {
  id: string
  conversationId: string
  name: string
  prompt: string
  intervalMinutes: number
  enabled: boolean
  nextRunAt?: string
  [key: string]: unknown
}
export interface Snapshot {
  conversation: Conversation
  cursor: string
  messages: Message[]
  runs: Execution[]
  pendingInteractions: Interaction[]
  usage: { tokens: number; activeMs: number }
  goals: Goal[]
  plan?: Plan
  artifacts?: ResourceRecord[]
  sources?: ResourceRecord[]
  subagents?: ResourceRecord[]
}
export interface ResourceRecord {
  id: string
  name?: string
  title?: string
  type?: string
  status?: string
  path?: string
  url?: string
  content?: string
  [key: string]: unknown
}
export interface ToolActivity {
  id: string
  name: string
  arguments: string
  output: string
  status: string
}
export interface StreamEvent {
  id?: string
  event?: string
  data: Record<string, unknown>
}
export const sections = [
  { id: 'workbench', label: '编码工作台' },
  { id: 'projects', label: '项目与工作区' },
  { id: 'tasks', label: '任务与目标' },
  { id: 'changes', label: '变更审阅' },
  { id: 'agents', label: '智能体协作' },
  { id: 'plugins', label: '技能与插件' },
  { id: 'outputs', label: '输出与来源' },
  { id: 'memory', label: '记忆与上下文' },
  { id: 'automations', label: '自动化' },
  { id: 'settings', label: '设置与观测' },
] as const
export const permissionLabels: Record<PermissionMode, string> = {
  ask: '请我批准',
  auto: '帮我批准',
  full: '完全访问权限',
}
