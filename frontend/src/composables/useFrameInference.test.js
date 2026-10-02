import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nextTick, ref, shallowRef } from 'vue'
import { useFrameInference } from './useFrameInference.js'
import { useLocalInference } from './useLocalInference.js'
import { useQueueSummary } from './useQueueSummary.js'

const settle = async () => { await nextTick(); await new Promise(resolve => setImmediate(resolve)) }

test('video lifecycle starts only in YOLO; pause, seek, replacement, error and removal clear sessions', async t => {
  const context = useLocalInference()
  const video = Object.assign(new EventTarget(), { paused: false, ended: false, seeking: false, readyState: 3, currentTime: 5 })
  const videoRef = shallowRef(null)
  const registration = { version: ref(1), state: ref('ready') }
  const zones = { inputCameraCode: ref('CAM-W-01'), selectedProfile: ref('CAM-W-01'), sourceHash: ref('a'.repeat(64)), canAnalyzeZones: ref(true), sameViewConfirmed: ref(false) }
  let calls = 0
  const inference = useFrameInference(videoRef, registration, zones, { camera_code: 'CAM-W-01' }, context, {
    capture: async () => ({ metadata: {}, blob: 'unit test fixture' }),
    api: { start: async input => ({ ...input, session_id: `s-${input.revision}` }), stop: async () => {},
      detect: async meta => { calls++; return { ...meta, status: 'DETECTION_READY', expires_at: new Date(Date.now()+10000).toISOString(), detections: [] } } },
  })
  t.after(inference.dispose)
  videoRef.value = video; await settle()
  assert.equal(calls, 0)
  context.map.selectMode('YOLO_LOCAL_REALTIME'); await settle()
  assert.equal(calls, 1)
  assert.ok(context.sessions['CAM-W-01'])
  assert.equal(context.results['CAM-W-01'].session_id, inference.result.value.session_id)
  video.paused = true; video.dispatchEvent(new Event('pause')); await settle()
  assert.equal(inference.result.value, null)
  assert.equal(context.sessions['CAM-W-01'], undefined)
  assert.equal(context.results['CAM-W-01'], undefined)
  assert.equal(inference.label.value, 'Video dijeda')
  video.paused = false; video.dispatchEvent(new Event('playing')); await settle()
  assert.equal(calls, 2)
  video.seeking = true; video.dispatchEvent(new Event('seeking')); await settle()
  assert.equal(context.sessions['CAM-W-01'], undefined)
  video.seeking = false; video.dispatchEvent(new Event('seeked')); await settle()
  const oldSource = inference.result.value.source_id
  registration.version.value++; await settle()
  assert.notEqual(inference.result.value.source_id, oldSource)
  registration.state.value = 'error'; await settle()
  assert.equal(inference.result.value, null)
  videoRef.value = null; registration.state.value = 'empty'; await settle()
  assert.equal(inference.label.value, 'Menunggu video')
  assert.equal(context.sessions['CAM-W-01'], undefined)
  context.map.selectMode('SIMULATION_VISUAL'); await settle()
  assert.equal(inference.label.value, 'Menunggu AI')
})

test('overlay briefly holds the latest frame, hides delayed boxes, expires, and clears on video loops', async t => {
  const context = useLocalInference()
  const video = Object.assign(new EventTarget(), { paused: false, ended: false, seeking: false, readyState: 3, currentTime: 5 })
  const videoRef = shallowRef(null)
  const registration = { version: ref(1), state: ref('ready') }
  const zones = { inputCameraCode: ref('CAM-W-01'), selectedProfile: ref('CAM-W-01'), sourceHash: ref('a'.repeat(64)), canAnalyzeZones: ref(true), sameViewConfirmed: ref(false) }
  let pendingFrame
  const inference = useFrameInference(videoRef, registration, zones, { camera_code: 'CAM-W-01' }, context, {
    capture: async () => ({ metadata: { video_time_seconds: video.currentTime, captured_at: new Date().toISOString() }, blob: 'fixture' }),
    api: { start: async input => ({ ...input, session_id: `s-${input.revision}` }), stop: async () => {},
      detect: meta => new Promise(resolve => { pendingFrame = () => resolve({ ...meta, status: 'DETECTION_READY', expires_at: new Date(Date.now()+10000).toISOString(), detections: [{ class_name: 'car' }] }) }) },
  })
  t.after(inference.dispose)
  videoRef.value = video
  context.map.selectMode('YOLO_LOCAL_REALTIME'); await settle()
  pendingFrame(); await settle()
  const firstSource = inference.result.value.source_id
  video.currentTime = 6; video.dispatchEvent(new Event('timeupdate'))
  assert.equal(inference.detections.value.length, 1)
  assert.equal(inference.label.value, 'Frame terbaru')
  video.currentTime = 6.6; video.dispatchEvent(new Event('timeupdate'))
  assert.equal(inference.detections.value.length, 0)
  assert.equal(inference.label.value, 'Data terlambat')
  assert.ok(context.results['CAM-W-01']) // Visual hold does not invalidate the queue input.
  inference.result.value = { ...inference.result.value, expires_at: '2000-01-01T00:00:00Z' }
  assert.equal(inference.detections.value.length, 0)
  assert.equal(inference.status.value, 'STALE')
  video.currentTime = 0; video.dispatchEvent(new Event('timeupdate')); await settle()
  assert.equal(inference.result.value, null)
  assert.equal(context.results['CAM-W-01'], undefined)
  pendingFrame(); await settle()
  assert.notEqual(inference.result.value.source_id, firstSource)
})

