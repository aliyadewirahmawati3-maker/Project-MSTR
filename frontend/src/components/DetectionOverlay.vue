<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { containedVideoRect } from '../utils/queueZones.js'
const props = defineProps({ video: { default: null }, detections: { type: Array, default: () => [] } })
const rect = ref(null)
const placement = computed(() => rect.value && Object.fromEntries(Object.entries(rect.value).map(([key, value]) => [key, `${value}px`])))
let cleanup = () => {}
watch(() => props.video, video => {
  cleanup(); rect.value = null
  if (!video) return
  const update = () => {
    const frame = video.parentElement
    if (!frame || !video.isConnected) { rect.value = null; return }
    const box = video.getBoundingClientRect(), parent = frame.getBoundingClientRect()
    const image = containedVideoRect(box.width, box.height, video.videoWidth, video.videoHeight)
    rect.value = image && { ...image, left: image.left + box.left - parent.left - frame.clientLeft, top: image.top + box.top - parent.top - frame.clientTop }
  }
  const observer = new ResizeObserver(update)
  observer.observe(video)
  video.addEventListener('loadedmetadata', update); video.addEventListener('resize', update)
  cleanup = () => { observer.disconnect(); video.removeEventListener('loadedmetadata', update); video.removeEventListener('resize', update) }
  update()
}, { immediate: true, flush: 'post' })
onBeforeUnmount(() => cleanup())
</script>

<template>
  <div v-if="rect && detections.length" class="detection-overlay" :style="placement" aria-hidden="true">
    <svg viewBox="0 0 1 1" preserveAspectRatio="none">
      <rect v-for="(detection, index) in detections" :key="index" :x="detection.bbox[0]" :y="detection.bbox[1]"
        :width="detection.bbox[2] - detection.bbox[0]" :height="detection.bbox[3] - detection.bbox[1]" vector-effect="non-scaling-stroke" />
    </svg>
    <span v-for="(detection, index) in detections" :key="index" :style="{ left: `${Math.min(.72, detection.bbox[0]) * 100}%`, top: `${Math.max(0, detection.bbox[1] - .035) * 100}%` }">{{ detection.class_name }} {{ Math.round(detection.confidence * 100) }}%</span>
  </div>
</template>

<style scoped>
.detection-overlay { position: absolute; pointer-events: none; overflow: hidden; }
svg { display: block; width: 100%; height: 100%; }
rect { fill: none; stroke: #5cffb1; stroke-width: 1.5px; }
span { position: absolute; max-width: 28%; overflow: hidden; white-space: nowrap; font-size: 8px; line-height: 1.3; color: #fff; background: #133e2ddd; padding: 1px 2px; }
</style>
