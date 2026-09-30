// One in-flight operation per card; no frame queue. Sample only when the slot is free.
export function createFramePipeline({ api, capture, input, changed, clientId, intervalMs = 2000,
  uuid = () => crypto.randomUUID(), schedule = setTimeout, cancel = clearTimeout }) {
  let generation = 0, revision = 0, sequence = 0, active = false, disposed = false, busy = false
  let session = null, sourceId = null, timer, controller
  const release = old => { if (old) Promise.resolve(api.stop(old)).catch(() => {}) }

  function stop(status = 'WAITING_FOR_VIDEO') {
    active = false
    generation += 1
    cancel(timer)
    controller?.abort()
    release(session)
    session = null
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
    const token = generation
    const current = () => active && !disposed && generation === token
    controller = new AbortController()
    const timeout = schedule(() => controller?.abort(), 20000)
    try {
      if (!session) {
        const registered = await api.start({ camera_id: input().camera_id, client_id: clientId, source_id: sourceId, revision }, controller.signal)
        if (!current()) { release(registered); return }
        session = registered
        changed({ status: registered.model?.status === 'READY' ? 'DETECTING' : 'MODEL_LOADING', result: null, session })
      }
      if (!current()) return
      const snapshot = await capture()
      if (!current() || !snapshot) return
      const metadata = { ...input(), ...snapshot.metadata, session_id: session.session_id,
        source_id: sourceId, frame_sequence: ++sequence }
      const result = await api.detect(metadata, snapshot.blob, controller.signal)
      if (!current() || result.session_id !== session.session_id || result.source_id !== sourceId || result.frame_sequence !== sequence) return
      changed({ status: result.status, result, session })
    } catch (error) {
      if (current()) {
        if (error.status === 409) { release(session); session = null; revision += 1 }
        const status = error.status === 429 ? 'DETECTING' : error.status === 409 ? 'WAITING_FOR_VIDEO'
          : [413, 415, 422].includes(error.status) ? 'INVALID_FRAME' : 'AI_OFFLINE'
        changed({ status, result: null, session })
      }
    } finally {
      cancel(timeout)
      busy = false
      // Even an aborted old operation must settle before the next snapshot starts.
      if (active && !disposed) {
        cancel(timer)
        const delay = Math.max(intervalMs, (session?.min_interval_seconds || 0) * 1000)
        timer = schedule(tick, generation === token ? delay + Math.random() * 250 : 0)
      }
    }
  }
  return { start, stop, tick, dispose: () => { stop(); disposed = true }, isBusy: () => busy }
}