test('dual calibration sends active polygons and retains authoritative server counts', async t => {
  const context = useLocalInference()
  const video = Object.assign(new EventTarget(), { paused: false, ended: false, seeking: false, readyState: 3, currentTime: 5 })
  const videoRef = shallowRef(video)
  const registration = { version: ref(1), state: ref('ready') }
  const zones = { inputCameraCode: ref('CAM-W-01'), selectedProfile: ref('CAM-W-01'), sourceHash: ref('a'.repeat(64)),
    canAnalyzeZones: ref(false), sameViewConfirmed: ref(false), localApplied: ref(false), editing: ref(false), calibrationRevision: ref(0),
    activeZones: ref([
      { cameraId: 'CAM-W-01', laneType: 'outer', polygon: [[0, 0], [.5, 0], [.5, 1], [0, 1]] },
      { cameraId: 'CAM-W-01', laneType: 'inner', polygon: [[.5, 0], [1, 0], [1, 1], [.5, 1]] },
    ]) }
  const sent = []
  const inference = useFrameInference(videoRef, registration, zones, { camera_code: 'CAM-W-01' }, context, {
    capture: async () => ({ metadata: { captured_at: new Date().toISOString(), video_time_seconds: video.currentTime }, blob: 'fixture' }),
    api: { start: async input => ({ ...input, session_id: `s-${input.revision}` }), stop: async () => {},
      detect: async metadata => {
        sent.push(metadata)
        // Even a service response with counts cannot activate an unconfirmed frontend zone.
        return { ...metadata, status: 'DETECTION_READY', source_type: 'YOLO_LOCAL_REALTIME',
          inference_enabled: true, stale: false, expires_at: new Date(Date.now() + 10000).toISOString(),
          outer_lane_queue: 7, inner_lane_queue: 8, total_queue: 15,
          detections: [{ class_name: 'car', confidence: .9, bbox: [.1, .1, .3, .6] }] }
      } },
  })
  const queues = useQueueSummary({ mode: context.map.mode, sessions: context.sessions, results: context.results })
  t.after(() => { inference.dispose(); queues.dispose() })
  context.map.selectMode('YOLO_LOCAL_REALTIME'); await settle()
  assert.equal(queues.approaches.value[0].total_queue, null)
  assert.equal(inference.result.value.outer_lane_queue, null)
  assert.equal(inference.result.value.inner_lane_queue, null)
  assert.equal(inference.result.value.status, 'ZONE_CALIBRATION_REQUIRED')
  assert.equal(inference.detections.value.length, 1) // General YOLO remains visible before calibration.
  zones.localApplied.value = true; zones.sameViewConfirmed.value = true
  zones.canAnalyzeZones.value = true; zones.calibrationRevision.value++
  await settle()
  await new Promise(resolve => setTimeout(resolve, 20)) // An aborted old operation settles before the new capture.
  assert.equal(sent.at(-1).profile_id, 'CAM-W-01')
  assert.equal(sent.at(-1).lane_mode, 'DUAL_LANE')
  assert.deepEqual(sent.at(-1).active_zones, zones.activeZones.value.map(z => ({ lane_type: z.laneType, polygon: z.polygon })))
  assert.equal(sent.at(-1).calibration_confirmed, true)
  assert.equal(queues.approaches.value[0].total_queue, 15)
  assert.equal(inference.result.value.local_calibration, undefined)
  assert.equal(inference.label.value, 'Frame terbaru')
  video.paused = true; video.dispatchEvent(new Event('pause')); await settle()
  assert.equal(queues.approaches.value[0].total_queue, null)
  assert.equal(inference.detections.value.length, 0)
})

