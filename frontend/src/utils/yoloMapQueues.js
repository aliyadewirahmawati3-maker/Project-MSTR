import { freshYoloResult } from './inferenceStatus.js'

const DIRECTIONS = ['WEST', 'NORTH', 'EAST', 'SOUTH']
const NAMES = { WEST: 'Barat', NORTH: 'Utara', EAST: 'Timur', SOUTH: 'Selatan' }
export const MAX_MAP_VEHICLES_PER_LANE = 7

// Schematic occupancy on the incoming lanes; CCTV pixels are not geographic coordinates.
const positions = {
  WEST: (lane, offset) => [270 - offset, lane === 'outer' ? 322 : 365, 0],
  NORTH: (lane, offset) => [lane === 'outer' ? 451 : 408, 270 - offset, 90],
  EAST: (lane, offset) => [502 + offset, lane === 'outer' ? 451 : 408, 180],
  SOUTH: (lane, offset) => [lane === 'outer' ? 322 : 365, 502 + offset, -90],
}

export function yoloMapQueues(approaches, now = Date.now()) {
  return DIRECTIONS.flatMap(direction => {
    const row = approaches.find(item => item.approach_code === direction)
    return ['outer', 'inner'].map(lane => {
      const value = row?.[`${lane}_lane_queue`]
      const count = freshYoloResult(row, now) && Number.isInteger(value) && value >= 0 ? value : null
      const visible = count === null ? 0 : Math.min(count, MAX_MAP_VEHICLES_PER_LANE)
      const [x, y] = positions[direction](lane, 0)
      return {
        id: `${direction}-${lane}`, direction, lane, count,
        label: `${NAMES[direction]} · ${lane === 'outer' ? 'Luar' : 'Dalam'}`,
        x: x + (['NORTH', 'SOUTH'].includes(direction) ? 0 : direction === 'WEST' ? 18 : -18),
        y: y + (['WEST', 'EAST'].includes(direction) ? 0 : direction === 'NORTH' ? 18 : -18),
        vehicles: Array.from({ length: visible }, (_, index) => {
          const [vx, vy, angle] = positions[direction](lane, index * 33)
          return { id: `${direction}-${lane}-${index}`, transform: `translate(${vx} ${vy}) rotate(${angle})` }
        }),
        overflow: count === null ? 0 : Math.max(0, count - visible),
      }
    })
  })
}
