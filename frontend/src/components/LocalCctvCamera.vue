<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import QueueZoneOverlay from './QueueZoneOverlay.vue'
import { zonesForCamera } from '../config/queueZones.js'
import { directionLabel, movementLabel } from '../services/sigapApi.js'
import { useLocalVideo } from '../composables/useLocalVideo.js'
import { formatDuration, localVideoAccept } from '../utils/localVideo.js'

const props = defineProps({ camera: { type: Object, required: true } })
const registration = useLocalVideo()
const { file, source, version, state, metadata, failure, selectionError, playback, status } = registration
const picker = ref(null)
const videoElement = ref(null)
const showZones = ref(true)
const zones = computed(() => zonesForCamera(props.camera.camera_code))
const name = computed(() => `CCTV ${directionLabel(props.camera.direction)}`)
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
onBeforeUnmount(registration.dispose)
</script>

<template>
  <article class="camera-card" :aria-label="`${name}, rekaman lokal offline`">
    <div class="camera-heading"><h3><AppIcon name="camera" :size="16" />{{ name }}</h3><span class="camera-number">{{ camera.camera_code }}</span></div>
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
      <QueueZoneOverlay v-if="showZones && state === 'ready'" :video="videoElement" :zones="zones" />
      <span class="camera-standby camera-offline-badge">REKAMAN LOKAL / OFFLINE DEMO</span>
      <div v-if="state === 'empty' || state === 'error'" class="camera-empty"><AppIcon name="cameraOff" :size="30" /><p>{{ state === 'empty' ? 'PILIH REKAMAN LOKAL' : 'REKAMAN TIDAK DAPAT DIPUTAR' }}</p><span>File diputar di browser, tanpa diunggah.</span></div>
      <span class="frame-corner top-left"></span><span class="frame-corner bottom-right"></span>
    </div>
    <p class="camera-playback-status" role="status">{{ status }}</p>
    <p v-if="playback" class="queue-zone-note">{{ playback }}</p>
    <div class="local-video-controls">
      <input :id="`file-${camera.camera_code}`" ref="picker" class="local-video-picker" type="file" :accept="localVideoAccept" :aria-label="`Pilih video lokal ${name}`" @change="selected" />
      <button type="button" @click="picker.click()">{{ file ? 'Ganti video' : 'Pilih video lokal' }}</button>
      <button v-if="file" type="button" @click="registration.remove">Hapus video</button>
    </div>
    <p class="queue-zone-note">Akses file tidak disimpan permanen. Setelah refresh, pilih ulang video.</p>
    <p v-if="selectionError" class="local-video-error" role="alert">{{ selectionError }}</p>
    <dl v-if="file" class="local-video-metadata">
      <div><dt>File</dt><dd>{{ file.name }}</dd></div>
      <div><dt>Resolusi</dt><dd>{{ metadata ? `${metadata.width} × ${metadata.height}` : 'Belum tersedia' }}</dd></div>
      <div><dt>Durasi</dt><dd>{{ metadata ? formatDuration(metadata.duration) : 'Belum tersedia' }}</dd></div>
    </dl>
    <div v-if="state === 'error'" class="camera-local-help">
      <p>{{ failure }}</p>
      <button type="button" @click="registration.retry">Coba lagi</button>
    </div>
    <dl class="lane-info"><div v-for="lane in camera.zones" :key="lane.zone_id"><dt>{{ lane.lane_type === 'outer' ? 'Lajur luar' : 'Lajur dalam' }}</dt><dd>{{ movementLabel(lane.movement_rules) }}</dd></div></dl>
    <div class="queue-zone-controls">
      <button type="button" :aria-pressed="showZones" :aria-label="`Zona antrean ${name}`" @click="showZones = !showZones">Zona antrean <span>{{ showZones ? 'Aktif' : 'Nonaktif' }}</span></button>
      <span class="queue-zone-legend"><span><i class="outer"></i>Luar</span><span><i class="inner"></i>Dalam</span></span>
    </div>
    <p class="queue-zone-note">Konfigurasi manual untuk demo. Periksa kesesuaian zona jika sudut rekaman berbeda.</p>
    <p class="queue-zone-note">Zona konfigurasi siap — menunggu analisis AI</p>
  </article>
</template>

<style scoped>
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
.queue-zone-controls button > span { margin-left: 4px; font-size: 9px; }
.queue-zone-legend, .queue-zone-legend > span { display: inline-flex; align-items: center; gap: 5px; font-size: 9px; color: #738399; }
.queue-zone-legend { gap: 8px; }
.queue-zone-legend i { width: 8px; height: 8px; border-radius: 2px; }
.queue-zone-legend .outer { background: #3988ed; }
.queue-zone-legend .inner { background: #ed873c; }
.queue-zone-note { margin-top: 5px; color: #738399; font-size: 9px; line-height: 1.5; }
</style>
