import { accountStorage } from '../account/session'
import { create } from 'zustand'

export type LearningTheme = 'detective' | 'painting' | 'piano'
export const learningThemes = {
  detective: {
    title: '粉色侦探社',
    invitation: '找到藏在小岛里的下一条线索',
    delivery: '线索送到事务所啦',
    mission: '线索档案',
    achievement: '你找到了新的线索',
    prompt: '哪一张线索让你多看了一眼？你怎么发现它的？',
  },
  painting: {
    title: '云朵绘画馆',
    invitation: '给今天的灵感添上一种颜色',
    delivery: '灵感送到绘画馆啦',
    mission: '灵感卡片',
    achievement: '你的灵感又多了一点',
    prompt: '如果把这个发现画出来，你会用什么颜色？',
  },
  piano: {
    title: '星光琴房',
    invitation: '让每一个小发现组成一段旋律',
    delivery: '音符送到琴房啦',
    mission: '旋律片段',
    achievement: '这段旋律由你完成',
    prompt: '这次想用轻快还是安静的旋律表达你的发现？',
  },
} as const
export const preferenceKey = 'xuya:learning-preferences:v1'
interface Preferences {
  theme: LearningTheme
  sound: boolean
  motion: boolean
  cacheAvailable: boolean
  hydrate: () => void
  update: (value: Partial<Pick<Preferences, 'theme' | 'sound' | 'motion'>>) => void
}
export const useLearningPreferences = create<Preferences>((set, get) => ({
  theme: 'detective',
  sound: false,
  motion: true,
  cacheAvailable: true,
  hydrate: () => {
    try {
      const payload = accountStorage.getItem(preferenceKey)
      let raw
      try {
        raw = JSON.parse(payload ?? 'null')
      } catch {
        set({ cacheAvailable: true })
        return
      }
      if (!raw || raw.version !== 1) return
      set({
        theme: Object.hasOwn(learningThemes, raw.theme) ? raw.theme : 'detective',
        sound: raw.sound === true,
        motion: raw.motion !== false,
        cacheAvailable: true,
      })
    } catch {
      set({ cacheAvailable: false })
    }
  },
  update: (value) => {
    const next = { theme: get().theme, sound: get().sound, motion: get().motion, ...value }
    let cacheAvailable = true
    try {
      accountStorage.setItem(preferenceKey, JSON.stringify({ version: 1, ...next }))
    } catch {
      cacheAvailable = false
    }
    set({ ...next, cacheAvailable })
  },
}))
