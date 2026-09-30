import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nextTick } from 'vue'
import { formatQueueValue, laneQueueLabel, normalizeQueueSummary } from '../services/aiQueueSummary.js'
import { useQueueSummary } from './useQueueSummary.js'

const approach = (code, patch = {}) => ({
  approach_code: code,
  approach_name: { WEST: 'Barat', NORTH: 'Utara', EAST: 'Timur', SOUTH: 'Selatan' }[code],
  camera_id: `CAM-${code[0]}-01`,
  profile_id: `${code.toLowerCase()}-profile`,
  outer_lane_queue: null,
  inner_lane_queue: null,
  total_queue: null,
  source_type: 'OFFLINE_CONFIG',
  status: 'WAITING_FOR_DETECTION',
  note: 'Konfigurasi offline siap; menunggu deteksi.',
  ...patch,
})

const payload = (approaches = ['WEST', 'NORTH', 'EAST', 'SOUTH'].map(code => approach(code))) => ({
  source_type: 'OFFLINE_CONFIG',
  configuration_valid: true,
  inference_enabled: false,
  source_validation: 'NOT_RUN',
  error_code: null,
  approaches,
})

test('normalizes queue summary in canonical direction order and keeps null queues honest', () => {
  const result = normalizeQueueSummary(payload([
    approach('SOUTH'),
    approach('WEST'),
    approach('EAST', { outer_lane_queue: 2, inner_lane_queue: 3, total_queue: 5 }),
    approach('NORTH'),
  ]))

  assert.deepEqual(result.approaches.map(item => item.approach_code), ['WEST', 'NORTH', 'EAST', 'SOUTH'])
  assert.equal(result.approaches[0].total_queue, null)
  assert.equal(result.approaches[2].total_queue, 5)
  assert.equal(formatQueueValue(null), '-')
  assert.equal(laneQueueLabel(null), 'Menunggu deteksi')
  assert.equal(laneQueueLabel(3), '3 kendaraan')
})

test('rejects incomplete, duplicate, and invalid queue summary responses', () => {
  assert.throws(() => normalizeQueueSummary(payload(['WEST', 'NORTH', 'EAST'].map(code => approach(code)))))
  assert.throws(() => normalizeQueueSummary(payload([approach('WEST'), approach('WEST'), approach('EAST'), approach('SOUTH')])))
  assert.throws(() => normalizeQueueSummary(payload([approach('WEST', { total_queue: -1 }), approach('NORTH'), approach('EAST'), approach('SOUTH')])))
  assert.throws(() => normalizeQueueSummary({ approaches: null }))
})

test('composable loads queue summary and exposes loading/error fallback state', async () => {
  const calls = []
  const queues = useQueueSummary({
    intervalMs: 60_000,
    service: async signal => {
      calls.push(signal)
      return normalizeQueueSummary(payload())
    },
  })

  const running = queues.refresh()
  assert.equal(queues.loading.value, true)
  await running
  await nextTick()
  assert.equal(calls.length, 1)
  assert.equal(queues.loading.value, false)
  assert.equal(queues.error.value, '')
  assert.equal(queues.badge.value, 'OFFLINE_CONFIG')
  assert.equal(queues.approaches.value.length, 4)
  queues.dispose()
})

test('composable falls back to four safe directions when AI service is unavailable', async () => {
  const queues = useQueueSummary({
    intervalMs: 60_000,
    service: async () => { throw new Error('down') },
  })

  await queues.refresh()
  await nextTick()
  assert.match(queues.error.value, /AI service tidak dapat dihubungi/)
  assert.equal(queues.badge.value, 'AI offline')
  assert.deepEqual(queues.approaches.value.map(item => item.approach_code), ['WEST', 'NORTH', 'EAST', 'SOUTH'])
  assert.equal(queues.approaches.value.every(item => item.total_queue === null), true)
  queues.dispose()
})
