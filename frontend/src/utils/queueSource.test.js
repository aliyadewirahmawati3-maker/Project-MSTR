import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatQueueSourceLabel, getQueueSourceBadge, getQueueSourceHelpText, getQueueSourcePresentation } from './queueSource.js'

test('short labels distinguish configured input, simulated queues, and future YOLO sources', () => {
  for (const [source, label] of Object.entries({
    OFFLINE_CONFIG: 'Menunggu', WAITING_FOR_DETECTION: 'Belum deteksi',
    SIMULATOR: 'Simulator', OFFLINE_ESTIMATION: 'Estimasi offline',
    YOLO_LOCAL_REALTIME: 'YOLO lokal', YOLO_OFFLINE_DETECTION: 'YOLO offline',
  })) assert.equal(formatQueueSourceLabel(source), label)
  assert.equal(formatQueueSourceLabel('OFFLINE_ESTIMATION', 'SIMULATOR'), 'Estimasi offline')
  assert.equal(getQueueSourceBadge('SIMULATOR'), 'badge-amber')
  assert.equal(getQueueSourceBadge('YOLO_LOCAL_REALTIME'), 'badge-blue')
  assert.equal(getQueueSourceHelpText('YOLO_LOCAL_REALTIME'), 'Deteksi lokal dari video, bukan CCTV live ATCS.')
  assert.equal(getQueueSourcePresentation('SIMULATOR').note, 'Mode demo simulator.')
})

test('waiting and unknown sources never imply active YOLO', () => {
  for (const source of ['OFFLINE_CONFIG', 'SIMULATOR', 'OFFLINE_ESTIMATION', 'YOLO_LOCAL_REALTIME', 'YOLO_OFFLINE_DETECTION']) {
    assert.equal(formatQueueSourceLabel(source, 'WAITING_FOR_DETECTION'), 'Menunggu')
    assert.equal(getQueueSourceHelpText(source, 'WAITING_FOR_DETECTION'), 'Menunggu deteksi')
    assert.equal(getQueueSourcePresentation(source, 'WAITING_FOR_DETECTION').note, '')
  }
  for (const source of [undefined, null, 'UNKNOWN']) assert.equal(formatQueueSourceLabel(source), 'Menunggu')
})

test('connection error overrides a previous source label; loading stays neutral', () => {
  for (const status of ['ERROR', 'OFFLINE', 'AI_OFFLINE']) {
    assert.equal(formatQueueSourceLabel('YOLO_LOCAL_REALTIME', status), 'AI offline')
    assert.equal(getQueueSourceBadge('SIMULATOR', status), 'badge-danger')
    assert.equal(getQueueSourceHelpText('SIMULATOR', status), 'Service AI tidak terhubung.')
  }
  assert.equal(formatQueueSourceLabel('ERROR'), 'AI offline')
  assert.equal(formatQueueSourceLabel('YOLO_LOCAL_REALTIME', 'LOADING'), 'Memuat')
})
