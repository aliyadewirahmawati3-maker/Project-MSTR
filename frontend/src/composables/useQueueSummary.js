import { computed, ref, unref, watch } from 'vue'
import { safeYoloRow } from '../utils/inferenceStatus.js'
import { getLocalVideoQueueSummary, QUEUE_APPROACH_LABELS, QUEUE_APPROACH_ORDER } from '../services/aiQueueSummary.js'
import { getQueueSourcePresentation } from '../utils/queueSource.js'

const QUEUE_INTERVAL_MS = 15_000
const OFFLINE_MESSAGE = 'AI service tidak dapat dihubungi; ringkasan antrean menunggu deteksi.'

function fallbackApproaches() {
  return QUEUE_APPROACH_ORDER.map(code => ({
    approach_code: code,
    approach_name: QUEUE_APPROACH_LABELS[code],
    camera_id: null,
    profile_id: null,
    outer_lane_queue: null,
    inner_lane_queue: null,
    total_queue: null,
    source_type: 'OFFLINE_CONFIG',
    status: 'WAITING_FOR_DETECTION',
    note: 'Menunggu ringkasan konfigurasi antrean dari AI service.',
  }))
}

function checkedAt() {
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta',
  }).format(new Date()).replaceAll('.', ':')
}

export function useQueueSummary(options = {}) {
  const service = options.service || getLocalVideoQueueSummary
  const intervalMs = options.intervalMs ?? QUEUE_INTERVAL_MS
  const summary = ref(null)
  const loading = ref(false)
  const error = ref('')
  const lastChecked = ref('')
  let controller
  let pollTimer
  let polling = false
  let disposed = false
  const now = ref(Date.now())
  let freshnessTimer
  const yoloMode = computed(() => unref(options.mode) === 'YOLO_LOCAL_REALTIME')

  const approaches = computed(() => {
    const rows = summary.value?.approaches || fallbackApproaches()
    if (!yoloMode.value) return rows
    return rows.map(row => safeYoloRow(row, options.sessions?.[row.camera_id], now.value))
  })
  const sourceInfo = computed(() => {
    const hasData = approaches.value.some(row => Number.isFinite(row.total_queue) && row.total_queue >= 0 && row.status !== 'WAITING_FOR_DETECTION')
    const status = error.value ? 'ERROR' : !yoloMode.value && loading.value ? 'LOADING' : hasData ? '' : yoloMode.value ? unref(options.inferenceStatus) || 'WAITING_FOR_DETECTION' : 'WAITING_FOR_DETECTION'
    return getQueueSourcePresentation(yoloMode.value ? 'YOLO_LOCAL_REALTIME' : summary.value?.source_type, status)
  })
  const badge = computed(() => sourceInfo.value.label)

  function schedule() {
    clearTimeout(pollTimer)
    if (polling && !disposed) pollTimer = setTimeout(refresh, yoloMode.value ? 2000 : intervalMs)
  }

  async function refresh() {
    if (disposed || loading.value) return
    clearTimeout(pollTimer)
    controller?.abort()
    const request = new AbortController()
    controller = request
    loading.value = true
    error.value = ''
    try {
      const result = await service(request.signal, unref(options.mode))
      if (request.signal.aborted) return
      summary.value = result
    } catch {
      if (!request.signal.aborted) {
        error.value = OFFLINE_MESSAGE
        summary.value = null
      }
    } finally {
      if (controller === request) {
        loading.value = false
        lastChecked.value = checkedAt()
        schedule()
      }
    }
  }

  function start() {
    if (disposed || polling) return
    polling = true
    freshnessTimer = setInterval(() => { now.value = Date.now() }, 250)
    return refresh()
  }

  function dispose() {
    disposed = true
    polling = false
    clearTimeout(pollTimer)
    clearInterval(freshnessTimer)
    stopModeWatch()
    controller?.abort()
  }

  const stopModeWatch = watch(() => unref(options.mode), () => {
    controller?.abort()
    controller = null
    loading.value = false
    summary.value = null
    error.value = ''
    if (polling) void refresh()
  }, { flush: 'sync' })

  return { summary, approaches, loading, error, lastChecked, badge, sourceInfo, refresh, start, dispose }
}
