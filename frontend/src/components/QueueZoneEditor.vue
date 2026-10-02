<script setup>
import { zoneLaneLabel } from '../utils/laneMode.js'
import { ref } from 'vue'
import { useVideoOverlayRect } from '../composables/useVideoOverlayRect.js'
import { normalizedPointer } from '../utils/localZoneCalibration.js'

const props = defineProps({ video: { default: null }, zones: { type: Array, required: true } })
const emit = defineEmits(['move-point'])
const { rect, placement } = useVideoOverlayRect(() => props.video)
const surface = ref(null)
let drag = null
function start(event, zone, index) {
  drag = { zoneId: zone.id, index }
  event.target.setPointerCapture(event.pointerId)
  event.preventDefault()
}
function move(event) {
  if (!drag) return
  const point = normalizedPointer(event.clientX, event.clientY, surface.value?.getBoundingClientRect())
  if (point) emit('move-point', drag.zoneId, drag.index, point)
}
function keyMove(event, zone, index) {
  const directions = { ArrowLeft: [-.005, 0], ArrowRight: [.005, 0], ArrowUp: [0, -.005], ArrowDown: [0, .005] }
  const delta = directions[event.key]
  if (!delta) return
  event.preventDefault()
  emit('move-point', zone.id, index, zone.polygon[index].map((value, axis) => Math.max(0, Math.min(1, value + delta[axis]))))
}
</script>

<template>
  <div v-if="rect" ref="surface" class="zone-editor" :style="placement">
    <svg :viewBox="`0 0 ${rect.width} ${rect.height}`" preserveAspectRatio="none" aria-label="Edit titik zona antrean" @pointermove="move" @pointerup="drag = null" @pointercancel="drag = null" @lostpointercapture="drag = null">
      <g v-for="zone in zones" :key="zone.id" :class="zone.laneType">
        <polygon :points="zone.polygon.map(([x, y]) => `${x * rect.width},${y * rect.height}`).join(' ')" />
        <circle v-for="(point, index) in zone.polygon" :key="index" :cx="point[0] * rect.width" :cy="point[1] * rect.height" r="7" tabindex="0" role="button"
          :aria-label="`${zoneLaneLabel(zone.laneType)} titik ${index + 1}; geser atau gunakan tombol panah`"
          @pointerdown="start($event, zone, index)" @keydown="keyMove($event, zone, index)" />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.zone-editor { position: absolute; z-index: 3; pointer-events: none; overflow: hidden; }
svg { width: 100%; height: 100%; display: block; }
polygon { fill-opacity: .15; stroke-width: 2px; }
.queue, .outer { fill: #3988ed; stroke: #3988ed; }
.inner { fill: #ed873c; stroke: #ed873c; }
circle { pointer-events: auto; touch-action: none; cursor: grab; stroke: white; stroke-width: 2px; }
circle:focus-visible { stroke: #ffe66c; stroke-width: 3px; outline: none; }
</style>
