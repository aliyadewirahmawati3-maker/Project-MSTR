// One in-flight operation per card; no frame queue. Sample only when the slot is free.
import { samplingInterval } from './inferenceTiming.js'

export function createFramePipeline({ api, capture, input, changed, clientId, intervalMs = 1000, fps = () => 1,
  uuid = () => crypto.randomUUID(), schedule = setTimeout, cancel = clearTimeout, now = Date.now }) {
  let generation = 0, revision = 0, sequence = 0, active = false, disposed = false, busy = false
  let session = null, sourceId = null, timer, controller, lastResult = null
  let roundTripMs = null
  const cadence = () => Math.max(intervalMs, samplingInterval(fps(), roundTripMs, (session?.min_interval_seconds || 0) * 1000))
  const publish = status => changed({ status, result: lastResult, session, roundTripMs, intervalMs: cadence() })
  const release = old => { if (old) Promise.resolve(api.stop(old)).catch(() => {}) }

  function stop(status = 'WAITING_FOR_VIDEO') {
    active = false
    generation += 1
    cancel(timer)
    controller?.abort()
    release(session)
    session = null
    lastResult = null
    roundTripMs = null
    changed({ status, result: null, session: null })
  }
  function start() {
    if (disposed) return
    stop()
    active = true
    sourceId = uuid()
    revision += 1
    sequence = 0
    changed({ status: 'MODEL_LOADING', result: null, session: null })
    void tick()
  }
  async function tick() {
    if (!active || disposed || busy) return
    busy = true
    const started = now()
    const budget = cadence()
    let processedMs = 0
    const token = generation
    const current = () => active && !disposed && generation === token
    controller = new AbortController()
    const timeout = schedule(() => controller?.abort(), 20000)
    const slowTimer = schedule(() => { if (current()) publish('INFERENCE_SLOW') }, budget)
    try {
      if (!session) {
        const registered = await api.start({ camera_id: input().camera_id, client_id: clientId, source_id: sourceId, revision }, controller.signal)
        if (!current()) { release(registered); return }
        session = registered
        changed({ status: registered.model?.status === 'READY' ? 'DETECTING' : 'MODEL_LOADING', result: null, session })
      }
      if (!current()) return
      publish('DETECTING')
      const snapshot = await capture()
      if (!current() || !snapshot) return
      const metadata = { ...input(), ...snapshot.metadata, session_id: session.session_id,
        source_id: sourceId, frame_sequence: ++sequence }
      const result = await api.detect(metadata, snapshot.blob, controller.signal)
      if (!current() || result.session_id !== session.session_id || result.source_id !== sourceId || result.frame_sequence !== sequence) return
      lastResult = result
      roundTripMs = Math.max(0, now() - started)
      processedMs = Number.isFinite(result.inference_duration_ms) ? Math.max(0, result.inference_duration_ms) : 0
      publish(result.status === 'DETECTION_READY' && roundTripMs > budget ? 'INFERENCE_SLOW' : result.status)
    } catch (error) {
      if (current()) {
        if (error.status === 409) { release(session); session = null; revision += 1 }
        const status = error.status === 429 ? 'DETECTING' : error.status === 409 ? 'WAITING_FOR_VIDEO'
          : [413, 415, 422].includes(error.status) ? 'INVALID_FRAME' : 'AI_OFFLINE'
        // Backpressure is temporary; freshness and session checks still apply in the UI.
        if (error.status !== 429) lastResult = null
        if (error.status === 429) roundTripMs = null // Recheck capacity at 1 FPS before accelerating again.
        publish(status)
      }
    } finally {
      cancel(timeout)
      cancel(slowTimer)
      busy = false
      // Even an aborted old operation must settle before the next snapshot starts.
      if (active && !disposed) {
        cancel(timer)
        // Server rate limiting starts when the model slot is acquired.
        // Only processing time can be deducted from that minimum, not the whole round trip.
        const minRest = (session?.min_interval_seconds || 0) * 1000 - processedMs
        const delay = Math.max(0, cadence() - (now() - started), minRest)
        timer = schedule(tick, generation === token ? delay + Math.random() * 25 : 0)
      }
    }
  }
  return { start, stop, tick, dispose: () => { stop(); disposed = true }, isBusy: () => busy }
}
