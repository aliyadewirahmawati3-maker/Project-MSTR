import { computed, readonly, ref } from 'vue'

export const MAP_DISPLAY_MODES = Object.freeze([
  Object.freeze({ value: 'SIMULATION_VISUAL', label: 'Simulasi visual' }),
  Object.freeze({ value: 'YOLO_LOCAL_REALTIME', label: 'YOLO lokal' }),
])

// This is a local display preference, never a request to enable detection.
export function useMapDisplayMode() {
  const mode = ref('SIMULATION_VISUAL')
  const isSimulation = computed(() => mode.value === 'SIMULATION_VISUAL')
  const presentation = computed(() => isSimulation.value
    ? { label: 'Simulasi visual', status: '', help: 'Bukan data CCTV/YOLO.' }
    : {
        label: 'YOLO lokal',
        status: 'Menunggu integrasi YOLO',
        help: 'Mode ini disiapkan untuk deteksi lokal dari video, bukan CCTV live ATCS.',
      })

  function selectMode(value) {
    mode.value = MAP_DISPLAY_MODES.some(option => option.value === value) ? value : 'SIMULATION_VISUAL'
  }

  return { mode: readonly(mode), isSimulation, presentation, selectMode }
}