test('single calibration sends the main polygon so server polling and browser queues agree', async t => {
  const context = useLocalInference()
  const video = Object.assign(new EventTarget(), { paused: false, ended: false, seeking: false, readyState: 3, currentTime: 5 })
  const videoRef = shallowRef(video)
  const registration = { version: ref(1), state: ref('ready') }
  const zones = { inputCameraCode: ref('CAM-W-01'), selectedProfile: ref('CAM-W-01'), sourceHash: ref('a'.repeat(64)),
    canAnalyzeZones: ref(false), sameViewConfirmed: ref(false), localApplied: ref(false), editing: ref(false), calibrationRevision: ref(0),
    activeProfile: ref({ lane_mode: 'SINGLE_QUEUE' }),
    activeZones: ref([
      { cameraId: 'CAM-W-01', laneType: 'queue', polygon: [[0, 0], [.5, 0], [.5, 1], [0, 1]] },
    ]) }
  const sent = []
  const inference = useFrameInference(videoRef, registration, zones, { camera_code: 'CAM-W-01' }, context, {
    capture: async () => ({ metadata: { captured_at: new Date().toISOString(), video_time_seconds: video.currentTime }, blob: 'fixture' }),
    api: { start: async input => ({ ...input, session_id: `s-${input.revision}` }), stop: async () => {},
      detect: async metadata => {
        sent.push(metadata)
        // Even a service response with counts cannot activate an unconfirmed frontend zone.
        return { ...metadata, status: 'DETECTION_READY', source_type: 'YOLO_LOCAL_REALTIME',
          inference_enabled: true, stale: false, expires_at: new Date(Date.now() + 10000).toISOString(),
          lane_mode: 'SINGLE_QUEUE', queue_count: 1, outer_lane_queue: 1, inner_lane_queue: null, total_queue: 1,
          detections: [{ class_name: 'car', confidence: .9, bbox: [.1, .1, .3, .6] }] }
      } },
  })
  const queues = useQueueSummary({ mode: context.map.mode, sessions: context.sessions, results: context.results })
  t.after(() => { inference.dispose(); queues.dispose() })
  context.map.selectMode('YOLO_LOCAL_REALTIME'); await settle()
  assert.equal(queues.approaches.value[0].total_queue, null)
  assert.equal(inference.result.value.outer_lane_queue, null)
  assert.equal(inference.result.value.inner_lane_queue, null)
  assert.equal(inference.result.value.status, 'ZONE_CALIBRATION_REQUIRED')
  assert.equal(inference.detections.value.length, 1) // General YOLO remains visible before calibration.
  zones.localApplied.value = true; zones.sameViewConfirmed.value = true
  zones.canAnalyzeZones.value = true; zones.calibrationRevision.value++
  await settle()
  await new Promise(resolve => setTimeout(resolve, 20)) // An aborted old operation settles before the new capture.
  assert.equal(sent.at(-1).profile_id, 'CAM-W-01')
  assert.equal(sent.at(-1).lane_mode, 'SINGLE_QUEUE')
  assert.deepEqual(sent.at(-1).active_zones, [{ lane_type: 'queue', polygon: zones.activeZones.value[0].polygon }])
  assert.equal(sent.at(-1).calibration_confirmed, true)
  assert.equal(queues.approaches.value[0].lane_mode, 'SINGLE_QUEUE')
  assert.equal(queues.approaches.value[0].queue_count, 1)
  assert.equal(queues.approaches.value[0].inner_lane_queue, null)
  assert.equal(queues.approaches.value[0].total_queue, 1)
  assert.equal(inference.result.value.local_calibration, undefined)
  assert.equal(inference.label.value, 'Frame terbaru')
  video.paused = true; video.dispatchEvent(new Event('pause')); await settle()
  assert.equal(queues.approaches.value[0].total_queue, null)
  assert.equal(inference.detections.value.length, 0)
})


test('detect-frame transport serializes calibrated polygons in the request header', async t => {
  const { inferenceApi } = await import('../services/localInference.js')
  const metadata = { lane_mode: 'SINGLE_QUEUE', calibration_confirmed: true,
    active_zones: [{ lane_type: 'queue', polygon: [[.1, .2], [.7, .2], [.7, .8], [.1, .8]] }] }
  const blob = new Blob(['unit frame'], { type: 'image/jpeg' })
  let request
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    request = { url, options }
    return { ok: true, json: async () => ({ queue_count: 1, total_queue: 1 }) }
  })
  const result = await inferenceApi.detect(metadata, blob)
  assert.match(request.url, /\/local-video\/detect-frame$/)
  assert.equal(request.options.method, 'POST')
  assert.equal(request.options.body, blob)
  assert.deepEqual(JSON.parse(request.options.headers['X-Frame-Metadata']), metadata)
  assert.equal(result.queue_count, 1)
})
