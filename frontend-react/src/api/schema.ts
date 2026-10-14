/** API 数据在进入 store 之前校验；类型参数本身不提供运行时保护。 */
type ObjectValue = Record<string, unknown>
const object = (v: unknown): v is ObjectValue => !!v && typeof v === 'object' && !Array.isArray(v)
const string = (v: unknown): v is string => typeof v === 'string'
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(string)
const integer = (v: unknown) => Number.isSafeInteger(v)
function lesson(v: unknown): boolean {
  if (!object(v)) return false
  return (
    [
      'id',
      'title',
      'subtitle',
      'mission',
      'starterCode',
      'version',
      'phaseId',
      'explanation',
      'prediction',
      'creation',
      'quickChallenge',
      'parentPrompt',
    ].every((k) => string(v[k])) &&
    integer(v.number) &&
    integer(v.minutes) &&
    ['core', 'extension'].includes(String(v.track)) &&
    ['cover', 'drawing'].includes(String(v.previewType)) &&
    [
      'goals',
      'hints',
      'prerequisites',
      'commonErrors',
      'reflectionPrompts',
      'rubric',
      'exampleInput',
    ].every((k) => strings(v[k])) &&
    Array.isArray(v.exercises) &&
    v.exercises.length > 0 &&
    v.exercises.every(
      (ex) =>
        object(ex) &&
        ['id', 'title', 'instruction', 'referenceCode'].every((k) => string(ex[k])) &&
        Array.isArray(ex.tests) &&
        ex.tests.length > 0 &&
        ex.tests.every(
          (t) =>
            object(t) &&
            string(t.name) &&
            strings(t.input) &&
            strings(t.outputContains) &&
            integer(t.minDrawings) &&
            strings(t.expectedFiles),
        ),
    )
  )
}
function work(v: unknown): boolean {
  return (
    object(v) &&
    ['id', 'lessonId', 'title', 'code', 'createdAt', 'updatedAt'].every((k) => string(v[k])) &&
    integer(v.revision)
  )
}
function progress(v: unknown): boolean {
  return (
    object(v) &&
    ['lessonId', 'lessonVersion', 'reflection', 'parentObservation', 'updatedAt'].every((k) =>
      string(v[k]),
    ) &&
    ['not-started', 'in-progress', 'completed', 'needs-review'].includes(String(v.status)) &&
    integer(v.hintLevel) &&
    Number(v.hintLevel) >= 0 &&
    Number(v.hintLevel) <= 3 &&
    typeof v.referenceViewed === 'boolean'
  )
}
export function validResponse(url: string, value: unknown): boolean {
  const path = url.split('?')[0]
  if (path === '/lessons') return Array.isArray(value) && value.every(lesson)
  if (path.startsWith('/lessons/')) return lesson(value)
  if (path === '/curriculum')
    return (
      object(value) &&
      string(value.version) &&
      Array.isArray(value.lessons) &&
      value.lessons.every(lesson) &&
      Array.isArray(value.phases) &&
      value.phases.every(
        (p) =>
          object(p) &&
          ['id', 'title', 'project', 'description'].every((k) => string(p[k])) &&
          ['core', 'extension'].includes(String(p.track)),
      )
    )
  if (path === '/works') return Array.isArray(value) ? value.every(work) : work(value)
  if (path.startsWith('/works/')) return work(value)
  if (path === '/progress') return Array.isArray(value) && value.every(progress)
  if (path.startsWith('/progress/')) return progress(value)
  if (path === '/tutor/ask') return object(value) && string(value.answer)
  if (path === '/tutor/status')
    return (
      object(value) &&
      typeof value.configured === 'boolean' &&
      ['provider', 'model', 'protocol'].every((k) => string(value[k]))
    )
  if (path === '/health')
    return (
      object(value) &&
      ['application', 'version', 'status', 'runnerOrigin'].every((k) => string(value[k]))
    )
  return object(value)
}
