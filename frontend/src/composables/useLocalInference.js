import { computed, reactive } from 'vue'
import { useMapDisplayMode } from './useMapDisplayMode.js'
import { inferenceLabel } from '../utils/inferenceStatus.js'

export function useLocalInference() {
  const sessions = reactive({})
  const states = reactive({})
  const status = computed(() => {
    const values = Object.values(states)
    const priority = ['AI_OFFLINE', 'YOLO_MODEL_UNAVAILABLE', 'MODEL_LOADING', 'INFERENCE_ERROR', 'INVALID_FRAME', 'STALE', 'ZONE_CALIBRATION_REQUIRED', 'DETECTION_READY', 'DETECTING', 'PAUSED']
    return priority.find(item => values.includes(item)) || 'WAITING_FOR_VIDEO'
  })
  return { clientId: crypto.randomUUID(), sessions, states, status,
    map: useMapDisplayMode(computed(() => inferenceLabel(status.value))) }
}
