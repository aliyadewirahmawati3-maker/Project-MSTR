export const laneModeForZones = zones => zones?.length === 1 && zones[0].laneType === 'queue' ? 'SINGLE_QUEUE' : 'DUAL_LANE'
export const zoneLaneLabel = lane => lane === 'queue' ? 'Antrean' : lane === 'outer' ? 'Luar' : 'Dalam'

export function validateLaneZones(zones, mode = laneModeForZones(zones)) {
  const lanes = mode === 'SINGLE_QUEUE' ? ['queue'] : mode === 'DUAL_LANE' ? ['outer', 'inner'] : []
  if (!lanes.length || zones?.length !== lanes.length || new Set(zones.map(z => z.laneType)).size !== lanes.length ||
    zones.some(z => !lanes.includes(z.laneType))) throw new Error('Zona harus sesuai mode antrean.')
}

export function queueDisplayRows(row) {
  return row.lane_mode === 'SINGLE_QUEUE'
    ? [{ label: 'Antrean', value: row.queue_count }]
    : [{ label: 'Luar', value: row.outer_lane_queue }, { label: 'Dalam', value: row.inner_lane_queue }]
}
