<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import SimulationVehicle from './SimulationVehicle.vue'
import { colors, flows, motionPaths } from '../simulation/mapGeometry.js'
import { advanceSimulation, cancelEvp, createSimulation, DENSITIES, DIRECTIONS, LABELS, lightFor, queuedVehicles, requestEvp, setDensity, TIMING } from '../simulation/intersectionSimulator.js'

const approaches = [
  { label: 'Barat', code: 'B', color: 'green', left: 'Utara', straight: 'Timur', right: 'Selatan', className: 'west' },
  { label: 'Utara', code: 'U', color: 'cream', left: 'Timur', straight: 'Selatan', right: 'Barat', className: 'north' },
  { label: 'Selatan', code: 'S', color: 'gray', left: 'Barat', straight: 'Utara', right: 'Timur', className: 'south' },
  { label: 'Timur', code: 'T', color: 'orange', left: 'Selatan', straight: 'Barat', right: 'Utara', className: 'east' },
]
const simulation = reactive(createSimulation())
const emergencyKind = ref('ambulance')
const emergencyDirection = ref('west')
const pathsReady = ref(false)
let frameId
let previousTime = null
const phaseNames = { green: 'Hijau', yellow: 'Kuning', allRed: 'All-Red', red: 'Merah' }
const emergencyNames = { ambulance: 'Ambulans', firetruck: 'Pemadam' }
// Placed outside the road edges, clear of its markings and existing keys.
const signals = [
  { direction: 'west', x: 267, y: 280 },
  { direction: 'east', x: 505, y: 492 },
  { direction: 'north', x: 501, y: 280 },
  { direction: 'south', x: 271, y: 492 },
]
const countdown = computed(() => Math.ceil(Math.max(0, simulation.remaining - 0.000001)))
const evpStatus = computed(() => simulation.evp
  ? `EVP Simulasi Aktif · ${emergencyNames[simulation.evp.kind]} dari ${LABELS[simulation.evp.direction]}`
  : 'EVP: Aman')
const evpDetail = computed(() => ({
  normal: 'Prioritas darurat siap disimulasikan.',
  preparing: 'Menunggu kuning, all-red, dan simpang kosong. Request masih dapat dibatalkan.',
  priority: 'Hijau prioritas. Kendaraan normal baru ditahan sampai kendaraan darurat selesai.',
  recovering: `Pemulihan kuning dan all-red. Berikutnya: ${LABELS[simulation.resumeDirection]}.`,
})[simulation.mode])
const vehicles = computed(() => {
  const queue = queuedVehicles(simulation)
  return [...queue, ...simulation.active]
})
function vehicleTransform(vehicle) {
  return motionPaths.get(`${vehicle.route}-${vehicle.emergency}`)(vehicle.queued ? 0 : vehicle.travel / vehicle.pathLength, vehicle.distance || 0)
}
function vehicleOpacity(vehicle) {
  if (vehicle.queued) return vehicle.reveal
  // Leave on the reference path with a soft exit, without extending its geometry.
  return Math.min(1, Math.max(0, (1 - vehicle.travel / vehicle.pathLength) / 0.08))
}
function togglePlay() {
  previousTime = null
  simulation.playing = !simulation.playing
}
function reset() {
  Object.assign(simulation, createSimulation())
  emergencyKind.value = 'ambulance'
  emergencyDirection.value = 'west'
  previousTime = null
}
function setSpeed(speed) {
  previousTime = null
  simulation.speed = speed
}
function clearFrameClock() { previousTime = null }
function animate(time) {
  if (previousTime !== null && document.visibilityState === 'visible') {
    // Discard background-tab/stall time rather than jumping vehicles forward.
    advanceSimulation(simulation, Math.min((time - previousTime) / 1000, 0.1))
  }
  previousTime = time
  frameId = requestAnimationFrame(animate)
}
onMounted(() => {
  pathsReady.value = true
  frameId = requestAnimationFrame(animate)
  document.addEventListener('visibilitychange', clearFrameClock)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(frameId)
  document.removeEventListener('visibilitychange', clearFrameClock)
})
</script>

