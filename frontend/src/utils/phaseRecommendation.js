import { freshYoloResult } from './inferenceStatus.js'

export const RECOMMENDED_PHASES = Object.freeze({
  WEST_EAST: 'WEST_EAST',
  NORTH_SOUTH: 'NORTH_SOUTH',
  WAITING_FOR_DATA: 'WAITING_FOR_DATA',
})

export const PHASE_LABELS = Object.freeze({
  WEST_EAST: 'Barat–Timur',
  NORTH_SOUTH: 'Utara–Selatan',
  WAITING_FOR_DATA: 'Menunggu data antrean',
})

export const GREEN_SECONDS = Object.freeze({ min: 25, max: 60 })
export const MIN_GREEN_SECONDS = GREEN_SECONDS.min
export const MAX_GREEN_SECONDS = GREEN_SECONDS.max

const APPROACHES = ['WEST', 'NORTH', 'EAST', 'SOUTH']
const APPROACH_NAMES = { WEST: 'Barat', NORTH: 'Utara', EAST: 'Timur', SOUTH: 'Selatan' }
const BALANCE_THRESHOLD = 1

function approachesFrom(summary) {
  if (Array.isArray(summary)) return summary
  if (summary && Array.isArray(summary.approaches)) return summary.approaches
  return null
}

function numericQueue(item) {
  if (item?.stale || (item?.source_type === 'YOLO_LOCAL_REALTIME' && !freshYoloResult(item))) return null
  return item && typeof item === 'object' && Number.isFinite(item.total_queue) && item.total_queue >= 0
    ? item.total_queue
    : null
}

function waitingRecommendation(available = [], missing = APPROACHES) {
  const partial = available.length > 0
  return {
    recommended_phase: RECOMMENDED_PHASES.WAITING_FOR_DATA,
    label: partial ? `Data parsial (${available.length}/4 arah)` : PHASE_LABELS.WAITING_FOR_DATA,
    reason: partial
      ? `Data ${available.map(code => APPROACH_NAMES[code]).join(', ')} tersedia. Menunggu ${missing.map(code => APPROACH_NAMES[code]).join(', ')} sebelum membandingkan kedua fase.`
      : 'Menunggu data antrean dari deteksi kendaraan',
    priority_score: null,
    recommended_green_seconds: null,
    status: 'WAITING_FOR_DETECTION',
    data_status: partial ? 'PARTIAL_DATA' : 'WAITING_FOR_DATA',
    available_approaches: available,
    missing_approaches: missing,
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/**
 * Derive a transparent simulator recommendation from the four approach totals.
 * This utility does not detect, count, or infer vehicles; it only consumes
 * already available numeric queue values.
 */
export function recommendPhase(summary) {
  const approaches = approachesFrom(summary)
  if (!approaches || approaches.length !== APPROACHES.length) return waitingRecommendation()

  const codes = approaches.map(item => item?.approach_code)
  if (new Set(codes).size !== APPROACHES.length) return waitingRecommendation()
  const byCode = new Map(approaches.map(item => [item?.approach_code, item]))
  if (APPROACHES.some(code => !byCode.has(code))) return waitingRecommendation()

  const west = numericQueue(byCode.get('WEST'))
  const north = numericQueue(byCode.get('NORTH'))
  const east = numericQueue(byCode.get('EAST'))
  const south = numericQueue(byCode.get('SOUTH'))
  const available = APPROACHES.filter(code => numericQueue(byCode.get(code)) !== null)
  const missing = APPROACHES.filter(code => !available.includes(code))
  if (missing.length) return waitingRecommendation(available, missing)

  const westEastTotal = west + east
  const northSouthTotal = north + south
  const difference = Math.abs(westEastTotal - northSouthTotal)
  const balanced = difference <= BALANCE_THRESHOLD
  const westEast = westEastTotal >= northSouthTotal
  const recommendedPhase = balanced || westEast ? RECOMMENDED_PHASES.WEST_EAST : RECOMMENDED_PHASES.NORTH_SOUTH
  const dominantTotal = Math.max(westEastTotal, northSouthTotal)
  const combinedTotal = westEastTotal + northSouthTotal
  const priorityScore = balanced
    ? 50
    : Math.round((dominantTotal / combinedTotal) * 100)
  const recommendedGreenSeconds = clamp(
    GREEN_SECONDS.min + Math.round(dominantTotal + difference),
    GREEN_SECONDS.min,
    GREEN_SECONDS.max,
  )

  return {
    recommended_phase: recommendedPhase,
    label: PHASE_LABELS[recommendedPhase],
    reason: balanced
      ? 'Antrean seimbang; gunakan fase default.'
      : `Antrean ${westEast ? 'Barat–Timur' : 'Utara–Selatan'} lebih tinggi.`,
    priority_score: priorityScore,
    recommended_green_seconds: recommendedGreenSeconds,
    status: approaches.every(row => row.source_type === 'YOLO_LOCAL_REALTIME') ? 'DSS_RECOMMENDATION' : 'SIMULATOR',
    data_status: 'COMPLETE',
    available_approaches: APPROACHES.slice(),
    missing_approaches: [],
  }
}

export const calculatePhaseRecommendation = recommendPhase
export const getPhaseRecommendation = recommendPhase

export default recommendPhase
