import assert from 'node:assert/strict'
import { test } from 'node:test'
import { yoloMapQueues } from './yoloMapQueues.js'

const now = Date.now()
const row = { approach_code: 'WEST', source_type: 'YOLO_LOCAL_REALTIME', status: 'DETECTION_READY',
  stale: false, inference_enabled: true, expires_at: new Date(now + 10000).toISOString(),
  outer_lane_queue: 2, inner_lane_queue: 12 }

test('map renders measured lane occupancy with a bounded icon count and exact totals', () => {
  const lanes = yoloMapQueues([row], now)
  assert.equal(lanes.length, 8)
  assert.equal(lanes[0].vehicles.length, 2)
  assert.equal(lanes[1].vehicles.length, 7)
  assert.equal(lanes[1].count, 12)
  assert.equal(lanes[1].overflow, 5)
  assert.equal(lanes[0].vehicles[0].transform, 'translate(270 322) rotate(0)')
  assert.equal(lanes[1].vehicles[0].transform, 'translate(270 365) rotate(0)')
  assert.ok(lanes.slice(2).every(lane => lane.count === null && lane.vehicles.length === 0))
})

test('map excludes stale, uncalibrated, simulator and unknown queues; measured zero remains zero', () => {
  for (const change of [{ stale: true }, { status: 'ZONE_CALIBRATION_REQUIRED' }, { source_type: 'SIMULATOR' },
    { expires_at: new Date(now - 1).toISOString() }, { outer_lane_queue: null }, { outer_lane_queue: -1 }]) {
    const lane = yoloMapQueues([{ ...row, ...change }], now)[0]
    assert.equal(lane.count, null)
    assert.equal(lane.vehicles.length, 0)
  }
  assert.equal(yoloMapQueues([{ ...row, outer_lane_queue: 0 }], now)[0].count, 0)
})

test('four approach counts map only to their incoming lanes', () => {
  const rows = ['WEST','NORTH','EAST','SOUTH'].map(approach_code => ({ ...row, approach_code, inner_lane_queue: 1 }))
  const lanes = yoloMapQueues(rows, now)
  assert.deepEqual(lanes.filter(l => l.lane === 'outer').map(l => l.vehicles[0].transform), [
    'translate(270 322) rotate(0)', 'translate(451 270) rotate(90)',
    'translate(502 451) rotate(180)', 'translate(322 502) rotate(-90)',
  ])
})


test('single queue map exposes one Antrean per direction without lane labels', () => {
  const rows = ['WEST', 'NORTH', 'EAST', 'SOUTH'].map(approach_code => ({ ...row, approach_code,
    lane_mode: 'SINGLE_QUEUE', queue_count: 2, total_queue: 2, outer_lane_queue: null, inner_lane_queue: null }))
  const queues = yoloMapQueues(rows, now)
  assert.equal(queues.length, 4)
  assert.ok(queues.every(queue => queue.count === 2 && queue.lane === 'queue' && queue.label.includes('Antrean')))
  assert.ok(queues.every(queue => !/Luar|Dalam/.test(queue.label)))
})
