<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import QueueZoneOverlay from './QueueZoneOverlay.vue'
import { zoneProfiles } from '../config/queueZones.js'
import { useVideoZoneProfile } from '../composables/useVideoZoneProfile.js'
import { directionLabel, movementLabel } from '../services/sigapApi.js'
import { useLocalVideo } from '../composables/useLocalVideo.js'
import { formatDuration, localVideoAccept } from '../utils/localVideo.js'

const props = defineProps({ camera: { type: Object, required: true } })
const registration = useLocalVideo()
const zoneSession = useVideoZoneProfile(registration)
const { identity, identification, inputCameraCode, selectedProfile, sameViewConfirmed,
  activeZones: zones, canAnalyzeZones, status: zoneStatus, issue: zoneIssue } = zoneSession
const { file, source, version, state, metadata, failure, selectionError, playback, status } = registration
const picker = ref(null)
const videoElement = ref(null)
const showZones = ref(true)
const name = computed(() => `CCTV ${directionLabel(zoneProfiles.find(p => p.camera_code === inputCameraCode.value)?.direction || props.camera.direction)}`)
const token = event => Number(event.target.dataset.sourceVersion)

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
onBeforeUnmount(() => { zoneSession.dispose(); registration.dispose() })
</script>

<template>
  <article class="camera-card" :aria-label="`${name}, rekaman lokal offline`">
    <div class="camera-heading"><h3><AppIcon name="camera" :size="16" />{{ name }}</h3><span class="camera-number">{{ inputCameraCode || camera.camera_code }}</span></div>
    <div class="camera-frame">
      <video
        v-if="source"
        ref="videoElement"
        v-show="state !== 'error'"
        :key="version"
        :data-source-version="version"
        :src="source"
        class="camera-video"
        :aria-label="`${name} — REKAMAN LOKAL / OFFLINE DEMO`"
        muted playsinline loop autoplay controls preload="auto"
        @loadedmetadata="registration.readMetadata($event.target, token($event))"
        @loadeddata="loaded"
        @playing="registration.setPlayback('Memutar rekaman', token($event))"
        @pause="registration.setPlayback('Rekaman dijeda · tekan Putar', token($event))"
        @waiting="registration.setPlayback('Menunggu buffer rekaman…', token($event))"
        @error="registration.failed($event.target.error?.code, token($event))"
      >Browser ini tidak mendukung pemutaran video HTML5.</video>
      <QueueZoneOverlay v-if="showZones && canAnalyzeZones" :key="`${version}-${selectedProfile}`" :video="videoElement" :zones="zones" />
      <span class="camera-standby camera-offline-badge">Rekaman lokal</span>
      <div v-if="state === 'empty' || state === 'error'" class="camera-empty"><AppIcon name="cameraOff" :size="30" /><p>{{ state === 'empty' ? 'PILIH REKAMAN LOKAL' : 'REKAMAN TIDAK DAPAT DIPUTAR' }}</p><span>File diputar di browser, tanpa diunggah.</span></div>
      <span class="frame-corner top-left"></span><span class="frame-corner bottom-right"></span>
    </div>
    <div class="camera-status-row" role="status">
      <span class="badge badge-neutral">Menunggu AI</span>
      <span v-if="state === 'loading'" class="camera-state-hint">Memuat video…</span>
      <span v-else-if="identification === 'checking'" class="camera-state-hint">Memeriksa sumber…</span>
      <span v-else-if="state === 'ready' && !canAnalyzeZones" class="camera-state-hint">Zona belum dikalibrasi</span>
    </div>
    <div class="local-video-controls">
      <input :id="`file-${camera.camera_code}`" ref="picker" class="local-video-picker" type="file" :accept="localVideoAccept" :aria-label="`Pilih video lokal ${name}`" @change="selected" />
      <button type="button" @click="picker.click()">{{ file ? 'Ganti video' : 'Pilih video lokal' }}</button>
      <button v-if="file" type="button" @click="registration.remove">Hapus video</button>
    </div>
    <p v-if="selectionError" class="local-video-error" role="alert">{{ selectionError }}</p>
    <div v-if="state === 'error'" class="camera-local-help">
      <p role="alert">{{ failure }}</p>
      <button type="button" @click="registration.retry">Coba lagi</button>
    </div>
    <div class="queue-zone-controls">
      <button type="button" :disabled="!canAnalyzeZones" :aria-pressed="showZones && canAnalyzeZones" :aria-label="`Zona antrean ${name}`" @click="showZones = !showZones">{{ showZones && canAnalyzeZones ? 'Zona aktif' : 'Tampilkan zona' }}</button>
      <span class="queue-zone-legend"><span><i class="outer"></i>Luar</span><span><i class="inner"></i>Dalam</span></span>
    </div>
    <details :key="version" class="compact-details source-details">
      <summary>Detail sumber <span v-if="state === 'ready' && !canAnalyzeZones && identification !== 'checking'">· pilih profile</span></summary>
      <div class="compact-details-body">
        <p class="queue-zone-note">{{ status }}<span v-if="playback"> · {{ playback }}</span></p>
        <dl v-if="file" class="local-video-metadata">
          <div><dt>File</dt><dd>{{ file.name }}</dd></div>
          <div><dt>Resolusi</dt><dd>{{ metadata ? `${metadata.width} × ${metadata.height}` : 'Belum tersedia' }}</dd></div>
          <div><dt>Durasi</dt><dd>{{ metadata ? formatDuration(metadata.duration) : 'Belum tersedia' }}</dd></div>
        </dl>
        <div v-if="file" class="zone-profile-controls">
          <p v-if="identity">Sumber terdaftar: {{ identity.camera_code }} · SHA256 cocok</p>
          <label v-else>Sumber kamera
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
          <label v-if="!identity && identification !== 'checking'" class="zone-confirm"><input type="checkbox" :checked="sameViewConfirmed" @change="zoneSession.confirmSameView($event.target.checked)" />Saya memastikan kamera, sudut, dan cakupan gambar sama dengan profile.</label>
          <p v-if="!canAnalyzeZones && identification !== 'checking'">{{ zoneIssue }} Analisis zona dinonaktifkan.</p>
        </div>
        <dl class="lane-info"><div v-for="lane in zones" :key="lane.id"><dt>{{ lane.laneType === 'outer' ? 'Lajur luar' : 'Lajur dalam' }}</dt><dd>{{ movementLabel(lane.movementRule) }}</dd></div></dl>
        <p v-if="file" class="queue-zone-note">{{ zoneStatus }}</p>
        <p class="queue-zone-note">Zona manual untuk demo. Kalibrasi ulang jika sudut rekaman berubah.</p>
        <p class="queue-zone-note">Video ini diputar di browser; belum dianalisis AI. Akses file tidak disimpan permanen. Setelah refresh, pilih ulang video.</p>
      </div>
    </details>
  </article>
