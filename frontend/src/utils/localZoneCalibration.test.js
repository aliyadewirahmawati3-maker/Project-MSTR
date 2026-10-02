import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyLocalCalibration, normalizedPointer } from './localZoneCalibration.js'
import { containedVideoRect } from './queueZones.js'

const zones = [
  { cameraId: 'CAM-W-01', laneType: 'outer', polygon: [[0, 0], [.5, 0], [.5, 1], [0, 1]] },
  { cameraId: 'CAM-W-01', laneType: 'inner', polygon: [[.5, 0], [1, 0], [1, 1], [.5, 1]] },
]
const detection = x => ({ class_name: 'car', confidence: .9, bbox: [x - .05, .1, x + .05, .6] })
const frame = () => ({ source_type: 'YOLO_LOCAL_REALTIME', inference_enabled: true, stale: false,
  status: 'ZONE_CALIBRATION_REQUIRED', expires_at: new Date(Date.now() + 10000).toISOString(),
  session_id: 's', source_id: 'v', frame_sequence: 2, outer_lane_queue: null, inner_lane_queue: null,
  total_queue: null, detections: [detection(.2), detection(.8), detection(.5)] })

test('local counts use real bottom-center bbox observations; shared boundaries are excluded', () => {
  const input = frame(), before = structuredClone(input)
  const output = applyLocalCalibration(input, zones, 'CAM-W-01')
  assert.equal(output.outer_lane_queue, 1)
  assert.equal(output.inner_lane_queue, 1)
  assert.equal(output.total_queue, 2)
  assert.equal(output.ambiguous_detections, 1)
  assert.equal(output.session_id, input.session_id)
  assert.equal(output.frame_sequence, 2)
  assert.deepEqual(input, before)
})

test('stale, model errors and non-YOLO inputs cannot be promoted to valid local counts', () => {
  for (const change of [{ stale: true }, { status: 'INFERENCE_ERROR' }, { source_type: 'SIMULATOR' },
    { expires_at: 'invalid' }, { expires_at: new Date(Date.now() - 1).toISOString() }]) {
    const input = { ...frame(), ...change }
    assert.equal(applyLocalCalibration(input, zones, 'CAM-W-01'), input)
    assert.equal(input.total_queue, null)
  }
})

test('pointer mapping ignores letterbox padding and stays normalized on resize/fullscreen', () => {
  for (const [width, height] of [[640, 480], [1280, 720], [1920, 1200], [360, 600]]) {
    const image = containedVideoRect(width, height, 1920, 1080)
    const rect = { ...image, left: image.left + 25, top: image.top + 40 }
    assert.deepEqual(normalizedPointer(rect.left + rect.width * .25, rect.top + rect.height * .75, rect), [.25, .75])
    assert.deepEqual(normalizedPointer(rect.left - 20, rect.top - 20, rect), [0, 0])
  }
})


test('SINGLE_QUEUE counts only bottom centers in the main polygon and exposes Antrean', async () => {
  const { queueDisplayRows } = await import('./laneMode.js')
  const main = [{ ...zones[0], laneType: 'queue' }]
  const input = { ...frame(), detections: [detection(.2), detection(.8),
    { class_name: 'car', confidence: .9, bbox: [.4, .1, .8, .6] }] }
  const output = applyLocalCalibration(input, main, 'CAM-W-01')
  assert.equal(output.lane_mode, 'SINGLE_QUEUE')
  assert.equal(output.queue_count, 1)
  assert.equal(output.total_queue, output.queue_count)
  assert.equal(output.outer_lane_queue, output.queue_count)
  assert.equal(output.inner_lane_queue, null)
  assert.match(output.note, /inner_lane_queue null/)
  assert.deepEqual(queueDisplayRows(output), [{ label: 'Antrean', value: 1 }])
  assert.equal(input.detections.length, 3)
  assert.deepEqual(queueDisplayRows({ lane_mode: 'DUAL_LANE', outer_lane_queue: 2, inner_lane_queue: 3 }),
    [{ label: 'Luar', value: 2 }, { label: 'Dalam', value: 3 }])
})


test('queue card template renders Antrean without Luar/Dalam in single mode', async () => {
  const { readFileSync } = await import('node:fs')
  const { compile } = await import('@vue/compiler-dom')
  const Vue = await import('vue')
  const { renderToString } = await import('@vue/server-renderer')
  const { queueDisplayRows } = await import('./laneMode.js')
  const source = readFileSync(new URL('../App.vue', import.meta.url), 'utf8')
  const template = source.match(/<p v-for="item in queueDisplayRows\(queue\)"[^>]*>[\s\S]*?<\/p>/)[0]
  const render = new Function('Vue', compile(template, { mode: 'function', prefixIdentifiers: true }).code)(Vue)
  const html = await renderToString(Vue.createSSRApp({ render, setup: () => ({ queueDisplayRows,
    queue: { lane_mode: 'SINGLE_QUEUE', queue_count: 4 }, formatQueueValue: String }) }))
  assert.match(html, /Antrean: 4/)
  assert.doesNotMatch(html, /Luar|Dalam/)
})
