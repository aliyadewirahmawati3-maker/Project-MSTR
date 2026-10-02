import { laneModeForZones } from '../utils/laneMode.js'
import { computed, ref, shallowRef, watch } from 'vue'
import { aspectRatioTolerance, sourceIdentities, zoneProfiles } from '../config/queueZones.js'
import { fingerprintVideo, matchVideoIdentity, profileIssue } from '../utils/zoneProfiles.js'
import { copyZones, validateLocalZones } from '../utils/localZoneCalibration.js'

export function useVideoZoneProfile(registration, { fingerprint = fingerprintVideo, cameraCode = '', defaultCalibrationMode = 'DUAL_LANE' } = {}) {
  const identity = shallowRef(null)
  const sourceHash = ref('')
  const identification = ref('empty')
  const declaredCamera = ref('')
  const selectedProfile = ref('')
  const sameViewConfirmed = ref(false)
  const analysisResult = shallowRef(null)
  const editing = ref(false), draftZones = ref([]), savedCalibration = shallowRef(null)
  const localApplied = ref(false), calibrationRevision = ref(0), calibrationError = ref('')
  const inputCameraCode = computed(() => identity.value?.camera_code || declaredCamera.value)
  const selected = computed(() => zoneProfiles.find(p => p.profile_id === selectedProfile.value) || null)
  const localProfile = computed(() => {
    const saved = savedCalibration.value
    if (!localApplied.value || !saved || saved.version !== registration.version.value ||
      saved.cameraCode !== inputCameraCode.value || saved.profileId !== selectedProfile.value) return null
    return { ...selected.value, reference_frame: { width: saved.metadata.width, height: saved.metadata.height,
      aspect_ratio: saved.metadata.width / saved.metadata.height }, zones: saved.zones, lane_mode: laneModeForZones(saved.zones) }
  })
  const issue = computed(() => profileIssue(localProfile.value || selected.value, inputCameraCode.value, registration.metadata.value, aspectRatioTolerance) ||
    (!identity.value && !sameViewConfirmed.value && !localProfile.value ? 'Sudut kamera belum terverifikasi; konfirmasi atau kalibrasi zona video ini.' : ''))
  const activeProfile = computed(() => registration.state.value === 'ready' && identification.value !== 'checking' &&
    !editing.value && (identity.value || sameViewConfirmed.value || localApplied.value) && !issue.value ? localProfile.value || selected.value : null)
  const activeZones = computed(() => activeProfile.value?.zones || [])
  const canAnalyzeZones = computed(() => activeProfile.value !== null)
  const status = computed(() => identification.value === 'checking' ? 'Memeriksa identitas sumber lokal…' :
    activeProfile.value ? 'Zona aktif' : 'Kalibrasi zona diperlukan')

  function reset() {
    identity.value = null
    sourceHash.value = ''
    identification.value = 'empty'
    declaredCamera.value = ''
    selectedProfile.value = ''
    sameViewConfirmed.value = false
    analysisResult.value = null
    editing.value = false; draftZones.value = []; savedCalibration.value = null; localApplied.value = false
    calibrationError.value = ''; calibrationRevision.value++
  }
  // Invalidate zones/results synchronously, before replacement media can load.
  const stopReset = watch(registration.version, reset, { flush: 'sync' })
  const stopIdentify = watch(registration.version, async (_, __, onCleanup) => {
    let cancelled = false
    onCleanup(() => { cancelled = true })
    const file = registration.file.value, version = registration.version.value
    if (!file) return
    // The card camera is a candidate, never evidence that an unknown video has the same view.
    declaredCamera.value = cameraCode
    selectedProfile.value = zoneProfiles.find(profile => profile.camera_code === cameraCode)?.profile_id || ''
    identification.value = 'checking'
    try {
      const hash = await fingerprint(file)
      if (cancelled || !registration.isCurrent(version)) return
      sourceHash.value = hash
      identity.value = matchVideoIdentity(hash, sourceIdentities, zoneProfiles)
      if (identity.value) selectedProfile.value = identity.value.profile_id
      identification.value = identity.value ? 'registered' : 'unknown'
    } catch {
      if (!cancelled && registration.isCurrent(version)) identification.value = 'unknown'
    }
  }, { flush: 'post' })
  const stopResults = watch(activeProfile, () => { analysisResult.value = null }, { flush: 'sync' })

  function chooseCamera(code) {
    if (identity.value || identification.value === 'checking') return
    declaredCamera.value = code
    selectedProfile.value = zoneProfiles.find(profile => profile.camera_code === code)?.profile_id || ''
    clearCalibration()
    sameViewConfirmed.value = false
    analysisResult.value = null
  }
  function chooseProfile(id) {
    if (identification.value === 'checking') return
    selectedProfile.value = id
    clearCalibration()
    sameViewConfirmed.value = false
    analysisResult.value = null
  }
  function confirmSameView(value) { sameViewConfirmed.value = value === true; analysisResult.value = null }
  function clearCalibration() {
    editing.value = false; draftZones.value = []; savedCalibration.value = null; localApplied.value = false
    calibrationError.value = ''; calibrationRevision.value++
  }
  function beginCalibration() {
    if (registration.state.value !== 'ready' || identification.value === 'checking' || !selected.value || selected.value.camera_code !== inputCameraCode.value) return false
    const wasLocallyCalibrated = localApplied.value
    draftZones.value = copyZones(activeZones.value.length ? activeZones.value : selected.value.zones)
    editing.value = true; localApplied.value = false; savedCalibration.value = null
    sameViewConfirmed.value = false; calibrationError.value = ''; calibrationRevision.value++
    if (!wasLocallyCalibrated && defaultCalibrationMode === 'SINGLE_QUEUE') chooseLaneMode('SINGLE_QUEUE')
    return true
  }
  function chooseLaneMode(mode) {
    if (!editing.value || !['SINGLE_QUEUE', 'DUAL_LANE'].includes(mode)) return
    if (mode === laneModeForZones(draftZones.value)) return
    if (mode === 'SINGLE_QUEUE') {
      const base = draftZones.value[0]
      draftZones.value = [{ ...base, id: `${inputCameraCode.value}-queue`, laneType: 'queue',
        label: 'Antrean', movementRule: 'QUEUE', movementLabel: 'antrean utama', polygon: base.polygon.map(p => [...p]) }]
    } else draftZones.value = copyZones(selected.value.zones)
    savedCalibration.value = null; calibrationError.value = ''; calibrationRevision.value++
  }
  function movePoint(zoneId, index, point) {
    if (!editing.value || !point?.every(value => Number.isFinite(value) && value >= 0 && value <= 1)) return
    const zone = draftZones.value.find(zone => zone.id === zoneId)
    if (!zone?.polygon[index]) return
    zone.polygon[index] = [...point]
    savedCalibration.value = null; calibrationError.value = ''
  }
  function saveCalibration() {
    if (!editing.value || registration.state.value !== 'ready' || !selected.value || selected.value.camera_code !== inputCameraCode.value) return false
    try { validateLocalZones(draftZones.value, inputCameraCode.value) } catch (error) { calibrationError.value = error.message; return false }
    savedCalibration.value = { version: registration.version.value, cameraCode: inputCameraCode.value,
      profileId: selectedProfile.value, sourceHash: sourceHash.value,
      metadata: { ...registration.metadata.value }, zones: copyZones(draftZones.value) }
    calibrationError.value = ''
    return true
  }
  function useCalibration() {
    if (!savedCalibration.value || savedCalibration.value.version !== registration.version.value || registration.state.value !== 'ready') return false
    localApplied.value = true; sameViewConfirmed.value = true; editing.value = false; calibrationRevision.value++
    return true
  }
  function resetToProfile() {
    const wasEditing = editing.value, confirmed = sameViewConfirmed.value && !localApplied.value
    clearCalibration(); sameViewConfirmed.value = false
    const compatible = !profileIssue(selected.value, inputCameraCode.value, registration.metadata.value, aspectRatioTolerance)
    sameViewConfirmed.value = compatible && confirmed
    // Restore active defaults for a trusted view. Unknown or incompatible views stay in the editor.
    if (wasEditing && selected.value && !(compatible && (identity.value || confirmed))) {
      draftZones.value = copyZones(selected.value.zones); editing.value = true
    }
  }
  function dispose() { stopReset(); stopIdentify(); stopResults(); reset() }
  return { identity, sourceHash, identification, inputCameraCode, selectedProfile, sameViewConfirmed, analysisResult,
    editing, draftZones, savedCalibration, localApplied, calibrationRevision, calibrationError,
    chooseLaneMode, beginCalibration, movePoint, saveCalibration, useCalibration, resetToProfile,
    activeProfile, activeZones, canAnalyzeZones, issue, status, chooseCamera, chooseProfile, confirmSameView, dispose }
}
