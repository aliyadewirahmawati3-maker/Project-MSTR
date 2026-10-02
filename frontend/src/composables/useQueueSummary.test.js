import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nextTick, reactive, ref } from 'vue'
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
  assert.equal(queues.badge.value, 'Menunggu')
  assert.equal(queues.sourceInfo.value.help, 'Menunggu deteksi')
  assert.equal(queues.approaches.value.length, 4)
  queues.dispose()
})

test('numeric source badges follow the response and clear on error without changing counts', async t => {
  let response
  const queues = useQueueSummary({ service: async () => {
    if (response instanceof Error) throw response
    return normalizeQueueSummary(response)
  } })
  t.after(queues.dispose)
  // Test responses only; never supplied to the running dashboard/API.
  for (const [source_type, status, label] of [
    ['SIMULATOR', 'SIMULATOR', 'Simulator'],
    ['OFFLINE_ESTIMATION', 'SIMULATOR', 'Estimasi offline'],
    ['YOLO_LOCAL_REALTIME', 'YOLO_LOCAL_REALTIME', 'YOLO lokal'],
    ['YOLO_OFFLINE_DETECTION', 'YOLO_OFFLINE_DETECTION', 'YOLO offline'],
  ]) {
    response = { ...payload(['WEST', 'NORTH', 'EAST', 'SOUTH'].map(code => approach(code, {
      source_type, status, outer_lane_queue: 0, inner_lane_queue: 0, total_queue: 0,
    }))), source_type }
    const running = queues.refresh()
    assert.equal(queues.badge.value, 'Memuat')
    await running
    assert.equal(queues.badge.value, label)
    assert.ok(queues.approaches.value.every(row => row.total_queue === 0))
  }
  response = new Error('unavailable')
  await queues.refresh()
  assert.equal(queues.badge.value, 'AI offline')
  assert.equal(queues.sourceInfo.value.help, 'Service AI tidak terhubung.')
  assert.equal(queues.sourceInfo.value.note, '')
  assert.ok(queues.approaches.value.every(row => row.total_queue === null))
  response = payload()
  await queues.refresh()
  assert.equal(queues.badge.value, 'Menunggu')
})

