<script setup>
defineProps({ kind: { type: String, default: 'car' } })
</script>

<template>
  <g class="simulation-vehicle" :class="kind" aria-hidden="true">
    <template v-if="kind === 'motorcycle'">
      <rect x="-10" y="-2.7" width="20" height="5.4" rx="2.7" fill="#40516b" />
      <path d="M-6-3h11v6H-6Z" fill="#8da7c5" stroke="#49627f" stroke-width="1" />
      <ellipse cx="-1" cy="0" rx="4" ry="4.2" fill="#d6e0eb" stroke="#647a94" stroke-width="1" />
      <path d="M6-4v8" stroke="#445b75" stroke-width="1.5" />
      <path d="M9-1v2" stroke="#fff3ca" stroke-width="2" />
    </template>
    <template v-else>
      <rect :x="kind === 'firetruck' ? -17 : -13" y="-8.5" :width="kind === 'firetruck' ? 32 : 25" height="17" rx="3" fill="#41516a" />
      <rect :x="kind === 'firetruck' ? -18 : kind === 'ambulance' ? -15 : -14" y="-7" :width="kind === 'firetruck' ? 36 : kind === 'ambulance' ? 30 : 28" height="14" rx="3.5" class="vehicle-body" stroke-width="1.1" />
      <path d="M6-5 9-4v8L6 5Z" fill="#364f6c" />
      <path v-if="kind === 'car'" d="M-9-4h3v8h-3Z" fill="#526d8b" />
      <path d="M12-5v3m0 4v3" stroke="#ffefbc" stroke-width="1.7" />
      <template v-if="kind === 'ambulance'">
        <path d="M-12-5H4M-12 5H4" stroke="#bf4b57" stroke-width="1.6" />
        <path d="M-5-3v6m-3-3h6" stroke="#bf4b57" stroke-width="2" />
        <path d="M3-4v8" stroke="#d36268" stroke-width="2.4" />
      </template>
      <template v-if="kind === 'firetruck'">
        <path d="M-14-3H1v6h-15Zm3 0v6m4-6v6m4-6v6" fill="none" stroke="#f1dfdc" stroke-width="1.3" />
        <path d="M4-5v10" stroke="#f9d7d1" stroke-width="2" />
      </template>
    </template>
  </g>
</template>

<style scoped>
.vehicle-body { fill: #90adce; stroke: #526d8d; }
.ambulance .vehicle-body { fill: #fffdf9; stroke: #a95a62; }
.firetruck .vehicle-body { fill: #bb5361; stroke: #873f4d; }
</style>
