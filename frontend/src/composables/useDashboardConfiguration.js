import { computed, ref } from 'vue'
import { getDashboardConfiguration, getHealth } from '../services/sigapApi.js'

export function useDashboardConfiguration() {
  const configuration = ref(null)
  const health = ref(null)
  const refreshing = ref(false)
  const error = ref('')
  const lastChecked = ref('')
  let controller
  const backendStatus = computed(() => health.value ? 'Online' : 'Offline')
  const databaseStatus = computed(() => !health.value ? 'Tidak diketahui' : health.value.database.connected ? 'Online' : 'Offline')
  const statusMessage = computed(() => refreshing.value
    ? 'Memuat konfigurasi simpang…'
    : error.value || `Backend ${backendStatus.value.toLowerCase()} · Database ${databaseStatus.value.toLowerCase()}`)

  async function refresh() {
    if (refreshing.value) return
    refreshing.value = true
    error.value = ''
    health.value = null
    // Clear stale configuration so camera/mode labels cannot imply a live status.
    configuration.value = null
    controller = new AbortController()
    const signal = controller.signal
    try {
      const [healthResult, configurationResult] = await Promise.allSettled([
        getHealth(signal), getDashboardConfiguration(signal),
      ])
      if (signal.aborted) return
      if (healthResult.status === 'fulfilled') health.value = healthResult.value
      if (configurationResult.status === 'fulfilled') configuration.value = configurationResult.value
      if (healthResult.status === 'rejected') {
        error.value = 'Backend tidak dapat dihubungi; simulator lokal tetap aktif.'
      } else if (!health.value.database.connected || health.value.status !== 'ok') {
        error.value = 'Backend online; database atau layanan terganggu. Simulator lokal tetap aktif.'
      } else if (configurationResult.status === 'rejected') {
        error.value = 'Konfigurasi simpang gagal dimuat; simulator lokal tetap aktif. Tekan Refresh Status untuk mencoba lagi.'
      }
      lastChecked.value = new Intl.DateTimeFormat('id-ID', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta',
      }).format(new Date()).replaceAll('.', ':')
    } finally {
      refreshing.value = false
    }
  }

  return { configuration, health, refreshing, error, lastChecked, backendStatus, databaseStatus, statusMessage, refresh, dispose: () => controller?.abort() }
}
