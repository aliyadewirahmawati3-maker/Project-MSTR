import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createFramePipeline } from './framePipeline.js'
import { freshYoloResult, safeYoloRow } from './inferenceStatus.js'
import { recommendPhase } from './phaseRecommendation.js'

const settle = () => new Promise(resolve => setImmediate(resolve))
function fixture(t, override = {}, options = {}) {
  const states = [], calls = [], stopped = [], timers = new Map()
  let serial = 0
  const api = {
    start: async input => ({ ...input, session_id: `session-${input.revision}` }),
    stop: async session => stopped.push(session),
    detect: async metadata => { calls.push(metadata); return { ...metadata, status: 'DETECTION_READY' } },
    ...override,
  }
  const pipeline = createFramePipeline({ api, clientId: 'test-client', uuid: () => `source-${++serial}`,
    input: () => ({ camera_id: 'CAM-W-01', profile_id: 'CAM-W-01' }),
    capture: async () => ({ metadata: { captured_at: new Date().toISOString() }, blob: 'unit fixture' }),
    changed: state => states.push(state), schedule: fn => { const id = ++serial; timers.set(id, fn); return id }, cancel: id => timers.delete(id), ...options })
  t.after(pipeline.dispose)
  return { pipeline, states, calls, stopped, timers }
}

test('single in-flight request drops ticks instead of accumulating frames', async t => {
  let resolveFrame, requests = 0
  const { pipeline, timers } = fixture(t, { detect: () => { requests++; return new Promise(resolve => { resolveFrame = resolve }) } })
  pipeline.start(); await settle()
  for (let i = 0; i < 100; i++) await pipeline.tick()
  assert.equal(requests, 1)
  assert.equal(pipeline.isBusy(), true)
  resolveFrame({}); await settle()
  assert.equal(pipeline.isBusy(), false)
  assert.equal(timers.size, 1)
})

test('replacement invalidates results, renews source, and rejects late responses', async t => {
  let resolveFrame, oldMetadata
  const { pipeline, states, stopped } = fixture(t, { detect: metadata => { oldMetadata = metadata; return new Promise(resolve => { resolveFrame = resolve }) } })
  pipeline.start(); await settle()
  const old = { ...oldMetadata, status: 'DETECTION_READY' }
  pipeline.start()
  resolveFrame(old); await settle()
  assert.equal(states.at(-1).result, null)
  assert.ok(stopped.some(s => s.session_id === old.session_id))
  const running = pipeline.tick() // now available, new session must be registered
  await settle()
  assert.notEqual(oldMetadata.source_id, old.source_id)
  resolveFrame({ ...oldMetadata, status: 'DETECTION_READY' })
  await running
  assert.equal(states.at(-1).result.source_id, oldMetadata.source_id)
})

test('pause/remove/disable/dispose abort pending work and stop future capture', async t => {
  for (const status of ['PAUSED', 'WAITING_FOR_VIDEO', 'DISABLED']) {
    const { pipeline, states, calls, timers, stopped } = fixture(t)
    pipeline.start(); await settle()
    assert.equal(calls.length, 1)
    pipeline.stop(status)
    assert.equal(states.at(-1).result, null)
    assert.equal(states.at(-1).status, status)
    assert.equal(timers.size, 0)
    assert.equal(stopped.length, 1)
    await pipeline.tick()
    assert.equal(calls.length, 1)
    pipeline.dispose(); pipeline.start(); await pipeline.tick()
    assert.equal(calls.length, 1)
  }
})

test('late session registration is closed after stop', async t => {
  let resolveSession
  const { pipeline, calls, stopped } = fixture(t, { start: () => new Promise(resolve => { resolveSession = resolve }) })
  pipeline.start(); pipeline.stop('PAUSED')
  resolveSession({ camera_id: 'CAM-W-01', session_id: 'late-session' }); await settle()
  assert.equal(calls.length, 0)
  assert.equal(stopped[0].session_id, 'late-session')
})

test('model errors are honest; connection failure clears prior results', async t => {
  let fail = false
  const { pipeline, states } = fixture(t, { detect: async meta => {
    if (fail) throw new Error('offline')
    return { ...meta, status: 'YOLO_MODEL_UNAVAILABLE', total_queue: null }
  } })
  pipeline.start(); await settle()
  assert.equal(states.at(-1).status, 'YOLO_MODEL_UNAVAILABLE')
  assert.equal(states.at(-1).result.total_queue, null)
  fail = true
  await pipeline.tick()
  assert.equal(states.at(-1).status, 'AI_OFFLINE')
  assert.equal(states.at(-1).result, null)
})