<template>
  <section id="peta-simpang" class="card map-card" tabindex="-1" aria-labelledby="map-title">
    <div class="card-heading">
      <div><h2 id="map-title">Peta Persimpangan &amp; Fase Aktif</h2><p>Lajur luar: kiri / lurus · Lajur dalam: lurus / kanan</p></div>
      <span class="badge badge-neutral"><AppIcon name="map" :size="13" />4 arah · 2 lajur</span>
    </div>
    <div class="sim-toolbar">
      <span class="badge simulation-badge">SIMULASI VISUAL · Bukan data CCTV/YOLO</span>
      <div class="sim-controls" role="group" aria-label="Kontrol simulator visual">
        <button type="button" class="sim-play" :aria-pressed="simulation.playing" @click="togglePlay">
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path v-if="simulation.playing" d="M4 3h3v10H4Zm5 0h3v10H9Z" fill="currentColor" /><path v-else d="m5 3 8 5-8 5Z" fill="currentColor" /></svg>
          {{ simulation.playing ? 'Pause' : 'Play' }}
        </button>
        <button type="button" @click="reset"><AppIcon name="refresh" :size="13" />Reset</button>
        <div class="speed-control" role="group" aria-label="Kecepatan simulator">
          <button v-for="speed in [1, 2]" :key="speed" type="button" :aria-pressed="simulation.speed === speed" @click="setSpeed(speed)">{{ speed }}×</button>
        </div>
      </div>
      <div class="density-controls">
        <label class="density-select">Mode kepadatan
          <select :value="simulation.density" @change="setDensity(simulation, $event.target.value)">
            <option v-for="(density, key) in DENSITIES" :key="key" :value="key">{{ density.label }} (Simulasi)</option>
          </select>
        </label>
        <span class="badge density-badge">Kepadatan Visual: {{ DENSITIES[simulation.density].label }} · Simulasi</span>
      </div>
    </div>
    <div class="map-canvas">
      <svg class="intersection-svg" viewBox="0 0 772 772" role="img" aria-labelledby="intersection-title intersection-desc">
        <title id="intersection-title">Peta arus persimpangan Barat, Utara, Timur, Selatan</title>
        <desc id="intersection-desc">Geometri silang siku-siku sesuai referensi. Lajur luar biru untuk lurus atau belok kiri. Lajur dalam merah untuk lurus, dengan belok kanan hijau dari Barat, krem dari Utara, oranye dari Timur, dan abu-abu dari Selatan. Warna arus tidak menunjukkan status lampu.</desc>
        <defs>
          <marker v-for="(color, key) in colors" :id="`flow-${key}`" :key="key" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="m2 1 6 4-6 4" fill="none" :stroke="color" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </marker>
          <g id="lane-outer" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M0 13V-13m-5 5 5-5 5 5M0 4h-9v-8m-4 4 4-4 4 4" />
          </g>
          <g id="lane-inner" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M0 13V-13m-5 5 5-5 5 5M0 4h9v-8m-4 4 4-4 4 4" />
          </g>
        </defs>

        <!-- Road edges and markings retain the geometry of the supplied map. -->
        <path d="M300 0H472V300H772V472H472V772H300V472H0V300H300Z" fill="#dce3ec" />
        <path d="M300 0V300H0M472 0V300H772M772 472H472V772M300 772V472H0" fill="none" stroke="#aebdce" stroke-width="3" />
        <g stroke="#fff" stroke-width="2.4" stroke-dasharray="12 11" stroke-linecap="round">
          <path d="M343 35V292M429 35V292M343 480V736M429 480V736M35 343H292M35 429H292M480 343H736M480 429H736" />
        </g>
        <path d="M386 35V300M386 472V736M35 386H300M472 386H736" fill="none" stroke="#c9ac60" stroke-width="2.6" />

        <g class="flow-lines" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <path v-for="(flow, index) in flows" :key="index" :d="flow.d" :stroke="colors[flow.color]" :marker-end="`url(#flow-${flow.color})`" />
        </g>

        <!-- White lane signs are distinct from the colored route overlays. -->
        <g opacity="0.95">
          <use href="#lane-outer" transform="translate(200 322) rotate(90)" />
          <use href="#lane-inner" transform="translate(200 365) rotate(90)" />
          <use href="#lane-outer" transform="translate(451 200) rotate(180)" />
          <use href="#lane-inner" transform="translate(408 200) rotate(180)" />
          <use href="#lane-outer" transform="translate(572 451) rotate(-90)" />
          <use href="#lane-inner" transform="translate(572 408) rotate(-90)" />
          <use href="#lane-outer" transform="translate(322 572)" />
          <use href="#lane-inner" transform="translate(365 572)" />
        </g>

        <g v-if="pathsReady" class="simulation-traffic" pointer-events="none">
          <g v-for="vehicle in vehicles" :key="vehicle.id" :transform="vehicleTransform(vehicle)" :opacity="vehicleOpacity(vehicle)" :data-direction="vehicle.direction" :data-emergency="vehicle.emergency" :data-moving="simulation.playing && vehicle.velocity > 0">
            <SimulationVehicle :kind="vehicle.kind" />
          </g>
        </g>

        <g class="simulation-signals">
          <g v-for="signal in signals" :key="signal.direction" :transform="`translate(${signal.x} ${signal.y})`" :aria-label="`Lampu ${LABELS[signal.direction]}: ${phaseNames[lightFor(simulation, signal.direction)]}`">
            <title>{{ LABELS[signal.direction] }}: {{ phaseNames[lightFor(simulation, signal.direction)] }}</title>
            <rect x="-27" y="-11" width="54" height="22" rx="6" fill="#273951" stroke="#5c708c" stroke-width="1.4" />
            <circle v-for="(aspect, index) in ['red', 'yellow', 'green']" :key="aspect" :cx="(index - 1) * 17" cy="0" r="6.3" :class="['signal-aspect', aspect, { lit: lightFor(simulation, signal.direction) === aspect }]" />
          </g>
        </g>

        <g class="map-direction-labels" text-anchor="middle">
          <g transform="translate(386 16)"><rect x="-14" y="-13" width="28" height="26" rx="5" /><text y="5">U</text></g>
          <g transform="translate(16 386)"><rect x="-13" y="-13" width="26" height="26" rx="5" /><text y="5">B</text></g>
          <g transform="translate(756 386)"><rect x="-13" y="-13" width="26" height="26" rx="5" /><text y="5">T</text></g>
          <g transform="translate(386 756)"><rect x="-14" y="-13" width="28" height="26" rx="5" /><text y="5">S</text></g>
        </g>
      </svg>

      <div class="map-compass" aria-label="Kompas: Utara atas, Barat kiri, Timur kanan, Selatan bawah">
        <svg viewBox="0 0 66 66" aria-hidden="true"><circle cx="33" cy="33" r="20" /><path d="M33 15v36M15 33h36M33 18l-3 6h6Z" /><text x="33" y="10">U</text><text x="6" y="37">B</text><text x="60" y="37">T</text><text x="33" y="64">S</text></svg>
      </div>
      <div v-for="approach in approaches" :key="approach.code" :class="['approach-key', approach.className]">
        <strong><span>{{ approach.code }}</span>Arah {{ approach.label }}</strong>
        <p><i :style="{ background: colors.blue }"></i>Kiri ke {{ approach.left }} / lurus</p>
        <p><i :style="{ background: colors.red }"></i>Lurus ke {{ approach.straight }}</p>
        <p><i :style="{ background: colors[approach.color] }"></i>Kanan ke {{ approach.right }}</p>
      </div>
    </div>
    <div class="phase-strip">
      <span><AppIcon name="traffic" :size="17" /><strong>Fase Aktif: {{ LABELS[simulation.direction] }}</strong><span :class="['phase-state', simulation.phase]">{{ phaseNames[simulation.phase] }}</span><b class="phase-countdown">{{ countdown }} dtk</b><span class="phase-simulator">· {{ simulation.playing ? 'Berjalan' : 'Pause' }}</span></span>
      <div class="phase-lights" aria-label="Status lampu setiap arah"><span v-for="direction in DIRECTIONS" :key="direction"><i :class="['status-dot', lightFor(simulation, direction)]"></i>{{ LABELS[direction] }} {{ phaseNames[lightFor(simulation, direction)] }}</span></div>
      <p class="phase-detail">{{ simulation.phase === 'allRed' && countdown === 0 ? 'Menunggu kendaraan keluar dan jarak aman sebelum hijau berikutnya.' : `Dua lajur mengalir beriringan · Jarak aman antarkendaraan · Hijau ${TIMING.green} dtk / kuning ${TIMING.yellow} dtk / all-red ≥ ${TIMING.allRed} dtk` }}</p>
    </div>
    <div class="map-footnote"><AppIcon name="info" :size="13" />Warna jalur menunjukkan arah arus, bukan status lampu.</div>
    <section class="evp-panel" aria-labelledby="evp-title">
      <div class="evp-heading"><h3 id="evp-title"><AppIcon name="shield" :size="15" />Emergency Vehicle Priority</h3><span class="evp-local">Simulasi lokal</span></div>
      <p class="evp-status" :class="{ 'evp-active': simulation.evp }" role="status">{{ evpStatus }}</p>
      <div class="evp-controls">
        <label>Jenis kendaraan<select v-model="emergencyKind" :disabled="Boolean(simulation.evp)"><option value="ambulance">Ambulans</option><option value="firetruck">Pemadam</option></select></label>
        <label>Arah asal<select v-model="emergencyDirection" :disabled="Boolean(simulation.evp)"><option v-for="direction in DIRECTIONS" :key="direction" :value="direction">{{ LABELS[direction] }}</option></select></label>
        <button type="button" class="evp-activate" :disabled="Boolean(simulation.evp)" @click="requestEvp(simulation, emergencyKind, emergencyDirection)">Aktifkan Simulasi EVP</button>
        <button type="button" :disabled="simulation.mode !== 'preparing'" @click="cancelEvp(simulation)">Batalkan Simulasi EVP</button>
      </div>
      <p class="evp-detail">{{ evpDetail }}<span v-if="!simulation.playing"> Tekan Play untuk menjalankan simulasi.</span></p>
      <p class="evp-future">Pada tahap lanjutan, pemicu EVP berasal dari hasil deteksi YOLO pada CCTV.</p>
    </section>
  </section>
