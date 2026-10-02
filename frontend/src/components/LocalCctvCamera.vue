<script setup>
import { laneModeForZones, zoneLaneLabel } from '../utils/laneMode.js'
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'
import DetectionOverlay from './DetectionOverlay.vue'
import { useFrameInference } from '../composables/useFrameInference.js'
import AppIcon from './AppIcon.vue'
import QueueZoneOverlay from './QueueZoneOverlay.vue'
import QueueZoneEditor from './QueueZoneEditor.vue'
import { zoneProfiles } from '../config/queueZones.js'
import { useVideoZoneProfile } from '../composables/useVideoZoneProfile.js'
import { directionLabel } from '../services/sigapApi.js'
import { useLocalVideo } from '../composables/useLocalVideo.js'
import { formatDuration, localVideoAccept } from '../utils/localVideo.js'
import { DEFAULT_OVERLAY_CONFIDENCE, overlayConfidence } from '../utils/detectionOverlay.js'

const props = defineProps({ camera: { type: Object, required: true } })
const registration = useLocalVideo()
const zoneSession = useVideoZoneProfile(registration, { cameraCode: props.camera.camera_code, defaultCalibrationMode: 'SINGLE_QUEUE' })
const { identity, identification, inputCameraCode, selectedProfile, sameViewConfirmed,
  activeZones: zones, canAnalyzeZones, issue: zoneIssue, status: zoneStatus,
  editing, draftZones, savedCalibration, calibrationError } = zoneSession
const { file, source, version, state, metadata, failure, selectionError } = registration
const picker = ref(null)
const videoElement = ref(null)
const videoFrame = ref(null)
const fullscreenError = ref('')
const inference = useFrameInference(videoElement, registration, zoneSession, props.camera, inject('localInference'))
const { result: detectionResult, detections, enabled: inferenceEnabled, label: inferenceLabel, fps, roundTripMs, sampleIntervalMs } = inference
const showZones = ref(true)
const displayedZones = computed(() => editing.value ? draftZones.value : zones.value)
const displayedLaneMode = computed(() => laneModeForZones(displayedZones.value))
watch(canAnalyzeZones, active => { if (active) showZones.value = true })
const overlayMode = ref('compact')
const showOutside = ref(true)
const minConfidence = ref(DEFAULT_OVERLAY_CONFIDENCE)
const overlayThreshold = computed(() => overlayConfidence(minConfidence.value))
const expanded = ref(false)
const name = computed(() => `CCTV ${directionLabel(zoneProfiles.find(p => p.camera_code === inputCameraCode.value)?.direction || props.camera.direction)}`)
const token = event => Number(event.target.dataset.sourceVersion)
async function fullscreen() {
  fullscreenError.value = ''
  try {
    if (document.fullscreenElement === videoFrame.value) await document.exitFullscreen()
    else await videoFrame.value?.requestFullscreen()
  } catch { fullscreenError.value = 'Layar penuh tidak tersedia pada browser ini.' }
}

function selected(event) {
  registration.select(event.target.files?.[0])
  event.target.value = '' // Allow selecting the same file again after an error.
}

async function loaded(event) {
  const video = event.target
  const currentVersion = token(event)
  if (!registration.ready(video, currentVersion)) return
  // Native controls remain available if autoplay is denied by browser policy.
  try {
    video.muted = true
    if (video.paused) await video.play()
  } catch {
    registration.setPlayback('Autoplay tidak dimulai · tekan Putar', currentVersion)
  }
}
onBeforeUnmount(() => { inference.dispose(); zoneSession.dispose(); registration.dispose() })
</script>