test('a configured YOLO mode with null queues never displays an active YOLO badge', async t => {
  const queues = useQueueSummary({ service: async () => normalizeQueueSummary({
    ...payload(['WEST', 'NORTH', 'EAST', 'SOUTH'].map(code => approach(code, { source_type: 'YOLO_LOCAL_REALTIME' }))),
    source_type: 'YOLO_LOCAL_REALTIME',
  }) })
  t.after(queues.dispose)
  await queues.refresh()
  assert.equal(queues.badge.value, 'Menunggu')
  assert.equal(queues.sourceInfo.value.note, '')
  assert.equal(queues.sourceInfo.value.variant, 'neutral')
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

test('YOLO summary requires the current source session; pause and expiry remove recommendation inputs', async t => {
  const mode = ref('YOLO_LOCAL_REALTIME'), sessions = reactive({})
  const rows = ['WEST','NORTH','EAST','SOUTH'].map(code => approach(code, {
    source_type: 'YOLO_LOCAL_REALTIME', status: 'DETECTION_READY', inference_enabled: true, stale: false,
    outer_lane_queue: 1, inner_lane_queue: 1, total_queue: 2, session_id: code, source_id: code,
    expires_at: new Date(Date.now() + 10000).toISOString(),
  }))
  const queues = useQueueSummary({ mode, sessions, service: async () => normalizeQueueSummary({ ...payload(rows), source_type: 'YOLO_LOCAL_REALTIME' }) })
  t.after(queues.dispose)
  await queues.refresh()
  assert.ok(queues.approaches.value.every(row => row.total_queue === null))
  sessions['CAM-W-01'] = { session_id: 'WEST', source_id: 'WEST' }
  assert.equal(queues.approaches.value[0].total_queue, 2)
  delete sessions['CAM-W-01']
  assert.equal(queues.approaches.value[0].total_queue, null)
  sessions['CAM-W-01'] = { session_id: 'NEW', source_id: 'NEW' }
  assert.equal(queues.approaches.value[0].total_queue, null)
  sessions['CAM-N-01'] = { session_id: 'NORTH', source_id: 'NORTH' }
  queues.summary.value.approaches[1].expires_at = '2000-01-01T00:00:00Z'
  assert.equal(queues.approaches.value[1].total_queue, null)
})

test('late simulator polling cannot replace YOLO summary after mode selection', async t => {
  const mode = ref('SIMULATION_VISUAL')
  let release
  const queues = useQueueSummary({ mode, service: () => new Promise(resolve => { release = resolve }) })
  t.after(queues.dispose)
  const request = queues.refresh()
  mode.value = 'YOLO_LOCAL_REALTIME'
  release(normalizeQueueSummary({ ...payload(), source_type: 'SIMULATOR' }))
  await request
  assert.equal(queues.summary.value, null)
  assert.ok(queues.approaches.value.every(row => row.total_queue === null))
})

test('frame results immediately update queues; late polls cannot regress or resurrect data', async t => {
  const mode = ref('YOLO_LOCAL_REALTIME'), sessions = reactive({}), results = reactive({})
  let reply = payload()
  const queues = useQueueSummary({ mode, sessions, results, service: async () => {
    if (reply instanceof Error) throw reply
    return normalizeQueueSummary(reply)
  } })
  t.after(queues.dispose)
  const frame = approach('WEST', { source_type: 'YOLO_LOCAL_REALTIME', status: 'DETECTION_READY', inference_enabled: true,
    stale: false, outer_lane_queue: 3, inner_lane_queue: 1, total_queue: 4,
    session_id: 'active', source_id: 'video', frame_sequence: 2, expires_at: new Date(Date.now()+10000).toISOString() })
  sessions['CAM-W-01'] = { session_id: 'active', source_id: 'video' }
  results['CAM-W-01'] = frame
  assert.equal(queues.approaches.value[0].total_queue, 4) // No polling yet.
  reply = payload([approach('WEST', { ...frame, frame_sequence: 1, total_queue: 1 }), ...['NORTH','EAST','SOUTH'].map(code => approach(code))])
  await queues.refresh()
  assert.equal(queues.approaches.value[0].total_queue, 4)
  results['CAM-W-01'] = { ...frame, frame_sequence: 3, status: 'INFERENCE_ERROR', total_queue: null }
  assert.equal(queues.approaches.value[0].total_queue, null)
  results['CAM-W-01'] = { ...frame, frame_sequence: 4 }
  reply = new Error('summary request failed')
  await queues.refresh()
  assert.equal(queues.approaches.value[0].total_queue, 4)
  assert.equal(queues.badge.value, 'YOLO lokal')
  results['CAM-W-01'].expires_at = '2000-01-01T00:00:00Z'
  assert.equal(queues.approaches.value[0].total_queue, null)
  assert.equal(queues.approaches.value[0].status, 'STALE')
  results['CAM-W-01'] = frame
  delete sessions['CAM-W-01']
  assert.equal(queues.approaches.value[0].total_queue, null)
  assert.equal(queues.approaches.value[0].status, 'WAITING_FOR_DETECTION')
  sessions['CAM-W-01'] = { session_id: 'new', source_id: 'new-video' }
  assert.equal(queues.approaches.value[0].total_queue, null)
})


test('single queue summary preserves mode and counts and rejects inconsistent totals', () => {
  const input = payload(['WEST', 'NORTH', 'EAST', 'SOUTH'].map(code => approach(code, {
    lane_mode: 'SINGLE_QUEUE', queue_count: 3, outer_lane_queue: 3, inner_lane_queue: null, total_queue: 3 })))
  const rows = normalizeQueueSummary(input).approaches
  assert.ok(rows.every(row => row.lane_mode === 'SINGLE_QUEUE' && row.queue_count === row.total_queue && row.inner_lane_queue === null))
  input.approaches[0].total_queue = 5
  assert.throws(() => normalizeQueueSummary(input), /tidak konsisten/)
})
