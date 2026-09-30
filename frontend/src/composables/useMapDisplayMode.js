import { computed, readonly, ref, unref } from 'vue'

export const MAP_DISPLAY_MODES = Object.freeze([
  Object.freeze({ value: 'SIMULATION_VISUAL', label: 'Simulasi visual' }),
  Object.freeze({ value: 'YOLO_LOCAL_REALTIME', label: 'YOLO lokal' }),
])

// Selecting YOLO opts into local snapshot inference, never adaptive signal control.
export function useMapDisplayMode(inferenceStatus = null) {
  const mode = ref('SIMULATION_VISUAL')
  const isSimulation = computed(() => mode.value === 'SIMULATION_VISUAL')
  const presentation = computed(() => isSimulation.value
    ? { label: 'Simulasi visual', status: '', help: 'Bukan data CCTV/YOLO.' }
    : {
        label: 'YOLO lokal',
        status: unref(inferenceStatus) || 'Menunggu integrasi YOLO',
        help: inferenceStatus ? 'Snapshot video lokal, bukan CCTV live ATCS.' : 'Mode ini disiapkan untuk deteksi lokal dari video, bukan CCTV live ATCS.',
      })

  function selectMode(value) {
    mode.value = MAP_DISPLAY_MODES.some(option => option.value === value) ? value : 'SIMULATION_VISUAL'
  }

  return { mode: readonly(mode), isSimulation, presentation, selectMode }
}
