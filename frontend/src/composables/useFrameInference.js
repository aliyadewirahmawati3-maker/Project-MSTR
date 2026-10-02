import { computed, ref, shallowRef, watch } from 'vue'
import { captureVideoFrame, DEFAULT_INFERENCE_FPS, MIN_FRAME_INTERVAL_MS, inferenceApi } from '../services/localInference.js'
import { createFramePipeline } from '../utils/framePipeline.js'
import { inferenceLabel } from '../utils/inferenceStatus.js'
import { overlayTiming } from '../utils/inferenceTiming.js'
import { laneModeForZones } from '../utils/laneMode.js'

export function useFrameInference(videoRef, registration, zones, camera, context, options = {}) {
  const result = shallowRef(null), status = ref('DISABLED'), playing = ref(false)
  const now = ref(Date.now()), videoTime = ref(0)
  const fps = options.fps || ref(DEFAULT_INFERENCE_FPS)
  const roundTripMs = ref(null), sampleIntervalMs = ref(1000)
  let lastCamera = null, lastSession = null
  const cameraId = computed(() => zones.inputCameraCode.value || camera.camera_code)
  const enabled = computed(() => context.map.mode.value === 'YOLO_LOCAL_REALTIME')
  function changed(update) {
    if (!zones.canAnalyzeZones.value && update.result) {
      const masked = { ...update.result, queue_count: null, outer_lane_queue: null, inner_lane_queue: null, total_queue: null,
        detections: update.result.detections?.map(d => ({ ...d, in_queue_zone: false, lane_zone: null, lane_type: null })) || [] }
      if (['DETECTION_READY', 'ZONE_CALIBRATION_REQUIRED'].includes(masked.status)) masked.status = 'ZONE_CALIBRATION_REQUIRED'
      update = { ...update, result: masked, status: update.status === update.result.status ? masked.status : update.status }
    }
    if (lastCamera && context.sessions[lastCamera]?.session_id === lastSession) {
      delete context.sessions[lastCamera]
      delete context.results[lastCamera]
    }
    lastCamera = cameraId.value
    lastSession = update.session?.session_id
    if (update.session && !['AI_OFFLINE', 'INFERENCE_ERROR', 'INVALID_FRAME'].includes(update.status)) {
      context.sessions[lastCamera] = update.session
      if (update.result) context.results[lastCamera] = update.result
    }
    result.value = update.result
    status.value = update.status
    roundTripMs.value = update.roundTripMs ?? null
    sampleIntervalMs.value = update.intervalMs ?? 1000
    context.states[camera.camera_code] = update.status
  }
  const pipeline = createFramePipeline({ api: options.api || inferenceApi, clientId: context.clientId,
    intervalMs: MIN_FRAME_INTERVAL_MS, fps: () => fps.value,
    capture: options.capture || (() => captureVideoFrame(videoRef.value)), changed,
    input: () => ({ camera_id: cameraId.value, input_camera_code: zones.inputCameraCode.value || null,
      profile_id: zones.canAnalyzeZones.value ? zones.selectedProfile.value || null : null,
      ...(zones.canAnalyzeZones.value && zones.activeZones?.value?.length
        ? { lane_mode: laneModeForZones(zones.activeZones.value),
          active_zones: zones.activeZones.value.map(zone => ({ lane_type: zone.laneType, polygon: zone.polygon.map(point => [...point]) })) } : {}),
      source_sha256: zones.sourceHash.value || null,
      calibration_confirmed: zones.canAnalyzeZones.value }),
  })
  const stopVideoWatch = watch(videoRef, (video, _, cleanup) => {
    playing.value = false
    if (!video) return
    const sync = () => {
      videoTime.value = video.currentTime
      playing.value = !video.paused && !video.ended && !video.seeking && video.readyState >= 2
    }
    const events = ['playing', 'pause', 'ended', 'waiting', 'seeking', 'seeked', 'error']
    for (const name of events) video.addEventListener(name, sync)
    const updateTime = () => {
      // Native looping can jump backwards without firing a seeking event.
      const looped = video.currentTime < videoTime.value - 0.1
      videoTime.value = video.currentTime
      if (looped && enabled.value && playing.value && registration.state.value === 'ready') pipeline.start()
    }
    video.addEventListener('timeupdate', updateTime)
    cleanup(() => { for (const name of events) video.removeEventListener(name, sync); video.removeEventListener('timeupdate', updateTime) })
    sync()
  }, { immediate: true, flush: 'post' })
  const stopStateWatch = watch([enabled, playing, registration.version, registration.state, cameraId,
    zones.selectedProfile, zones.sourceHash, zones.canAnalyzeZones, zones.sameViewConfirmed, zones.calibrationRevision || ref(0)], () => {
    if (enabled.value && playing.value && registration.state.value === 'ready') pipeline.start()
    else pipeline.stop(!enabled.value ? 'DISABLED' : registration.state.value === 'ready' ? 'PAUSED' : 'WAITING_FOR_VIDEO')
  }, { immediate: true, flush: 'sync' })
  const timing = computed(() => overlayTiming(result.value, now.value, videoTime.value))
  const displayStatus = computed(() => timing.value.expired ? 'STALE' : status.value === 'INFERENCE_SLOW' ? 'INFERENCE_SLOW'
    : timing.value.delayed ? 'DATA_LATE' : status.value)
  const detections = computed(() => !enabled.value || !playing.value || timing.value.expired || timing.value.delayed || !result.value ||
    !['DETECTION_READY', 'ZONE_CALIBRATION_REQUIRED'].includes(result.value.status)
    ? [] : result.value.detections || [])
  const timer = setInterval(() => {
    now.value = Date.now()
    context.states[camera.camera_code] = displayStatus.value
  }, 100)
  function dispose() {
    stopStateWatch(); stopVideoWatch(); pipeline.dispose(); clearInterval(timer)
    delete context.states[camera.camera_code]
  }
  return { result, detections, enabled, fps, roundTripMs, sampleIntervalMs, timing,
    status: displayStatus, label: computed(() => inferenceLabel(displayStatus.value)), dispose }
}
