import { computed, ref, shallowRef, watch } from 'vue'
import { aspectRatioTolerance, sourceIdentities, zoneProfiles } from '../config/queueZones.js'
import { fingerprintVideo, profileIssue } from '../utils/zoneProfiles.js'

export function useVideoZoneProfile(registration, { fingerprint = fingerprintVideo } = {}) {
  const identity = shallowRef(null)
  const identification = ref('empty')
  const declaredCamera = ref('')
  const selectedProfile = ref('')
  const sameViewConfirmed = ref(false)
  const analysisResult = shallowRef(null) // No analysis is implemented; never synthesize results.
  const inputCameraCode = computed(() => identity.value?.camera_code || declaredCamera.value)
  const selected = computed(() => zoneProfiles.find(p => p.profile_id === selectedProfile.value) || null)
  const issue = computed(() => profileIssue(selected.value, inputCameraCode.value, registration.metadata.value, aspectRatioTolerance))
  const activeProfile = computed(() => registration.state.value === 'ready' && identification.value !== 'checking' &&
    (identity.value || sameViewConfirmed.value) && !issue.value ? selected.value : null)
  const activeZones = computed(() => activeProfile.value?.zones || [])
  const canAnalyzeZones = computed(() => activeProfile.value !== null)
  const status = computed(() => identification.value === 'checking' ? 'Memeriksa identitas sumber lokal…' :
    activeProfile.value ? 'Zona konfigurasi siap — menunggu analisis AI' : 'Zona antrean belum dikalibrasi untuk sumber ini')

  function reset() {
    identity.value = null
    identification.value = 'empty'
    declaredCamera.value = ''
    selectedProfile.value = ''
    sameViewConfirmed.value = false
    analysisResult.value = null
  }
  // Invalidate zones/results synchronously, before replacement media can load.
  const stopReset = watch(registration.version, reset, { flush: 'sync' })
  const stopIdentify = watch(registration.version, async (_, __, onCleanup) => {
    let cancelled = false
    onCleanup(() => { cancelled = true })
    const file = registration.file.value, version = registration.version.value
    if (!file) return
    identification.value = 'checking'
    try {
      const hash = await fingerprint(file)
      if (cancelled || !registration.isCurrent(version)) return
      identity.value = sourceIdentities.find(item => item.source_sha256 === hash && item.viewpoint_confirmed === true) || null
      selectedProfile.value = identity.value?.profile_id || ''
      identification.value = identity.value ? 'registered' : 'unknown'
    } catch {
      if (!cancelled && registration.isCurrent(version)) identification.value = 'unknown'
    }
  }, { flush: 'post' })
  const stopResults = watch(activeProfile, () => { analysisResult.value = null }, { flush: 'sync' })

  function chooseCamera(code) {
    if (identity.value || identification.value === 'checking') return
    declaredCamera.value = code
    sameViewConfirmed.value = false
    analysisResult.value = null
  }
  function chooseProfile(id) {
    selectedProfile.value = id
    sameViewConfirmed.value = false
    analysisResult.value = null
  }
  function confirmSameView(value) { sameViewConfirmed.value = value === true; analysisResult.value = null }
  function dispose() { stopReset(); stopIdentify(); stopResults(); reset() }
  return { identity, identification, inputCameraCode, selectedProfile, sameViewConfirmed, analysisResult,
    activeProfile, activeZones, canAnalyzeZones, issue, status, chooseCamera, chooseProfile, confirmSameView, dispose }
}
