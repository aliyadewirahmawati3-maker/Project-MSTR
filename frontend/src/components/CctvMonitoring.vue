<script setup>
import AppIcon from './AppIcon.vue'
import { movementLabel } from '../services/sigapApi.js'
const props = defineProps({ cameras: { type: Array, default: () => [] }, approaches: { type: Array, default: () => [] } })
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
      <p v-if="!cameras.length" class="operator-note">Konfigurasi kamera belum tersedia.</p>
      <article v-for="(camera, index) in cameras" :key="camera.id" class="camera-card" :aria-label="`${camera.name}, ${camera.status}, stream tidak ditampilkan`">
        <div class="camera-heading"><h3><AppIcon name="camera" :size="16" />{{ camera.name }}</h3><span class="camera-number">{{ camera.code || index + 1 }}</span></div>
        <div class="camera-frame">
          <span class="camera-standby"><i class="status-dot"></i>{{ camera.status }}{{ camera.status === 'UNCONFIGURED' ? ' / Standby' : '' }}</span>
          <div class="camera-empty"><AppIcon name="cameraOff" :size="30" /><p>STREAM CCTV TIDAK DITAMPILKAN</p><span>{{ camera.status === 'UNCONFIGURED' ? 'Kamera belum dikonfigurasi' : 'Hanya konfigurasi API' }}</span></div>
          <span class="frame-corner top-left"></span><span class="frame-corner bottom-right"></span>
        </div>
        <dl class="lane-info"><div v-for="lane in lanesFor(camera)" :key="lane.id"><dt>{{ lane.lane_type === 'outer' ? 'Lajur luar' : lane.lane_type === 'inner' ? 'Lajur dalam' : lane.lane_type }}</dt><dd>{{ movementLabel(lane.movement_rules) }}</dd></div></dl>
      </article>
    </div>
  </section>
</template>
