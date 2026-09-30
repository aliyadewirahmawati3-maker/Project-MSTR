import { computed, ref } from 'vue'
import { getLocalVideoQueueSummary, QUEUE_APPROACH_LABELS, QUEUE_APPROACH_ORDER } from '../services/aiQueueSummary.js'

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

  const approaches = computed(() => summary.value?.approaches || fallbackApproaches())
  const badge = computed(() => loading.value ? 'Memuat' : error.value ? 'AI offline' : summary.value?.source_type || 'Menunggu data')

  function schedule() {
    clearTimeout(pollTimer)
    if (polling && !disposed) pollTimer = setTimeout(refresh, intervalMs)
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
      const result = await service(request.signal)
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
    return refresh()
  }

  function dispose() {
    disposed = true
    polling = false
    clearTimeout(pollTimer)
    controller?.abort()
  }

  return { summary, approaches, loading, error, lastChecked, badge, refresh, start, dispose }
}