test('expired, mismatched, disabled and simulator results cannot feed YOLO recommendations', () => {
  const now = Date.now()
  const row = { source_type: 'YOLO_LOCAL_REALTIME', status: 'DETECTION_READY', inference_enabled: true,
    stale: false, expires_at: new Date(now + 10000).toISOString(), total_queue: 3,
    outer_lane_queue: 2, inner_lane_queue: 1, source_id: 'source', session_id: 'session' }
  const session = { source_id: 'source', session_id: 'session' }
  assert.equal(safeYoloRow(row, session, now).total_queue, 3)
  for (const change of [{ stale: true }, { expires_at: new Date(now-1).toISOString() },
    { session_id: 'previous-session' }, { source_type: 'SIMULATOR' }, { inference_enabled: false }, { status: 'INFERENCE_ERROR' }]) {
    assert.equal(safeYoloRow({ ...row, ...change }, session, now).total_queue, null)
  }
  assert.equal(safeYoloRow(row, null, now).total_queue, null)
  assert.equal(freshYoloResult({ ...row, expires_at: 'invalid' }, now), false)
  const rows = ['WEST','NORTH','EAST','SOUTH'].map(approach_code => ({ ...row, approach_code }))
  assert.notEqual(recommendPhase(rows).recommended_phase, 'WAITING_FOR_DATA')
  rows[1].expires_at = new Date(now-1).toISOString()
  assert.equal(recommendPhase(rows).recommended_phase, 'WAITING_FOR_DATA')
})

test('invalid snapshots are distinguished from an offline AI service', async t => {
  const { pipeline, states } = fixture(t, { detect: async () => { throw Object.assign(new Error('bad frame'), { status: 422 }) } })
  pipeline.start(); await settle()
  assert.equal(states.at(-1).status, 'INVALID_FRAME')
  assert.equal(states.at(-1).result, null)
})

test('429 retains the previous frame in the same session; errors and source changes clear it', async t => {
  let failure = null
  const { pipeline, states } = fixture(t, { detect: async meta => {
    if (failure) throw Object.assign(new Error('request failed'), { status: failure })
    return { ...meta, status: 'DETECTION_READY', detections: [{ class_name: 'car' }] }
  } })
  pipeline.start(); await settle()
  const first = states.at(-1).result
  failure = 429
  await pipeline.tick()
  assert.equal(states.at(-1).result, first)
  assert.equal(states.at(-1).status, 'DETECTING')
  failure = 422
  await pipeline.tick()
  assert.equal(states.at(-1).result, null)
  failure = 429
  pipeline.start(); await settle()
  assert.equal(states.at(-1).result, null)
})

test('sampling interval includes processing time instead of adding another full delay', async t => {
  let time = 0
  const delays = []
  const { pipeline } = fixture(t, { detect: async meta => {
    time += 600
    return { ...meta, status: 'DETECTION_READY' }
  } }, { now: () => time, schedule: (_, ms) => { delays.push(ms); return delays.length }, cancel: () => {} })
  pipeline.start(); await settle()
  assert.ok(delays.at(-1) >= 400 && delays.at(-1) < 425)
})

test('waiting for other cameras does not consume the server minimum interval', async t => {
  let time = 0
  const delays = []
  const { pipeline } = fixture(t, {
    start: async input => ({ ...input, session_id: 's', min_interval_seconds: 1.5 }),
    detect: async meta => {
      time += 1800 // 1600 ms waiting plus 200 ms processing.
      return { ...meta, status: 'DETECTION_READY', inference_duration_ms: 200 }
    },
  }, { now: () => time, schedule: (_, ms) => { delays.push(ms); return delays.length }, cancel: () => {} })
  pipeline.start(); await settle()
  assert.ok(delays.at(-1) >= 1300 && delays.at(-1) < 1550)
})

test('2 FPS adapts only after a timely result and falls back after a slow request', async t => {
  let time = 0, latency = 200
  const delays = [], states = []
  const { pipeline } = fixture(t, { detect: async meta => {
    time += latency
    return { ...meta, status: 'DETECTION_READY', inference_duration_ms: latency }
  } }, { intervalMs: 500, fps: () => 2, now: () => time, changed: state => states.push(state),
    schedule: (_, ms) => { delays.push(ms); return delays.length }, cancel: () => {} })
  pipeline.start(); await settle()
  assert.equal(states.at(-1).intervalMs, 500)
  assert.ok(delays.at(-1) >= 300 && delays.at(-1) < 325)
  latency = 800
  await pipeline.tick()
  assert.equal(states.at(-1).intervalMs, 1000)
  assert.equal(states.at(-1).status, 'INFERENCE_SLOW')
  assert.equal(states.at(-1).result.status, 'DETECTION_READY')
  assert.ok(delays.at(-1) >= 200 && delays.at(-1) < 225)
})

test('pending request shows slow status, preserves prior frame and drops ticks without capture', async t => {
  let pending, first = true, captures = 0
  const timers = new Map(), states = []
  let serial = 0
  const { pipeline } = fixture(t, { detect: meta => {
    if (first) { first = false; return Promise.resolve({ ...meta, status: 'DETECTION_READY' }) }
    return new Promise(resolve => { pending = () => resolve({ ...meta, status: 'DETECTION_READY' }) })
  } }, { changed: state => states.push(state),
    capture: async () => { captures++; return { metadata: {}, blob: 'fixture' } },
    schedule: (fn, ms) => { const id = ++serial; timers.set(id, { fn, ms }); return id }, cancel: id => timers.delete(id) })
  pipeline.start(); await settle()
  const prior = states.at(-1).result
  const running = pipeline.tick(); await settle()
  assert.equal(states.at(-1).status, 'DETECTING')
  assert.equal(states.at(-1).result, prior)
  const slow = [...timers.values()].find(timer => timer.ms === 1000)
  slow.fn()
  assert.equal(states.at(-1).status, 'INFERENCE_SLOW')
  for (let i = 0; i < 50; i++) await pipeline.tick()
  assert.equal(captures, 2)
  pending(); await running
})
