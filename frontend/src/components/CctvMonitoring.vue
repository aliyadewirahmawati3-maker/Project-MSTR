<script setup>
import AppIcon from './AppIcon.vue'
const cameras = ['Barat', 'Utara', 'Timur', 'Selatan']
</script>

<template>
  <section id="live-monitoring" class="card cctv-card" tabindex="-1" aria-labelledby="cctv-title">
    <div class="card-heading">
      <div><h2 id="cctv-title">Live Monitoring CCTV <span class="title-separator">—</span> 4 Arah</h2><p>Pemantauan visual seluruh pendekat persimpangan</p></div>
      <span class="camera-connection"><i class="status-dot"></i>Belum terhubung</span>
    </div>
    <div class="cctv-grid">
      <article v-for="(direction, index) in cameras" :key="direction" class="camera-card" :aria-label="`CCTV ${direction}, Standby, stream belum terhubung`">
        <div class="camera-heading"><h3><AppIcon name="camera" :size="16" />CCTV {{ direction }}</h3><span class="camera-number">0{{ index + 1 }}</span></div>
        <div class="camera-frame">
          <span class="camera-standby"><i class="status-dot"></i>Standby</span>
          <div class="camera-empty"><AppIcon name="cameraOff" :size="30" /><p>STREAM CCTV BELUM TERHUBUNG</p><span>Menunggu sumber video</span></div>
          <span class="frame-corner top-left"></span><span class="frame-corner bottom-right"></span>
        </div>
        <dl class="lane-info"><div><dt>Lajur luar</dt><dd>belok kiri / lurus</dd></div><div><dt>Lajur dalam</dt><dd>lurus / belok kanan</dd></div></dl>
      </article>
    </div>
  </section>
</template>
