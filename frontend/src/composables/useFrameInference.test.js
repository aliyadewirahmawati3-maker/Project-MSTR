import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nextTick, ref, shallowRef } from 'vue'
import { useFrameInference } from './useFrameInference.js'
import { useLocalInference } from './useLocalInference.js'

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
  video.paused = true; video.dispatchEvent(new Event('pause')); await settle()
  assert.equal(inference.result.value, null)
  assert.equal(context.sessions['CAM-W-01'], undefined)
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
