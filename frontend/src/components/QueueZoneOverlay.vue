<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { containedVideoRect, polygonCentroid } from '../utils/queueZones.js'

const props = defineProps({ video: { default: null }, zones: { type: Array, required: true } })
const rect = ref(null)
const shapes = computed(() => props.zones.map(zone => ({
  ...zone,
  points: zone.polygon.map(point => point.join(',')).join(' '),
  center: polygonCentroid(zone.polygon),
})))
const placement = computed(() => rect.value && Object.fromEntries(
  Object.entries(rect.value).map(([key, value]) => [key, `${value}px`]),
))
let cleanup = () => {}

watch(() => props.video, video => {
  cleanup()
  rect.value = null
  if (!video) return
  const update = () => {
    const frame = video.parentElement
    // Retry replaces the video node; a queued observer may still see the old one.
    if (!frame || !video.isConnected) {
      rect.value = null
      return
    }
    const box = video.getBoundingClientRect()
    const frameBox = frame.getBoundingClientRect()
    const image = containedVideoRect(box.width, box.height, video.videoWidth, video.videoHeight)
    rect.value = image && {
      ...image,
      left: image.left + box.left - frameBox.left - frame.clientLeft,
      top: image.top + box.top - frameBox.top - frame.clientTop,
    }
  }
  const observer = new ResizeObserver(update)
  observer.observe(video)
  video.addEventListener('loadedmetadata', update)
  video.addEventListener('resize', update)
  cleanup = () => {
    observer.disconnect()
    video.removeEventListener('loadedmetadata', update)
    video.removeEventListener('resize', update)
  }
  update()
}, { immediate: true, flush: 'post' })
onBeforeUnmount(() => cleanup())
</script>

<template>
  <div v-if="rect" class="queue-zone-overlay" :style="placement" aria-hidden="true">
    <svg viewBox="0 0 1 1" preserveAspectRatio="none" focusable="false">
      <polygon v-for="zone in shapes" :key="zone.id" :class="zone.laneType" :points="zone.points" vector-effect="non-scaling-stroke">
        <title>{{ zone.label }} — {{ zone.movementLabel }} (manual)</title>
      </polygon>
    </svg>
    <span v-for="zone in shapes" :key="`${zone.id}-label`" class="zone-label" :class="zone.laneType"
      :style="{ left: `${zone.center[0] * 100}%`, top: `${zone.center[1] * 100}%` }">
      {{ zone.laneType === 'outer' ? 'Luar' : 'Dalam' }}
    </span>
  </div>
</template>

<style scoped>
.queue-zone-overlay { position: absolute; pointer-events: none; overflow: hidden; }
svg { display: block; width: 100%; height: 100%; }
polygon { fill-opacity: .12; stroke-opacity: .95; stroke-width: 1.5px; }
polygon.outer { fill: #3988ed; stroke: #3988ed; }
polygon.inner { fill: #ed873c; stroke: #ed873c; }
.zone-label { position: absolute; transform: translate(-50%, -50%); padding: 1px 4px; border-radius: 3px; font-size: 9px; line-height: 1.4; color: #fff; background: #172b45b3; white-space: nowrap; }
.zone-label.outer { border-left: 2px solid #3988ed; }
.zone-label.inner { border-left: 2px solid #ed873c; }
</style>
