import { create } from 'zustand'

/** 一次庆祝反馈：徽章解锁、练完一级。 */
export type CelebrationKind = 'badge' | 'level'

export interface CelebrationItem {
  id: string
  kind: CelebrationKind
  title: string
  detail?: string
}

/** 同时最多排队的庆祝数量，避免连续触发时刷屏。 */
const queueLimit = 4

interface CelebrationState {
  queue: CelebrationItem[]
  celebrate: (item: Omit<CelebrationItem, 'id'> & { id?: string }) => void
  dismiss: (id: string) => void
  clear: () => void
}

let counter = 0

export const useCelebration = create<CelebrationState>((set) => ({
  queue: [],
  celebrate: (item) =>
    set((state) => {
      const next: CelebrationItem = {
        id: item.id ?? `celebration-${Date.now()}-${counter++}`,
        kind: item.kind,
        title: item.title,
        detail: item.detail,
      }
      if (state.queue.some((entry) => entry.id === next.id)) return state
      return { queue: [...state.queue, next].slice(-queueLimit) }
    }),
  dismiss: (id) => set((state) => ({ queue: state.queue.filter((entry) => entry.id !== id) })),
  clear: () => set({ queue: [] }),
}))

/** 页面代码使用的简写，避免每次手写 kind。 */
export function celebrate(item: Omit<CelebrationItem, 'id'> & { id?: string }) {
  useCelebration.getState().celebrate(item)
}
