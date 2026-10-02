<script setup>
import { zoneLaneLabel } from '../utils/laneMode.js'
import { computed } from 'vue'
import { polygonCentroid } from '../utils/queueZones.js'
import { useVideoOverlayRect } from '../composables/useVideoOverlayRect.js'

const props = defineProps({ video: { default: null }, zones: { type: Array, required: true } })
const { rect, placement } = useVideoOverlayRect(() => props.video)
const shapes = computed(() => props.zones.map(zone => ({
  ...zone,
  points: zone.polygon.map(point => point.join(',')).join(' '),
  center: polygonCentroid(zone.polygon),
})))

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
      {{ zoneLaneLabel(zone.laneType) }}
    </span>
  </div>
</template>

<style scoped>
.queue-zone-overlay { position: absolute; pointer-events: none; overflow: hidden; }
svg { display: block; width: 100%; height: 100%; }
polygon { fill-opacity: .12; stroke-opacity: .95; stroke-width: 1.5px; }
polygon.queue, .outer { fill: #3988ed; stroke: #3988ed; }
polygon.inner { fill: #ed873c; stroke: #ed873c; }
.zone-label { position: absolute; transform: translate(-50%, -50%); padding: 1px 4px; border-radius: 3px; font-size: 9px; line-height: 1.4; color: #fff; background: #172b45b3; white-space: nowrap; }
.zone-label.outer { border-left: 2px solid #3988ed; }
.zone-label.inner { border-left: 2px solid #ed873c; }
</style>
