import { freshYoloResult } from './inferenceStatus.js'
import { recommendPhase } from './phaseRecommendation.js'
import { LABELS, lightFor } from '../simulation/intersectionSimulator.js'

export const PHASE_DIRECTIONS = ['west', 'east', 'north', 'south']
export const PHASE_LIGHT_LABELS = { green: 'Hijau', red: 'Merah', yellow: 'Kuning', waiting: 'Menunggu' }

// Visual presentation only: does not control signals, advance simulation, or count vehicles.
export function mapPhasePresentation({ isSimulation, simulation, queues = [], now = Date.now() }) {
  if (isSimulation) {
    const lights = Object.fromEntries(PHASE_DIRECTIONS.map(direction => [direction, lightFor(simulation, direction)]))
    return { label: LABELS[simulation.direction], light: lights[simulation.direction], lights,
      seconds: Math.ceil(Math.max(0, simulation.remaining - .000001)),
      status: simulation.playing ? 'Berjalan' : 'Dijeda', source: 'Simulator',
      note: simulation.phase === 'allRed' && simulation.remaining <= 0 ? 'Menunggu simpang kosong' : '' }
  }
  const fresh = queues.length === 4 && queues.every(row => freshYoloResult(row, now))
  const recommendation = fresh ? recommendPhase(queues) : null
  const phase = recommendation?.recommended_phase
  const valid = phase === 'WEST_EAST' || phase === 'NORTH_SOUTH'
  if (!valid) {
    const stale = queues.some(row => row.source_type === 'YOLO_LOCAL_REALTIME' && (row.stale || row.status === 'STALE' ||
      (Number.isFinite(Date.parse(row.expires_at)) && Date.parse(row.expires_at) <= now)))
    return { label: 'Menunggu data YOLO', light: 'waiting', seconds: null,
      lights: Object.fromEntries(PHASE_DIRECTIONS.map(direction => [direction, 'waiting'])),
      status: stale ? 'Data kedaluwarsa' : 'Menunggu data', source: 'Rekomendasi YOLO',
      note: 'Rekomendasi memerlukan data YOLO valid dari keempat arah.' }
  }
  const active = phase === 'WEST_EAST' ? ['west', 'east'] : ['north', 'south']
  return { label: recommendation.label, light: 'green', seconds: recommendation.recommended_green_seconds,
    lights: Object.fromEntries(PHASE_DIRECTIONS.map(direction => [direction, active.includes(direction) ? 'green' : 'red'])),
    status: 'Berjalan', source: 'Rekomendasi YOLO',
    note: 'Visualisasi rekomendasi DSS; durasi rekomendasi, bukan hitung mundur lampu ATCS.' }
}
