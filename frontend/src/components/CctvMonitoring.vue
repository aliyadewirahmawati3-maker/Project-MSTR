<script setup>
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { movementLabel } from '../services/sigapApi.js'
const props = defineProps({ cameras: { type: Array, default: () => [] }, approaches: { type: Array, default: () => [] }, statusFresh: Boolean })
// Empty slots preserve the existing grid without inventing camera configuration.
const cameraSlots = computed(() => props.cameras.length ? props.cameras : Array.from({ length: 4 }, (_, id) => ({ id: `pending-${id}`, name: 'Kamera —' })))
function cameraStatus(camera) {
  if (!props.statusFresh) return 'Standby · Belum terverifikasi'
  return camera.status === 'UNCONFIGURED' ? 'UNCONFIGURED / Standby' : camera.status
}
function lanesFor(camera) {
  return [...(props.approaches.find(approach => approach.id === camera.approach_id)?.lanes || [])].sort((a, b) => a.order_index - b.order_index)
}
</script>

<template>
  <section id="live-monitoring" class="card cctv-card" tabindex="-1" aria-labelledby="cctv-title">
    <div class="card-heading">
      <div><h2 id="cctv-title">Live Monitoring CCTV <span class="title-separator">—</span> {{ approaches.length || '—' }} Arah</h2><p>Pemantauan visual seluruh pendekat persimpangan</p></div>
      <span class="camera-connection"><i class="status-dot"></i>Stream belum ditampilkan</span>
    </div>
    <div class="cctv-grid">
      <article v-for="(camera, index) in cameraSlots" :key="camera.id" class="camera-card" :aria-label="`${camera.name}, ${cameraStatus(camera)}, stream tidak ditampilkan`">
        <div class="camera-heading"><h3><AppIcon name="camera" :size="16" />{{ camera.name }}</h3><span class="camera-number">{{ camera.code || index + 1 }}</span></div>
        <div class="camera-frame">
          <span class="camera-standby"><i class="status-dot"></i>{{ cameraStatus(camera) }}</span>
          <div class="camera-empty"><AppIcon name="cameraOff" :size="30" /><p>STREAM CCTV TIDAK DITAMPILKAN</p><span>{{ !statusFresh ? 'Menunggu status API' : camera.status === 'UNCONFIGURED' ? 'Kamera belum dikonfigurasi' : 'Hanya konfigurasi API' }}</span></div>
          <span class="frame-corner top-left"></span><span class="frame-corner bottom-right"></span>
        </div>
        <dl class="lane-info"><div v-for="lane in lanesFor(camera)" :key="lane.id"><dt>{{ lane.lane_type === 'outer' ? 'Lajur luar' : lane.lane_type === 'inner' ? 'Lajur dalam' : lane.lane_type }}</dt><dd>{{ movementLabel(lane.movement_rules) }}</dd></div></dl>
      </article>
    </div>
  </section>
</template>
