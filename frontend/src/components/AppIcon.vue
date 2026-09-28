<script setup>
defineProps({ name: { type: String, default: 'grid' }, size: { type: [Number, String], default: 20 } })

const paths = {
  menu: ['M4 6h16M4 12h16M4 18h16'],
  search: ['m21 21-4.4-4.4', 'M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0Z'],
  bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4'],
  chevron: ['m9 5 7 7-7 7'],
  down: ['m6 9 6 6 6-6'],
  grid: ['M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z'],
  camera: ['M3 5h12v14H3zM15 10l6-4v12l-6-4'],
  cameraOff: ['M3 3l18 18M7 5h8v7M15 10l6-4v12M3 8v11h12v-3'],
  map: ['m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2ZM9 3v16M15 5v16'],
  spark: ['m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z'],
  traffic: ['M8 2h8v17H8zM12 19v3', 'M12 6h.01M12 10.5h.01M12 15h.01'],
  shield: ['m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6ZM8 12l3 3 5-6'],
  chart: ['M4 3v17h17M8 15V9M13 15V5M18 15v-4'],
  history: ['M3 10a9 9 0 1 1 2 8M3 4v6h6M12 7v5l3 2'],
  pulse: ['M3 12h4l3-8 4 16 3-8h4'],
  settings: ['M4 7h16M4 17h16M8 4v6M16 14v6'],
  refresh: ['M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 2M5 16a8 8 0 0 0 13 2'],
  pin: ['M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z', 'M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'],
  arrow: ['M4 12h16m-5-5 5 5-5 5'],
  arrows: ['M3 8h17m-4-4 4 4-4 4M21 16H4m4-4-4 4 4 4'],
  info: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 11v6M12 7h.01'],
  close: ['m6 6 12 12M18 6 6 18'],
  user: ['M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2'],
  clock: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 6v6l4 2'],
  link: ['m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M13 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0'],
}
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path v-for="(path, index) in (paths[name] || paths.grid)" :key="index" :d="path" />
  </svg>
</template>
