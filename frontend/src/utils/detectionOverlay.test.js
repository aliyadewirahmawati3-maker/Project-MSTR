import test from 'node:test'
import assert from 'node:assert/strict'
import { reactive, ref } from 'vue'
import { useQueueSummary } from '../composables/useQueueSummary.js'
import { DEFAULT_OVERLAY_CONFIDENCE, layoutDetections, overlayConfidence } from './detectionOverlay.js'

const frame = { width: 640, height: 360 }
const detection = (confidence = .9, bbox = [.2, .3, .4, .6], class_name = 'car') => ({ confidence, bbox, class_name })

test('overlay hides low confidence, includes the exact threshold, and keeps the four vehicle classes', () => {
  const input = [.04, .05, .08, .28, .449, .45, .8].map(value => detection(value))
  assert.deepEqual(layoutDetections(input, frame).map(box => box.confidence), [.8, .45])
  assert.equal(DEFAULT_OVERLAY_CONFIDENCE, .45)
  const vehicles = ['car', 'motorcycle', 'bus', 'truck'].map(name => detection(.9, undefined, name))
  assert.equal(layoutDetections(vehicles, frame).length, 4)
  assert.equal(layoutDetections([detection(.9, undefined, 'person')], frame).length, 0)
})

test('compact labels omit confidence; detail includes it; tiny boxes retain only their outline', () => {
  assert.equal(layoutDetections([detection()], frame)[0].label.text, 'car')
  assert.equal(layoutDetections([detection()], frame, { mode: 'detail' })[0].label.text, 'car 90%')
  const tiny = layoutDetections([detection(.9, [.1, .1, .12, .12])], frame)
  assert.equal(tiny.length, 1)
  assert.equal(tiny[0].label, undefined)
})

test('labels stay within the video and do not overlap in a crowded frame', () => {
  const input = [detection(.99, [.92, 0, 1, .2]), detection(.98, [0, .8, .2, 1]),
    ...Array.from({ length: 12 }, (_, index) => detection(.9 - index * .01))]
  const boxes = layoutDetections(input, frame, { mode: 'detail' })
  const labels = boxes.filter(box => box.label).map(box => box.label)
  assert.equal(boxes.length, input.length)
  assert.ok(labels.length > 0 && labels.length < input.length)
  for (const label of labels) {
    assert.ok(label.left >= 0 && label.top >= 0)
    assert.ok(label.left + label.width <= frame.width && label.top + label.height <= frame.height)
    for (const other of labels) {
      if (other === label) continue
      assert.ok(label.left + label.width <= other.left || other.left + other.width <= label.left ||
        label.top + label.height <= other.top || other.top + other.height <= label.top)
    }
  }
})

test('invalid geometry/confidence is excluded; resizing and invalid settings are safe', () => {
  const invalid = [null, detection(NaN), detection(1.1), detection(.9, [0, 0, Infinity, 1]),
    detection(.9, [.2, .2, .1, .1]), detection(.9, [.1, .1])]
  assert.deepEqual(layoutDetections(invalid, frame), [])
  assert.deepEqual(layoutDetections([detection()], null), [])
  assert.deepEqual(layoutDetections([detection()], { width: 0, height: 10 }), [])
  for (const value of ['', NaN, -1, 2, undefined]) assert.equal(overlayConfidence(value), .45)
  assert.equal(overlayConfidence(0), 0)
  const clamped = layoutDetections([detection(.9, [-.1, -.1, 1.2, 1.2])], frame)[0]
  assert.deepEqual(clamped.bbox, [0, 0, 1, 1])
  assert.equal(layoutDetections([detection()], { width: 20, height: 10 })[0].label, undefined)
})

test('overlay settings never change valid inference queues or mutate detections', t => {
  const source = [detection(.28), detection(.9)]
  const snapshot = structuredClone(source)
  Object.freeze(source)
  source.forEach(box => { Object.freeze(box.bbox); Object.freeze(box) })
  const sessions = reactive({ 'CAM-W-01': { session_id: 'active', source_id: 'video' } })
  const results = reactive({ 'CAM-W-01': { session_id: 'active', source_id: 'video',
    source_type: 'YOLO_LOCAL_REALTIME', status: 'DETECTION_READY', inference_enabled: true, stale: false,
    expires_at: new Date(Date.now() + 10000).toISOString(), outer_lane_queue: 1, inner_lane_queue: 1,
    total_queue: 2, detections: source } })
  const queues = useQueueSummary({ mode: ref('YOLO_LOCAL_REALTIME'), sessions, results })
  t.after(queues.dispose)
  assert.equal(queues.approaches.value[0].total_queue, 2)
  assert.equal(layoutDetections(source, frame).length, 1)
  assert.equal(layoutDetections(source, frame, { minConfidence: .95, mode: 'detail' }).length, 0)
  assert.equal(queues.approaches.value[0].total_queue, 2)
  assert.equal(queues.approaches.value[0].outer_lane_queue, 1)
  assert.equal(queues.approaches.value[0].inner_lane_queue, 1)
  assert.deepEqual(source, snapshot)
})


test('outside bbox can be hidden without affecting queues or general detector output', () => {
  const input = [{ ...detection(), in_queue_zone: true, lane_zone: 'queue' },
    { ...detection(.95), in_queue_zone: false, lane_zone: null }]
  const before = structuredClone(input)
  const all = layoutDetections(input, frame)
  assert.equal(all.length, 2)
  assert.equal(all.filter(d => d.in_queue_zone).length, 1)
  const inside = layoutDetections(input, frame, { showOutside: false })
  assert.equal(inside.length, 1)
  assert.equal(inside[0].lane_zone, 'queue')
  assert.equal(inside[0].in_queue_zone, true)
  assert.deepEqual(input, before)
  assert.equal(layoutDetections([detection()], frame, { showOutside: false }).length, 0)
})
