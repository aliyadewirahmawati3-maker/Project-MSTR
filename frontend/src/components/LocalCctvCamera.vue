<script setup>
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import QueueZoneOverlay from './QueueZoneOverlay.vue'
import { zonesForCamera } from '../config/queueZones.js'
import { directionLabel, movementLabel } from '../services/sigapApi.js'

const props = defineProps({ camera: { type: Object, required: true } })
const state = ref('loading')
const attempt = ref(0)
const failure = ref('')
const videoElement = ref(null)
const showZones = ref(true)
const zones = computed(() => zonesForCamera(props.camera.camera_code))
const name = computed(() => `CCTV ${directionLabel(props.camera.direction)}`)
const source = computed(() => `${import.meta.env.BASE_URL}cctv-local/${props.camera.camera_code}.mp4?retry=${attempt.value}`)
const status = computed(() => ({
  loading: 'Memuat rekaman lokal…',
  ready: 'Rekaman tersedia · tekan Putar',
  playing: 'Memutar rekaman lokal',
  paused: 'Rekaman dijeda · tekan Putar',
  waiting: 'Menunggu buffer rekaman…',
  error: 'Rekaman belum tersedia / gagal dimuat',
})[state.value])

async function loaded(event) {
  const video = event.target
  const currentAttempt = attempt.value
  state.value = video.paused ? 'ready' : 'playing'
  // Native controls remain available if autoplay is denied by browser policy.
  try {
    video.muted = true
    if (video.paused) await video.play()
  } catch {
    if (attempt.value === currentAttempt && state.value !== 'error') state.value = 'ready'
  }
}

function failed(event) {
  state.value = 'error'
  const code = event.target.error?.code
  failure.value = code === 3
    ? 'Browser gagal membaca video. Coba browser dengan dukungan H.264.'
    : 'Asset video belum disiapkan, tidak dapat diakses, atau format tidak didukung.'
}

function retry() {
  failure.value = ''
  state.value = 'loading'
  attempt.value += 1
}
</script>

<template>
  <article class="camera-card" :aria-label="`${name}, rekaman lokal offline`">
    <div class="camera-heading"><h3><AppIcon name="camera" :size="16" />{{ name }}</h3><span class="camera-number">{{ camera.camera_code }}</span></div>
    <div class="camera-frame">
      <video
        ref="videoElement"
        v-show="state !== 'error'"
        :key="attempt"
        :src="source"
        class="camera-video"
        :aria-label="`${name} — REKAMAN LOKAL / OFFLINE DEMO`"
        muted playsinline loop autoplay controls preload="auto"
        @loadeddata="loaded"
        @playing="state = 'playing'"
        @pause="state !== 'error' && state !== 'loading' && (state = 'paused')"
        @waiting="state !== 'error' && (state = 'waiting')"
        @error="failed"
      >Browser ini tidak mendukung pemutaran video HTML5.</video>
      <QueueZoneOverlay v-if="showZones && state !== 'error'" :video="videoElement" :zones="zones" />
      <span class="camera-standby camera-offline-badge">REKAMAN LOKAL / OFFLINE DEMO</span>
      <div v-if="state === 'error'" class="camera-empty"><AppIcon name="cameraOff" :size="30" /><p>REKAMAN TIDAK DAPAT DIPUTAR</p><span>Siapkan asset lokal atau coba muat ulang.</span></div>
      <span class="frame-corner top-left"></span><span class="frame-corner bottom-right"></span>
    </div>
    <p class="camera-playback-status" role="status">{{ status }}</p>
    <div v-if="state === 'error'" class="camera-local-help">
      <p>{{ failure }}</p>
      <p>Dari root proyek, jalankan:</p>
      <code>npm.cmd --prefix frontend run cctv:prepare</code>
      <p>Untuk preview build, jalankan build ulang setelah penyiapan.</p>
      <button type="button" @click="retry">Coba lagi</button>
    </div>
    <dl class="lane-info"><div v-for="lane in camera.zones" :key="lane.zone_id"><dt>{{ lane.lane_type === 'outer' ? 'Lajur luar' : 'Lajur dalam' }}</dt><dd>{{ movementLabel(lane.movement_rules) }}</dd></div></dl>
    <div class="queue-zone-controls">
      <button type="button" :aria-pressed="showZones" :aria-label="`Zona antrean ${name}`" @click="showZones = !showZones">Zona antrean <span>{{ showZones ? 'Aktif' : 'Nonaktif' }}</span></button>
      <span class="queue-zone-legend"><span><i class="outer"></i>Luar</span><span><i class="inner"></i>Dalam</span></span>
    </div>
    <p class="queue-zone-note">Konfigurasi manual untuk demo.</p>
    <p class="queue-zone-note">Zona konfigurasi siap — menunggu analisis AI</p>
  </article>
</template>

<style scoped>
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
