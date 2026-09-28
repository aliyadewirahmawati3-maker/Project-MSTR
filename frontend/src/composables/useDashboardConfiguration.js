import { computed, ref } from 'vue'
import { getDashboardConfiguration, getHealth } from '../services/sigapApi.js'

const HEALTH_INTERVAL_MS = 15_000
const OFFLINE_MESSAGE = 'Backend tidak dapat dihubungi; simulator lokal tetap aktif.'

export function useDashboardConfiguration() {
  const configuration = ref(null)
  const configurationFresh = ref(false)
  const health = ref(null)
  const refreshing = ref(false)
  const error = ref('')
  const lastChecked = ref('')
  let controller
  let pollTimer
  let polling = false
  let disposed = false
  const backendStatus = computed(() => health.value ? 'Online' : lastChecked.value ? 'Offline' : 'Menunggu')
  const databaseStatus = computed(() => !health.value ? 'Tidak diketahui' : health.value.database.connected ? 'Online' : 'Offline')
  const statusMessage = computed(() => refreshing.value
    ? 'Memuat konfigurasi simpang…'
    : error.value || `Backend ${backendStatus.value.toLowerCase()} · Database ${databaseStatus.value.toLowerCase()}`)

  function recordCheck() {
    lastChecked.value = new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta',
    }).format(new Date()).replaceAll('.', ':')
  }

  function applyHealth(result) {
    health.value = result
    error.value = !result ? OFFLINE_MESSAGE
      : !result.database.connected || result.status !== 'ok'
        ? 'Backend online; database atau layanan terganggu. Simulator lokal tetap aktif.' : ''
    if (error.value) configurationFresh.value = false
    recordCheck()
  }

  function scheduleHealth() {
    clearTimeout(pollTimer)
    if (polling && !disposed) pollTimer = setTimeout(pollHealth, HEALTH_INTERVAL_MS)
  }

  async function refresh() {
    if (disposed || refreshing.value) return
    clearTimeout(pollTimer)
    controller?.abort()
    const request = new AbortController()
    controller = request
    refreshing.value = true
    configurationFresh.value = false
    error.value = ''
    // Retain last configuration/geometry while live status is being verified.
    try {
      const [healthResult, configurationResult] = await Promise.allSettled([
        getHealth(request.signal), getDashboardConfiguration(request.signal),
      ])
      if (request.signal.aborted) return
      applyHealth(healthResult.status === 'fulfilled' ? healthResult.value : null)
      if (configurationResult.status === 'fulfilled') {
        configuration.value = configurationResult.value
        configurationFresh.value = !error.value
      } else if (!error.value) {
        error.value = 'Konfigurasi simpang gagal dimuat; simulator lokal tetap aktif. Tekan Refresh Status untuk mencoba lagi.'
      }
    } finally {
      if (controller === request) {
        refreshing.value = false
        scheduleHealth()
      }
    }
  }

  async function pollHealth() {
    if (disposed || !polling || refreshing.value) return
    // Retry configuration too after a failure, so recovered status is current.
    if (!configurationFresh.value) return refresh()
    const request = new AbortController()
    controller = request
    try {
      const result = await getHealth(request.signal)
      if (!request.signal.aborted) applyHealth(result)
    } catch {
      if (!request.signal.aborted) applyHealth(null)
    } finally {
      if (controller === request) scheduleHealth()
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

  return { configuration, configurationFresh, health, refreshing, error, lastChecked, backendStatus, databaseStatus, statusMessage, refresh, start, dispose }
}