</template>

<style scoped>
.camera-status-row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.camera-state-hint { color: #738399; font-size: 10px; }
.camera-heading { flex-wrap: wrap; gap: 5px; }
.camera-number { font-size: 9px; letter-spacing: .3px; }
.source-details { margin-top: 10px; }
.source-details summary > span { font-size: 9px; color: #916612; }
.zone-profile-controls { margin-top: 8px; display: grid; gap: 6px; font-size: 10px; color: #738399; }
.zone-profile-controls label { display: grid; gap: 4px; }
.zone-profile-controls select { min-width: 0; width: 100%; padding: 5px; border: 1px solid #d6e1ef; border-radius: 4px; background: #fff; color: #496681; font-size: 10px; }
.zone-profile-controls .zone-confirm { display: flex; align-items: flex-start; line-height: 1.5; }
.queue-zone-controls button:disabled { opacity: .6; cursor: not-allowed; }
.local-video-controls { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.local-video-picker { display: none; }
.local-video-controls button { padding: 5px 7px; border: 1px solid #d6e1ef; border-radius: 4px; background: #edf4fd; color: #496681; font-size: 10px; }
.local-video-controls button:focus-visible { outline: 2px solid #3988ed; outline-offset: 2px; }
.local-video-metadata { margin-top: 8px; display: grid; gap: 4px; font-size: 10px; color: #738399; }
.local-video-metadata > div { display: flex; gap: 8px; justify-content: space-between; }
.local-video-metadata dt { flex-shrink: 0; }
.local-video-metadata dd { overflow-wrap: anywhere; min-width: 0; text-align: right; }
.local-video-error { margin-top: 7px; color: #a44132; font-size: 10px; line-height: 1.5; }
.queue-zone-controls { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 7px; margin-top: 10px; }
.queue-zone-controls button { padding: 5px 7px; border: 1px solid #d6e1ef; border-radius: 4px; background: #f3f6fa; color: #496681; font-size: 10px; }
.queue-zone-controls button[aria-pressed="true"] { background: #edf4fd; border-color: #abcaf1; }
.queue-zone-controls button:focus-visible { outline: 2px solid #3988ed; outline-offset: 2px; }
.queue-zone-legend, .queue-zone-legend > span { display: inline-flex; align-items: center; gap: 5px; font-size: 9px; color: #738399; }
.queue-zone-legend { gap: 8px; }
.queue-zone-legend i { width: 8px; height: 8px; border-radius: 2px; }
.queue-zone-legend .outer { background: #3988ed; }
.queue-zone-legend .inner { background: #ed873c; }
.queue-zone-note { margin-top: 5px; color: #738399; font-size: 9px; line-height: 1.5; }
</style>
