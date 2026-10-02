import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapPhasePresentation } from './mapPhasePresentation.js'
import { createSimulation, lightFor, DIRECTIONS } from '../simulation/intersectionSimulator.js'
import { recommendPhase } from './phaseRecommendation.js'

function queues(totals, now = Date.now()) {
  return ['WEST', 'NORTH', 'EAST', 'SOUTH'].map((approach_code, index) => ({
    approach_code, total_queue: totals[index], source_type: 'YOLO_LOCAL_REALTIME',
    status: 'DETECTION_READY', inference_enabled: true, stale: false,
    expires_at: new Date(now + 5000).toISOString(),
  }))
}

test('YOLO phase uses the existing recommendation and activates both paired approaches', () => {
  for (const [totals, lights] of [
    [[8, 1, 6, 2], { west: 'green', east: 'green', north: 'red', south: 'red' }],
    [[1, 8, 2, 6], { west: 'red', east: 'red', north: 'green', south: 'green' }],
  ]) {
    const rows = queues(totals), snapshot = structuredClone(rows)
    const actual = mapPhasePresentation({ isSimulation: false, queues: rows })
    const recommended = recommendPhase(rows)
    assert.equal(actual.label, recommended.label)
    assert.equal(actual.seconds, recommended.recommended_green_seconds)
    assert.equal(actual.status, 'Berjalan')
    assert.deepEqual(actual.lights, lights)
    assert.deepEqual(rows, snapshot)
  }
})

test('missing, partial, invalid, uncalibrated, and non-YOLO inputs never get a green phase', () => {
  const complete = queues([3, 2, 4, 1])
  for (const rows of [[], complete.slice(0, 3),
    complete.map((row, index) => index === 0 ? { ...row, total_queue: null } : row),
    complete.map((row, index) => index === 0 ? { ...row, status: 'ZONE_CALIBRATION_REQUIRED' } : row),
    complete.map(row => ({ ...row, source_type: 'SIMULATOR' })),
    complete.map((row, index) => index === 0 ? { ...row, total_queue: -1 } : row),
    complete.map((row, index) => index === 0 ? { ...row, approach_code: 'SOUTH' } : row),
  ]) {
    const phase = mapPhasePresentation({ isSimulation: false, queues: rows })
    assert.equal(phase.label, 'Menunggu data YOLO')
    assert.equal(phase.seconds, null)
    assert.equal(phase.status, 'Menunggu data')
    assert.ok(Object.values(phase.lights).every(light => light === 'waiting'))
  }
})

test('expiry of any direction immediately clears the paired green recommendation', () => {
  const now = Date.now(), rows = queues([8, 1, 6, 1], now)
  assert.equal(mapPhasePresentation({ isSimulation: false, queues: rows, now }).light, 'green')
  const phase = mapPhasePresentation({ isSimulation: false, queues: rows, now: now + 5000 })
  assert.equal(phase.status, 'Data kedaluwarsa')
  assert.equal(phase.light, 'waiting')
  assert.ok(Object.values(phase.lights).every(light => light !== 'green'))
  rows[0].stale = true
  assert.equal(mapPhasePresentation({ isSimulation: false, queues: rows, now }).status, 'Data kedaluwarsa')
})

test('valid measured zero retains the heuristic recommendation rather than creating dummy counts', () => {
  const rows = queues([0, 0, 0, 0])
  const phase = mapPhasePresentation({ isSimulation: false, queues: rows })
  assert.equal(phase.label, recommendPhase(rows).label)
  assert.equal(phase.seconds, recommendPhase(rows).recommended_green_seconds)
})

test('simulation phase reflects existing signals, yellow/all-red, countdown and pause without mutation', () => {
  const simulation = createSimulation()
  for (const state of ['green', 'yellow', 'allRed']) {
    simulation.phase = state
    simulation.remaining = 14.2
    simulation.playing = true
    const before = structuredClone(simulation)
    const phase = mapPhasePresentation({ isSimulation: true, simulation })
    assert.equal(phase.label, 'Barat')
    assert.equal(phase.seconds, 15)
    assert.equal(phase.status, 'Berjalan')
    for (const direction of DIRECTIONS) assert.equal(phase.lights[direction], lightFor(simulation, direction))
    assert.deepEqual(simulation, before)
  }
  simulation.playing = false
  assert.equal(mapPhasePresentation({ isSimulation: true, simulation }).status, 'Dijeda')
})
