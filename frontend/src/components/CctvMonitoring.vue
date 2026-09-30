<script setup>
import LocalCctvCamera from './LocalCctvCamera.vue'
import queueZones from '../../../config/cctv/queue_zones.json'

// Real Stage 3 scenario mapping, independent of live-camera/API health.
const cameras = queueZones.cameras
</script>

<template>
  <section id="live-monitoring" class="card cctv-card" tabindex="-1" aria-labelledby="cctv-title">
    <div class="card-heading">
      <div><h2 id="cctv-title">Live Monitoring CCTV <span class="title-separator">—</span> 4 Arah</h2><p>Rekaman lokal · bukan CCTV live</p></div>
      <span class="badge badge-neutral">Offline demo</span>
    </div>
    <div class="cctv-grid">
      <LocalCctvCamera v-for="camera in cameras" :key="camera.camera_code" :camera="camera" />
    </div>
  </section>
</template>
