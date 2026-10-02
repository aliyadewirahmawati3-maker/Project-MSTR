<script setup>
import LocalCctvCamera from './LocalCctvCamera.vue'
import queueZones from '../../../config/cctv/queue_zones.json'

// Real Stage 3 scenario mapping, independent of live-camera/API health.
const cameras = queueZones.cameras
</script>

<template>
  <section id="live-monitoring" class="card cctv-card" tabindex="-1" aria-labelledby="cctv-title">
    <div class="card-heading">
      <div><h2 id="cctv-title">Monitoring CCTV <span class="title-separator">/</span> Rekaman Lokal</h2><p>Pilih video per kamera untuk pemantauan dan deteksi lokal.</p></div>
      <span class="badge badge-neutral">Sumber video lokal</span>
    </div>
    <div class="cctv-grid">
      <LocalCctvCamera v-for="camera in cameras" :key="camera.camera_code" :camera="camera" />
    </div>
  </section>
</template>