<template>
  <article class="camera-card" :class="{ 'camera-expanded': expanded }" :aria-label="`${name}, rekaman lokal offline`">
    <div class="camera-heading"><h3><AppIcon name="camera" :size="16" />{{ name }}</h3><span class="camera-number">{{ inputCameraCode || camera.camera_code }}</span></div>
    <div ref="videoFrame" class="camera-frame">
      <video
        v-if="source"
        ref="videoElement"
        v-show="state !== 'error'"
        :key="version"
        :data-source-version="version"
        :src="source"
        class="camera-video"
        :aria-label="`${name} — REKAMAN LOKAL / OFFLINE DEMO`"
        muted playsinline loop autoplay controls controlslist="nofullscreen" preload="auto"
        @loadedmetadata="registration.readMetadata($event.target, token($event))"
        @loadeddata="loaded"
        @playing="registration.setPlayback('Memutar rekaman', token($event))"
        @pause="registration.setPlayback('Rekaman dijeda · tekan Putar', token($event))"
        @waiting="registration.setPlayback('Menunggu buffer rekaman…', token($event))"
        @error="registration.failed($event.target.error?.code, token($event))"
      >Browser ini tidak mendukung pemutaran video HTML5.</video>
      <QueueZoneOverlay v-if="showZones && canAnalyzeZones" :key="`${version}-${selectedProfile}`" :video="videoElement" :zones="zones" />
      <QueueZoneEditor v-if="editing" :key="version" :video="videoElement" :zones="draftZones" @move-point="zoneSession.movePoint" />
      <DetectionOverlay v-if="inferenceEnabled" :video="videoElement" :detections="detections" :mode="overlayMode" :min-confidence="overlayThreshold" :show-outside="showOutside" />
      <button type="button" class="exit-camera-fullscreen" @click="fullscreen">Keluar layar penuh</button>
      <span class="camera-standby camera-offline-badge">Rekaman lokal</span>
      <div v-if="state === 'empty' || state === 'error'" class="camera-empty"><AppIcon name="cameraOff" :size="30" /><p>{{ state === 'empty' ? 'PILIH REKAMAN LOKAL' : 'REKAMAN TIDAK DAPAT DIPUTAR' }}</p><span>Video lokal · snapshot YOLO hanya ke localhost.</span></div>
      <span class="frame-corner top-left"></span><span class="frame-corner bottom-right"></span>
    </div>
    <div class="camera-status-row" role="status">
      <span class="badge badge-neutral">{{ inferenceLabel }}</span>
      <span v-if="inferenceEnabled && detectionResult && detections.length" class="camera-state-hint">Frame {{ detectionResult.video_time_seconds.toFixed(1) }} dtk</span>
      <span v-if="state === 'loading'" class="camera-state-hint">Memuat video…</span>
      <span v-else-if="identification === 'checking'" class="camera-state-hint">Memeriksa sumber…</span>
      <span v-else-if="state === 'ready' && !canAnalyzeZones" class="camera-state-hint">Zona belum dikalibrasi</span>
    </div>
    <div class="local-video-controls">
      <input :id="`file-${camera.camera_code}`" ref="picker" class="local-video-picker" type="file" :accept="localVideoAccept" :aria-label="`Pilih video lokal ${name}`" @change="selected" />
      <button type="button" @click="picker.click()">{{ file ? 'Ganti video' : 'Pilih video lokal' }}</button>
      <button v-if="file" type="button" @click="registration.remove">Hapus video</button>
      <button type="button" :aria-pressed="expanded" @click="expanded = !expanded">{{ expanded ? 'Ringkas preview' : 'Perbesar preview' }}</button>
      <button v-if="source" type="button" @click="fullscreen">Layar penuh + zona</button>
    </div>
    <div v-if="inferenceEnabled" class="overlay-controls">
      <label>Target inference<select v-model.number="fps"><option :value="1">1 FPS per kamera</option><option :value="2">2 FPS adaptif per kamera</option></select></label>
      <label>Overlay<select v-model="overlayMode"><option value="compact">Ringkas · kelas</option><option value="detail">Detail · kelas + confidence</option></select></label>
      <label>Confidence minimum<input v-model.number="minConfidence" type="number" min="0" max="1" step="0.05" :placeholder="String(DEFAULT_OVERLAY_CONFIDENCE)" /></label>
      <label>Bbox luar zona<select v-model="showOutside"><option :value="true">Tampilkan abu-abu tipis</option><option :value="false">Sembunyikan</option></select></label>
      <p>Bbox hijau masuk zona antrean. Bbox abu-abu adalah deteksi umum yang tidak dihitung sebagai antrean.</p>
      <p>Ambang tampilan: {{ Math.round(overlayThreshold * 100) }}%. Jumlah antrean tetap memakai hasil inference valid.</p>
      <p>Interval efektif: {{ sampleIntervalMs }} ms<span v-if="roundTripMs !== null"> · Request terakhir: {{ Math.round(roundTripMs) }} ms</span>. 2 FPS digunakan jika request selesai dalam 500 ms; frame dibuang saat model sibuk.</p>
    </div>
    <p v-if="selectionError" class="local-video-error" role="alert">{{ selectionError }}</p>
    <p v-if="metadata" class="camera-state-hint">{{ metadata.width }} × {{ metadata.height }} · Rasio {{ metadata.aspect_ratio.toFixed(3) }} · {{ formatDuration(metadata.duration) }}</p>
    <p v-if="fullscreenError" class="local-video-error" role="status">{{ fullscreenError }}</p>
    <div v-if="state === 'error'" class="camera-local-help">
      <p role="alert">{{ failure }}</p>
      <button type="button" @click="registration.retry">Coba lagi</button>
    </div>
    <div class="queue-zone-controls">
      <span class="camera-state-hint" role="status">{{ zoneStatus }}</span>
      <button type="button" :disabled="!canAnalyzeZones" :aria-pressed="showZones && canAnalyzeZones" :aria-label="`Zona antrean ${name}`" @click="showZones = !showZones">{{ showZones && canAnalyzeZones ? 'Zona aktif' : 'Tampilkan zona' }}</button>
      <span class="queue-zone-legend"><span v-for="zone in displayedZones" :key="zone.id"><i :class="zone.laneType"></i>{{ zoneLaneLabel(zone.laneType) }}</span></span>
    </div>
    <div v-if="file && (!canAnalyzeZones || editing)" class="zone-profile-controls" aria-label="Kalibrasi zona">
      <label v-if="!identity">Sumber kamera
        <select :value="inputCameraCode" :disabled="identification === 'checking'" @change="zoneSession.chooseCamera($event.target.value)">
          <option value="">Belum dikenal / kamera baru</option>
          <option v-for="profile in zoneProfiles" :key="profile.camera_code" :value="profile.camera_code">{{ profile.camera_code }} — {{ directionLabel(profile.direction) }}</option>
        </select>
      </label>
      <label>Profile zona
        <select :value="selectedProfile" :disabled="identification === 'checking'" @change="zoneSession.chooseProfile($event.target.value)">
          <option value="">Belum dipilih</option>
          <option v-for="profile in zoneProfiles" :key="profile.profile_id" :value="profile.profile_id">{{ profile.profile_id }} — {{ directionLabel(profile.direction) }}</option>
        </select>
      </label>
      <label v-if="!identity && !editing && identification !== 'checking'" class="zone-confirm"><input type="checkbox" :checked="sameViewConfirmed" @change="zoneSession.confirmSameView($event.target.checked)" />Saya memastikan kamera, sudut, dan cakupan gambar sama dengan profile.</label>
      <p v-if="!canAnalyzeZones && identification !== 'checking'">{{ zoneIssue }} Analisis zona dinonaktifkan.</p>
    </div>
    <div v-if="file" class="calibration-actions local-video-controls">
      <button type="button" :disabled="state !== 'ready' || identification === 'checking' || !selectedProfile" @click="zoneSession.beginCalibration">Kalibrasi zona</button>
      <button type="button" :disabled="!selectedProfile" @click="zoneSession.resetToProfile">Reset ke profile awal</button>
      <template v-if="editing">
        <label>Mode antrean<select :value="displayedLaneMode" @change="zoneSession.chooseLaneMode($event.target.value)"><option value="SINGLE_QUEUE">Satu zona antrean</option><option value="DUAL_LANE">Dua lajur</option></select></label>
        <button type="button" @click="zoneSession.saveCalibration">Simpan kalibrasi lokal</button>
        <button type="button" :disabled="!savedCalibration" @click="zoneSession.useCalibration">Gunakan untuk video ini</button>
        <p>Geser titik {{ displayedLaneMode === 'SINGLE_QUEUE' ? 'Antrean' : 'Luar/Dalam' }} pada video. Sesuaikan polygon dengan cakupan antrean utama sebelum menyimpan. Kalibrasi hanya berlaku untuk sesi video ini dan hilang saat video diganti atau halaman dimuat ulang.</p>
        <p v-if="savedCalibration" role="status">Kalibrasi tersimpan lokal. Pilih “Gunakan untuk video ini” untuk mengonfirmasi.</p>
      </template>
      <p v-if="calibrationError" class="local-video-error" role="alert">{{ calibrationError }}</p>
    </div>
  </article>
