import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inferenceFps, samplingInterval, overlayTiming } from './inferenceTiming.js'

test('1 FPS default; 2 FPS needs measured capacity and respects server limits', () => {
  assert.equal(inferenceFps(undefined), 1)
  assert.equal(inferenceFps(99), 1)
  assert.equal(samplingInterval(1, 100), 1000)
  assert.equal(samplingInterval(2, null), 1000)
  assert.equal(samplingInterval(2, 500), 500)
  assert.equal(samplingInterval(2, 501), 1000)
  assert.equal(samplingInterval(2, 100, 1500), 1500)
})

test('overlay expires by capture age or video lag without altering backend freshness', () => {
  const now = Date.now()
  const result = { captured_at: new Date(now - 1000).toISOString(), expires_at: new Date(now + 1000).toISOString(),
    video_time_seconds: 5, stale: false }
  assert.deepEqual(overlayTiming(result, now, 6), { expired: false, delayed: false, ageMs: 1000 })
  assert.equal(overlayTiming(result, now, 6.6).delayed, true)
  assert.equal(overlayTiming(result, now, 0).delayed, true)
  assert.equal(overlayTiming(result, now + 600, 6).delayed, true)
  assert.equal(overlayTiming(result, now + 1000, 6).expired, true)
  assert.equal(overlayTiming({ ...result, stale: true }, now, 6).expired, true)
  assert.equal(overlayTiming({ ...result, captured_at: 'invalid' }, now, 6).delayed, true)
})
