import { computed, ref, shallowRef, watch } from 'vue'
import { captureVideoFrame, FRAME_INTERVAL_MS, inferenceApi } from '../services/localInference.js'
import { createFramePipeline } from '../utils/framePipeline.js'
import { inferenceLabel } from '../utils/inferenceStatus.js'

export function useFrameInference(videoRef, registration, zones, camera, context, options = {}) {
  const result = shallowRef(null), status = ref('DISABLED'), playing = ref(false)
  const now = ref(Date.now()), videoTime = ref(0)
  let lastCamera = null, lastSession = null
  const cameraId = computed(() => zones.inputCameraCode.value || camera.camera_code)
  const enabled = computed(() => context.map.mode.value === 'YOLO_LOCAL_REALTIME')
  function changed(update) {
    if (lastCamera && context.sessions[lastCamera]?.session_id === lastSession) delete context.sessions[lastCamera]
    lastCamera = cameraId.value
    lastSession = update.session?.session_id
    if (update.session && !['AI_OFFLINE', 'INFERENCE_ERROR', 'INVALID_FRAME'].includes(update.status)) context.sessions[lastCamera] = update.session
    result.value = update.result
    status.value = update.status
    context.states[camera.camera_code] = update.status
  }
  const pipeline = createFramePipeline({ api: options.api || inferenceApi, clientId: context.clientId, intervalMs: FRAME_INTERVAL_MS,
    capture: options.capture || (() => captureVideoFrame(videoRef.value)), changed,
    input: () => ({ camera_id: cameraId.value, input_camera_code: zones.inputCameraCode.value || null,
      profile_id: zones.selectedProfile.value || null, source_sha256: zones.sourceHash.value || null,
      calibration_confirmed: zones.sameViewConfirmed.value && zones.canAnalyzeZones.value }),
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
    const updateTime = () => { videoTime.value = video.currentTime }
    video.addEventListener('timeupdate', updateTime)
    cleanup(() => { for (const name of events) video.removeEventListener(name, sync); video.removeEventListener('timeupdate', updateTime) })
    sync()
  }, { flush: 'post' })
  const stopStateWatch = watch([enabled, playing, registration.version, registration.state, cameraId,
    zones.selectedProfile, zones.sourceHash, zones.canAnalyzeZones, zones.sameViewConfirmed], () => {
    if (enabled.value && playing.value && registration.state.value === 'ready') pipeline.start()
    else pipeline.stop(!enabled.value ? 'DISABLED' : registration.state.value === 'ready' ? 'PAUSED' : 'WAITING_FOR_VIDEO')
  }, { immediate: true, flush: 'sync' })
  const expired = computed(() => result.value && Date.parse(result.value.expires_at) <= now.value)
  const displayStatus = computed(() => expired.value ? 'STALE' : status.value)
  const detections = computed(() => !enabled.value || !playing.value || expired.value || !result.value ||
    Math.abs(videoTime.value - result.value.video_time_seconds) > 2 ? [] : result.value.detections || [])
  const timer = setInterval(() => {
    now.value = Date.now()
    if (expired.value) context.states[camera.camera_code] = 'STALE'
  }, 250)
  function dispose() {
    stopStateWatch(); stopVideoWatch(); pipeline.dispose(); clearInterval(timer)
    delete context.states[camera.camera_code]
  }
  return { result, detections, enabled, status: displayStatus, label: computed(() => inferenceLabel(displayStatus.value)), dispose }
}
