<script setup>
import { computed } from 'vue'
import { useVideoOverlayRect } from '../composables/useVideoOverlayRect.js'
import { DEFAULT_OVERLAY_CONFIDENCE, layoutDetections } from '../utils/detectionOverlay.js'
const props = defineProps({ video: { default: null }, detections: { type: Array, default: () => [] },
  mode: { type: String, default: 'compact' }, minConfidence: { type: Number, default: DEFAULT_OVERLAY_CONFIDENCE },
  showOutside: { type: Boolean, default: true } })
const { rect, placement } = useVideoOverlayRect(() => props.video)
const visibleDetections = computed(() => layoutDetections(props.detections, rect.value, { mode: props.mode, minConfidence: props.minConfidence, showOutside: props.showOutside }))
const labels = computed(() => visibleDetections.value.filter(detection => detection.label))

</script>

<template>
  <div v-if="rect && visibleDetections.length" class="detection-overlay" :style="placement" aria-hidden="true">
    <svg viewBox="0 0 1 1" preserveAspectRatio="none">
      <rect v-for="(detection, index) in visibleDetections" :key="index" :x="detection.bbox[0]" :y="detection.bbox[1]"
        :class="detection.in_queue_zone ? 'in-queue' : 'outside-queue'"
        :width="detection.bbox[2] - detection.bbox[0]" :height="detection.bbox[3] - detection.bbox[1]" vector-effect="non-scaling-stroke" />
    </svg>
    <span v-for="(detection, index) in labels" :key="index" :class="detection.in_queue_zone ? 'in-queue' : 'outside-queue'" :style="{ left: `${detection.label.left}px`, top: `${detection.label.top}px`, width: `${detection.label.width}px`, height: `${detection.label.height}px` }">{{ detection.label.text }}</span>
  </div>
</template>

<style scoped>
.detection-overlay { position: absolute; pointer-events: none; overflow: hidden; }
svg { display: block; width: 100%; height: 100%; }
rect { fill: none; stroke: #70e5b2; stroke-width: 1px; }
rect.in-queue { stroke-width: 2px; }
rect.outside-queue { stroke: #a0a8b3; stroke-width: .75px; opacity: .6; }
span { position: absolute; overflow: hidden; white-space: nowrap; font: 10px/18px monospace; color: #ecfff5; background: #102e24e6; padding: 0 5px; border-radius: 3px; }
span.outside-queue { color: #e2e5e9; background: #333b46b3; opacity: .65; }
</style>
