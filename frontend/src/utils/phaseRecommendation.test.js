import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GREEN_SECONDS, RECOMMENDED_PHASES, recommendPhase } from './phaseRecommendation.js'

const approach = (code, total_queue = null) => ({ approach_code: code, total_queue })
const summary = (totals = {}) => ({
  approaches: ['WEST', 'NORTH', 'EAST', 'SOUTH'].map(code => approach(code, totals[code] ?? null)),
})

test('semua antrean null menunggu data deteksi', () => {
  const result = recommendPhase(summary())
  assert.equal(result.recommended_phase, RECOMMENDED_PHASES.WAITING_FOR_DATA)
  assert.equal(result.reason, 'Menunggu data antrean dari deteksi kendaraan')
  assert.equal(result.priority_score, null)
  assert.equal(result.recommended_green_seconds, null)
  assert.equal(result.status, 'WAITING_FOR_DETECTION')
})

test('Barat dan Timur lebih padat memilih fase WEST_EAST', () => {
  const result = recommendPhase(summary({ WEST: 8, EAST: 6, NORTH: 2, SOUTH: 1 }))
  assert.equal(result.recommended_phase, RECOMMENDED_PHASES.WEST_EAST)
  assert.equal(result.label, 'Barat–Timur')
  assert.equal(result.status, 'SIMULATOR')
  assert.ok(result.priority_score > 50)
})

test('Utara dan Selatan lebih padat memilih fase NORTH_SOUTH', () => {
  const result = recommendPhase(summary({ WEST: 1, EAST: 2, NORTH: 8, SOUTH: 6 }))
  assert.equal(result.recommended_phase, RECOMMENDED_PHASES.NORTH_SOUTH)
  assert.equal(result.label, 'Utara–Selatan')
  assert.ok(result.priority_score > 50)
})

test('nilai negatif, NaN, dan string ditolak sebagai data antrean', () => {
  for (const invalid of [-1, Number.NaN, '4']) {
    const result = recommendPhase(summary({ WEST: invalid, NORTH: 1, EAST: 1, SOUTH: 1 }))
    assert.equal(result.recommended_phase, RECOMMENDED_PHASES.WAITING_FOR_DATA)
    assert.equal(result.status, 'WAITING_FOR_DETECTION')
  }
})

test('antrean seimbang memakai fase default yang aman', () => {
  const result = recommendPhase(summary({ WEST: 3, EAST: 2, NORTH: 2, SOUTH: 2 }))
  assert.equal(result.recommended_phase, RECOMMENDED_PHASES.WEST_EAST)
  assert.equal(result.priority_score, 50)
  assert.match(result.reason, /seimbang/)
})

test('durasi hijau selalu berada di antara batas minimum dan maksimum', () => {
  for (const totals of [
    { WEST: 0, NORTH: 0, EAST: 0, SOUTH: 0 },
    { WEST: 2, NORTH: 1, EAST: 3, SOUTH: 1 },
    { WEST: 1000, NORTH: 0, EAST: 1000, SOUTH: 0 },
  ]) {
    const result = recommendPhase(summary(totals))
    assert.ok(result.recommended_green_seconds >= GREEN_SECONDS.min)
    assert.ok(result.recommended_green_seconds <= GREEN_SECONDS.max)
  }
})