</template>

<style scoped>
.camera-expanded .camera-frame:fullscreen, .camera-frame:fullscreen { width: 100vw; height: 100vh; max-height: none; aspect-ratio: auto; border: 0; border-radius: 0; }
.exit-camera-fullscreen { display: none; }
.camera-frame:fullscreen .exit-camera-fullscreen { display: block; position: absolute; z-index: 5; top: 12px; left: 12px; padding: 10px; border-radius: 5px; background: #173b67; color: #fff; }
.calibration-actions p { flex-basis: 100%; font-size: 11px; color: #526780; line-height: 1.6; }
.camera-expanded { grid-column: 1 / -1; }
.camera-expanded .camera-frame { max-height: 70vh; }
.overlay-controls { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; padding: 10px; border: 1px solid #d6e1ef; border-radius: 6px; background: #fff; }
.overlay-controls label { display: grid; flex: 1 1 140px; gap: 5px; font-size: 11px; color: #526780; }
.overlay-controls select, .overlay-controls input { width: 100%; min-width: 0; min-height: 34px; padding: 6px; border: 1px solid #d6e1ef; border-radius: 4px; background: #fff; color: #213b5b; font: inherit; }
.overlay-controls p { flex-basis: 100%; font-size: 11px; color: #526780; line-height: 1.5; }
.camera-status-row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.camera-state-hint { color: #738399; font-size: 10px; }
.camera-heading { flex-wrap: wrap; gap: 5px; }
.camera-number { font-size: 9px; letter-spacing: .3px; }
.zone-profile-controls { margin-top: 8px; display: grid; gap: 6px; font-size: 10px; color: #738399; }
.zone-profile-controls label { display: grid; gap: 4px; }
.zone-profile-controls select { min-width: 0; width: 100%; padding: 5px; border: 1px solid #d6e1ef; border-radius: 4px; background: #fff; color: #496681; font-size: 10px; }
.zone-profile-controls .zone-confirm { display: flex; align-items: flex-start; line-height: 1.5; }
.queue-zone-controls button:disabled { opacity: .6; cursor: not-allowed; }
.local-video-controls { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.local-video-picker { display: none; }
.local-video-controls button { padding: 5px 7px; border: 1px solid #d6e1ef; border-radius: 4px; background: #edf4fd; color: #496681; font-size: 10px; }
.local-video-controls button:focus-visible { outline: 2px solid #3988ed; outline-offset: 2px; }
.local-video-error { margin-top: 7px; color: #a44132; font-size: 10px; line-height: 1.5; }
.queue-zone-controls { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 7px; margin-top: 10px; }
.queue-zone-controls button { padding: 5px 7px; border: 1px solid #d6e1ef; border-radius: 4px; background: #f3f6fa; color: #496681; font-size: 10px; }
.queue-zone-controls button[aria-pressed="true"] { background: #edf4fd; border-color: #abcaf1; }
.queue-zone-controls button:focus-visible { outline: 2px solid #3988ed; outline-offset: 2px; }
.queue-zone-legend, .queue-zone-legend > span { display: inline-flex; align-items: center; gap: 5px; font-size: 9px; color: #738399; }
.queue-zone-legend { gap: 8px; }
.queue-zone-legend i { width: 8px; height: 8px; border-radius: 2px; }
.queue-zone-legend .queue, .queue-zone-legend .outer { background: #3988ed; }
.queue-zone-legend .inner { background: #ed873c; }
.queue-zone-note { margin-top: 5px; color: #738399; font-size: 9px; line-height: 1.5; }
</style>
