// The original map's paths are shared by its flow overlay and the simulator.
// Vehicles sample these SVG paths; no alternative road geometry is generated.
export const colors = { blue: '#4884d8', red: '#d16669', green: '#54a482', cream: '#c9a475', orange: '#db9861', gray: '#8995a5' }
export const flows = [
  { color: 'blue', d: 'M36 322H736' },
  { color: 'blue', d: 'M36 322H270Q335 322 335 257V35' },
  { color: 'blue', d: 'M451 35V736' },
  { color: 'blue', d: 'M451 35V273Q451 335 516 335H736' },
  { color: 'blue', d: 'M736 451H36' },
  { color: 'blue', d: 'M736 451H500Q438 451 438 514V736' },
  { color: 'blue', d: 'M322 736V35' },
  { color: 'blue', d: 'M322 736V500Q322 438 260 438H36' },
  { color: 'red', d: 'M36 365H736' },
  { color: 'red', d: 'M408 35V736' },
  { color: 'red', d: 'M736 408H36' },
  { color: 'red', d: 'M365 736V35' },
  { color: 'green', d: 'M285 365C352 365 408 415 408 480V736' },
  { color: 'cream', d: 'M408 284C408 368 367 402 303 402H36' },
  { color: 'orange', d: 'M489 408C410 408 369 363 369 286V35' },
  { color: 'gray', d: 'M365 489C365 410 410 365 489 365H736' },
]

export const routes = {
  west: { outer: [1, 0], inner: [12, 8], straight: 8 },
  east: { outer: [5, 4], inner: [14, 10], straight: 10 },
  north: { outer: [3, 2], inner: [13, 9], straight: 9 },
  south: { outer: [7, 6], inner: [15, 11], straight: 11 },
}

export function approachOffset(direction, lane, emergency = false) {
  return (emergency ? 248 : lane === 'outer' ? 224 : 208) + (direction === 'north' ? 1 : 0)
}

// Flatten only the commands used by the reference into a distance lookup. The
// renderer and collision guards share this geometry, including every bend.
function sampleSvgPath(d) {
  const tokens = d.match(/[MHVQC]|-?\d+(?:\.\d+)?/g)
  const points = []
  let cursor = 0
  let current = { x: 0, y: 0 }
  const number = () => Number(tokens[cursor++])
  const add = point => { points.push(point); current = point }
  while (cursor < tokens.length) {
    const command = tokens[cursor++]
    if (command === 'M') add({ x: number(), y: number() })
    else if (command === 'H') add({ x: number(), y: current.y })
    else if (command === 'V') add({ x: current.x, y: number() })
    else if (command === 'Q' || command === 'C') {
      const start = current
      const first = { x: number(), y: number() }
      const second = command === 'C' ? { x: number(), y: number() } : null
      const end = { x: number(), y: number() }
      for (let step = 1; step <= 100; step++) {
        const t = step / 100
        const u = 1 - t
        const coordinate = axis => second
          ? u ** 3 * start[axis] + 3 * u ** 2 * t * first[axis] + 3 * u * t ** 2 * second[axis] + t ** 3 * end[axis]
          : u ** 2 * start[axis] + 2 * u * t * first[axis] + t ** 2 * end[axis]
        add({ x: coordinate('x'), y: coordinate('y') })
      }
    } else throw new Error(`Unsupported reference SVG command: ${command}`)
  }
  const lengths = [0]
  for (let index = 1; index < points.length; index++) {
    lengths.push(lengths[index - 1] + Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y))
  }
  return {
    getTotalLength: () => lengths.at(-1),
    getPointAtLength(distance) {
      const clamped = Math.max(0, Math.min(lengths.at(-1), distance))
      let low = 1
      let high = points.length - 1
      while (low < high) {
        const middle = (low + high) >> 1
        if (lengths[middle] < clamped) low = middle + 1
        else high = middle
      }
      const fraction = (clamped - lengths[low - 1]) / (lengths[low] - lengths[low - 1])
      return {
        x: points[low - 1].x + (points[low].x - points[low - 1].x) * fraction,
        y: points[low - 1].y + (points[low].y - points[low - 1].y) * fraction,
      }
    },
  }
}

// Right turns start at the bend in the reference. Their approach segment is
// sampled from the existing inner straight path, then joined to that bend.
export function createMotionPaths(elements = flows.map(flow => sampleSvgPath(flow.d))) {
  const result = new Map()
  for (const [direction, lanes] of Object.entries(routes)) {
    for (const lane of ['outer', 'inner']) {
      for (const index of lanes[lane]) {
        for (const emergency of index === lanes.straight ? [false, true] : [false]) {
          const path = elements[index]
          const offset = approachOffset(direction, lane, emergency)
          const approach = elements[lanes[lane][1]]
          const segments = []
          if (index >= 12) {
            const lead = elements[lanes.straight]
            const origin = lead.getPointAtLength(0)
            const bend = path.getPointAtLength(0)
            const join = Math.hypot(bend.x - origin.x, bend.y - origin.y)
            segments.push({ path: lead, offset, length: join - offset })
            segments.push({ path, offset: 0, length: path.getTotalLength() })
          } else {
            segments.push({ path, offset, length: path.getTotalLength() - offset })
          }
          const length = segments.reduce((sum, segment) => sum + segment.length, 0)
          const pointAt = distance => {
            // Queues extend backwards on the same existing incoming lane.
            if (distance < 0) return approach.getPointAtLength(Math.max(0, offset + distance))
            let remaining = Math.max(0, Math.min(length, distance))
            for (const segment of segments) {
              if (remaining <= segment.length) return segment.path.getPointAtLength(segment.offset + remaining)
              remaining -= segment.length
            }
            const last = segments.at(-1)
            return last.path.getPointAtLength(last.offset + last.length)
          }
          const transform = (progress, queueDistance = 0) => {
            const distance = Math.max(0, Math.min(1, progress)) * length - queueDistance
            const point = pointAt(distance)
            const before = pointAt(distance - 0.5)
            const after = pointAt(distance + 0.5)
            return `translate(${point.x} ${point.y}) rotate(${Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI})`
          }
          transform.pointAt = pointAt
          transform.pathLength = length
          result.set(`${index}-${emergency}`, transform)
        }
      }
    }
  }
  return result
}

export const motionPaths = createMotionPaths()