</template>

<style scoped>
.sim-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 17px 0; }
.simulation-badge { color: #506f96; background: #edf3fa; border: 1px solid #dbe6f3; font-size: 9px; white-space: normal; line-height: 1.5; }
.sim-controls, .speed-control { display: flex; align-items: center; gap: 5px; }
.sim-controls button, .density-select select, .evp-controls button, .evp-controls select { min-height: 31px; border: 1px solid #d6e0ec; border-radius: 5px; background: #fff; color: #536984; padding: 6px 9px; font: inherit; font-size: 10px; }
.sim-controls button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; cursor: pointer; }
.sim-controls button:hover, .evp-controls button:not(:disabled):hover { background: #edf3fa; border-color: #a5bcd9; }
.sim-controls .sim-play, .speed-control button[aria-pressed="true"], .evp-controls .evp-activate { color: #35639b; background: #edf3fa; border-color: #c6d8ef; }
.sim-controls button:focus-visible, .density-select select:focus-visible, .evp-controls :focus-visible { outline: 2px solid #4884d8; outline-offset: 2px; }
.density-controls { display: flex; flex-basis: 100%; align-items: center; flex-wrap: wrap; gap: 8px 12px; }
.density-select { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 7px; font-size: 10px; color: #73849a; }
.density-select select { cursor: pointer; }
.density-badge { color: #886e45; background: #faf5ec; border: 1px solid #eae0cf; font-size: 9px; white-space: normal; }
.speed-control { border-left: 1px solid #e2e8f0; padding-left: 6px; }
.signal-aspect { fill: #526174; stroke: #778599; stroke-width: .8; }
.signal-aspect.red.lit { fill: #f06a70; stroke: #ffc1c4; }
.signal-aspect.yellow.lit { fill: #f4c461; stroke: #fff1c4; }
.signal-aspect.green.lit { fill: #57c59c; stroke: #bcf4d9; }
.phase-state { padding: 3px 6px; border-radius: 4px; font-weight: 600; }
.phase-state.green { color: #238261; background: #eaf6f1; }
.phase-state.yellow { color: #916612; background: #fff5df; }
.phase-state.allRed { color: #b45762; background: #fbeef0; }
.phase-countdown { min-width: 37px; font-variant-numeric: tabular-nums; font-weight: 600; }
.phase-lights { flex-wrap: wrap; gap: 7px 12px; }
.status-dot.yellow { background: #dca73d; }
.phase-detail { width: 100%; font-size: 9px; line-height: 1.6; color: #7a8a9e; }
.evp-panel { margin: 0 17px 15px; padding: 12px; border: 1px solid #e1e8f1; border-radius: 5px; background: #fbfcfe; }
.evp-heading { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 6px; }
.evp-heading h3 { display: inline-flex; align-items: center; gap: 6px; margin: 0; font-size: 11px; font-weight: 600; color: #506681; }
.evp-local { font-size: 9px; color: #8291a5; }
.evp-status { margin: 8px 0; color: #308367; font-size: 10px; font-weight: 600; line-height: 1.6; }
.evp-status.evp-active { color: #aa5966; }
.evp-controls { display: flex; flex-wrap: wrap; align-items: end; gap: 8px; }
.evp-controls label { display: flex; flex: 1 1 95px; flex-direction: column; gap: 5px; color: #7b8a9e; font-size: 9px; }
.evp-controls select { width: 100%; min-width: 0; cursor: pointer; }
.evp-controls button { cursor: pointer; }
.evp-controls :disabled { opacity: .5; cursor: default; }
.evp-detail, .evp-future { font-size: 9px; line-height: 1.65; color: #7b8a9e; margin: 9px 0 0; }
.evp-future { color: #8996a8; margin-top: 5px; }
@media (max-width: 480px) {
  .sim-toolbar { padding: 10px 10px 0; }
  .evp-panel { margin: 0 10px 10px; padding: 10px; }
  .evp-controls button { flex: 1 1 145px; }
  .phase-lights { padding-left: 0; }
}
</style>
