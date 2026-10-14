import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Worker } from 'node:worker_threads'
import { deriveStageState, readStageEvents } from '../src/runner/stage.ts'

const curriculum = JSON.parse(
  readFileSync(
    new URL('../../backend/src/main/resources/curriculum/absurd-town-v1.json', import.meta.url),
    'utf8',
  ),
)
assert.equal(curriculum.version, 'absurd-town-1.0')
assert.equal(curriculum.episodes.length, 4)
const worker = new Worker(new URL('./curriculum-worker.mjs', import.meta.url))
function receive(timeout = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('Python 动画课程校验超时'))
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
  assert.ok(result.stageEvents?.length, 'Python 必须产生真实场景动作')
  return deriveStageState(readStageEvents(result.stageEvents))
}
let starters = 0,
  referenceCases = 0
try {
  await receive(120000)
  for (const episode of curriculum.episodes) {
    const starter = await run(episode.starterCode, episode.exampleInput)
    if (episode.number === 1) {
      assert.equal(starter.filled, 0)
      assert.equal(starter.spilled, 1)
    }
    if (episode.number === 2) assert.equal(starter.pearls, 300)
    if (episode.number === 3) assert.equal(starter.drinks, 33)
    if (episode.number === 4) assert.equal(starter.drinks, 2)
    starters++
    for (const check of episode.checks) {
      const state = await run(episode.referenceCode, check.input)
      for (const [key, expected] of Object.entries(check.expectedState))
        assert.equal(state[key], expected, `${episode.id} / ${check.name} / ${key}`)
      referenceCases++
    }
  }
  console.log(
    JSON.stringify(
      { version: curriculum.version, starters, referenceCases, realPython: true },
      null,
      2,
    ),
  )
} finally {
  await worker.terminate()
}
