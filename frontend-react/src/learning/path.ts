import type { Lesson, Progress } from '../types'

export const phaseSkills: Record<string, string> = {
  story: '让程序说话',
  interactive: '让故事做选择',
  art: '用循环画画',
  game: '做自己的小游戏',
  detective: '数据小侦探',
  studio: '自由创作',
}

export function lessonStatus(lesson: Lesson, progress: Progress[]) {
  return (
    progress.find((item) => item.lessonId === lesson.id && item.lessonVersion === lesson.version)
      ?.status ?? 'not-started'
  )
}

export function nextLesson(lessons: Lesson[], progress: Progress[]) {
  const main = lessons
    .filter((lesson) => lesson.number > 0 && lesson.track === 'core')
    .sort((a, b) => a.number - b.number)
  return (
    main.find((lesson) => lessonStatus(lesson, progress) === 'needs-review') ??
    main.find((lesson) => lessonStatus(lesson, progress) !== 'completed')
  )
}
