/** In-memory drafts survive Codex tabs; no source or credentials are sent to localStorage. */
export interface WorkspaceDraft {
  path: string
  content: string
  original: string
  hash: string
  directory: string
}
export const workspaceDrafts = new Map<string, WorkspaceDraft>()
