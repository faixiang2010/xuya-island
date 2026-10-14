import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Worker } from 'node:worker_threads'
const curriculum = JSON.parse(
  readFileSync(
    new URL('../../backend/src/main/resources/curriculum/python-interest-v1.json', import.meta.url),
    'utf8',
  ),
)
const lessons = curriculum.lessons.filter((item) => item.number > 0)
assert.equal(lessons.length, 48)
assert.equal(new Set(lessons.map((item) => item.id)).size, 48)
assert.equal(curriculum.phases.length, 6)
const worker = new Worker(new URL('./curriculum-worker.mjs', import.meta.url))
function receive(timeout = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('Python 校验超时'))
    }, timeout)
    const message = (value) => {
      cleanup()
      resolve(value)
    }
    const error = (value) => {
      cleanup()
      reject(value)
    }
    function cleanup() {
      clearTimeout(timer)
      worker.off('message', message)
      worker.off('error', error)
    }
    worker.once('message', message)
    worker.once('error', error)
  })
}
async function run(code, input) {
  const pending = receive()
  worker.postMessage({ code, input })
  const result = await pending
  assert.equal(result.error, '', result.error)
  return result
}
let starters = 0,
  cases = 0
try {
  await receive(120000)
  for (const lesson of lessons) {
    for (const key of [
      'mission',
      'explanation',
      'prediction',
      'creation',
      'quickChallenge',
      'parentPrompt',
    ])
      assert.ok(lesson[key]?.trim(), lesson.id + ':' + key)
    assert.equal(lesson.hints.length, 3)
    assert.ok(lesson.rubric.length >= 3)
    const starter = await run(lesson.starterCode, lesson.exampleInput)
    assert.ok(starter.output.length || starter.drawings.length, lesson.id + ' 起始代码没有可见结果')
    starters++
    for (const exercise of lesson.exercises) {
      for (const item of exercise.tests) {
        const result = await run(exercise.referenceCode, item.input)
        let cursor = 0
        for (const text of item.outputContains) {
          const index = result.output.indexOf(text, cursor)
          assert.ok(
            index >= 0,
            lesson.id + ' ' + item.name + ' 缺少输出 ' + text + '；实际 ' + result.output,
          )
          cursor = index + text.length
        }
        assert.ok(result.drawings.length >= item.minDrawings, lesson.id + ' 画笔数量不足')
        for (const name of item.expectedFiles)
          assert.ok(result.files.includes(name), lesson.id + ' 缺文件 ' + name)
        cases++
      }
    }
  }
  console.log(
    JSON.stringify(
      {
        version: curriculum.version,
        lessons: 48,
        starters,
        referenceCases: cases,
        phaseProjects: lessons.filter((item) => item.number % 8 === 0).map((item) => item.id),
      },
      null,
      2,
    ),
  )
} finally {
  await worker.terminate()
}
