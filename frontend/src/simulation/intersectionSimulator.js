import { approachOffset, motionPaths, routes } from './mapGeometry.js'

export const DIRECTIONS = ['west', 'east', 'north', 'south']
export const LABELS = { west: 'Barat', east: 'Timur', north: 'Utara', south: 'Selatan' }
export const TIMING = Object.freeze({ green: 23, yellow: 3, allRed: 2, vehicle: 6.4, emergency: 6.2, gap: 0.9, headway: 0.6 })
export const DENSITIES = Object.freeze({ normal: { label: 'Normal', perLane: 2 }, dense: { label: 'Padat', perLane: 3 }, congested: { label: 'Macet', perLane: 4 } })
export const QUEUE_GAP = 11
export const VEHICLE_LENGTH = Object.freeze({ car: 28, motorcycle: 20, ambulance: 30, firetruck: 36 })
const DRIVING = { car: { reaction: 0.45, acceleration: 64, speed: 52 }, motorcycle: { reaction: 0.3, acceleration: 72, speed: 55 } }
const VEHICLE_MIX = ['car', 'motorcycle', 'car', 'car', 'motorcycle']
const EPSILON = 0.000001
const nextDirection = direction => DIRECTIONS[(DIRECTIONS.indexOf(direction) + 1) % DIRECTIONS.length]

export function createSimulation() {
  const state = {
    playing: false,
    speed: 1,
    density: 'congested',
    direction: 'west',
    phase: 'green',
    remaining: TIMING.green,
    mode: 'normal',
    evp: null,
    resumeDirection: null,
    active: [],
    clearanceRemaining: 0,
    yellowCommitted: [],
    time: 0,
    serial: 0,
    lanes: Object.fromEntries(DIRECTIONS.map(direction => [direction, { outer: [], inner: [], releaseIn: { outer: 0, inner: 0 }, generated: { outer: 0, inner: 0 } }])),
  }
  setDensity(state, state.density)
  return state
}

export function lightFor(state, direction) {
  if (direction !== state.direction || state.phase === 'allRed') return 'red'
  return state.phase
}

export function queuedVehicle(state, direction, lane) {
  return state.lanes[direction][lane][0]
}

export function queuedVehicles(state) {
  return DIRECTIONS.flatMap(direction => ['outer', 'inner'].flatMap(lane => state.lanes[direction][lane]))
}

function makeQueuedVehicle(state, direction, lane, distance, reveal = 1) {
  const count = state.lanes[direction].generated[lane]++
  return {
    id: `queue-${direction}-${lane}-${count}`,
    direction,
    lane,
    route: routes[direction][lane][count % 2],
    kind: VEHICLE_MIX[(count + (lane === 'inner' ? 1 : 0)) % VEHICLE_MIX.length],
    emergency: false,
    queued: true,
    distance,
    velocity: 0,
    reaction: 0,
    reveal,
    elapsed: 0,
    duration: TIMING.vehicle,
  }
}

export function followingDistance(leader, follower) {
  return (VEHICLE_LENGTH[leader.kind] + VEHICLE_LENGTH[follower.kind]) / 2 + QUEUE_GAP
}

export function vehiclePosition(vehicle) {
  return motionPaths.get(`${vehicle.route}-${vehicle.emergency}`).pointAt(vehicle.queued ? -vehicle.distance : vehicle.travel)
}

export function collisionRadius(vehicle) {
  // Enclose the entire silhouette at every heading, with a small clearance.
  const width = vehicle.kind === 'motorcycle' ? 8.4 : 17
  return Math.hypot(VEHICLE_LENGTH[vehicle.kind] / 2, width / 2) + 1.5
}

function obstaclesFor(state) {
  return [...state.active, ...queuedVehicles(state)].map(vehicle => ({ id: vehicle.id, position: vehiclePosition(vehicle), radius: collisionRadius(vehicle) }))
}

function sweptClear(vehicle, start, end, obstacles) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  const radius = collisionRadius(vehicle)
  return obstacles.every(obstacle => {
    if (obstacle.id === vehicle.id) return true
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((obstacle.position.x - start.x) * dx + (obstacle.position.y - start.y) * dy) / lengthSquared))
    const x = start.x + t * dx - obstacle.position.x
    const y = start.y + t * dy - obstacle.position.y
    return x * x + y * y >= (radius + obstacle.radius) ** 2 - EPSILON
  })
}

function canEnter(state, vehicle) {
  if (state.lanes[vehicle.direction].releaseIn[vehicle.lane] > EPSILON) return false
  // Keep a short headway on the common lane prefix, even when routes diverge.
  if (state.active.some(leader => leader.direction === vehicle.direction && leader.lane === vehicle.lane && leader.travel < followingDistance(leader, vehicle))) return false
  const entrance = motionPaths.get(`${vehicle.route}-false`).pointAt(0)
  return sweptClear(vehicle, entrance, entrance, obstaclesFor(state))
}

export function queueLimit(direction, lane) {
  // Keep the entire car inside the existing SVG route, away from edge labels.
  return approachOffset(direction, lane) - 20
}

export function setDensity(state, density) {
  if (!Object.hasOwn(DENSITIES, density)) return false
  state.density = density
  const target = DENSITIES[density].perLane
  for (const direction of DIRECTIONS) {
    for (const lane of ['outer', 'inner']) {
      const queue = state.lanes[direction][lane]
      // An explicit density change only edits the tail; phase, active vehicle,
      // EVP and the positions of retained vehicles are preserved.
      queue.splice(target)
      while (queue.length < target) {
        const vehicle = makeQueuedVehicle(state, direction, lane, 0)
        const tail = queue.at(-1)
        vehicle.distance = tail ? tail.distance + followingDistance(tail, vehicle) : 0
        // Density controls must also respect cars already leaving this lane.
        const obstacles = obstaclesFor(state)
        while (vehicle.distance <= queueLimit(direction, lane) && !sweptClear(vehicle, vehiclePosition(vehicle), vehiclePosition(vehicle), obstacles)) vehicle.distance += 1
        if (vehicle.distance > queueLimit(direction, lane)) {
          state.lanes[direction].generated[lane]--
          break
        }
        queue.push(vehicle)
      }
    }
  }
  return true
}

function replenish(state, direction, lane) {
  const queue = state.lanes[direction][lane]
  if (queue.length >= DENSITIES[state.density].perLane) return
  const vehicle = makeQueuedVehicle(state, direction, lane, queueLimit(direction, lane), 0)
  const tail = queue.at(-1)
  if (tail && vehicle.distance - tail.distance < followingDistance(tail, vehicle)) {
    state.lanes[direction].generated[lane]--
    return
  }
  queue.push(vehicle)
}

function advanceQueues(state, delta) {
  const obstacles = obstaclesFor(state)
  for (const direction of DIRECTIONS) {
    const green = state.mode === 'normal' && lightFor(state, direction) === 'green'
    for (const lane of ['outer', 'inner']) {
      const queue = state.lanes[direction][lane]
      // Read the leader's previous position, so the start wave propagates
      // backwards instead of moving every queued vehicle in the same instant.
      const previousDistances = queue.map(vehicle => vehicle.distance)
      const previousSpeeds = queue.map(vehicle => vehicle.velocity)
      for (let index = 0; index < queue.length; index++) {
        const vehicle = queue[index]
        const clearingYellow = state.mode === 'normal' && state.phase === 'yellow' && state.yellowCommitted.includes(vehicle.id)
        if (!green && !clearingYellow) {
          vehicle.velocity = 0
          vehicle.reaction = 0
          continue
        }
        vehicle.reveal = Math.min(1, vehicle.reveal + delta / 0.65)
        const openEntrance = index === 0 && canEnter(state, vehicle)
        const incomingLeaders = index === 0 ? state.active.filter(leader => leader.direction === direction && leader.lane === lane) : []
        const target = index === 0
          ? Math.max(0, ...incomingLeaders.map(leader => followingDistance(leader, vehicle) - leader.travel))
          : previousDistances[index - 1] + followingDistance(queue[index - 1], vehicle)
        const room = Math.max(0, vehicle.distance - target)
        if (room <= EPSILON) {
          if (!openEntrance) {
            vehicle.velocity = 0
            vehicle.reaction = 0
          }
          continue
        }
        const driving = DRIVING[vehicle.kind]
        vehicle.reaction += delta
        if (vehicle.reaction < driving.reaction) continue
        // A permitted head continues through the stop point at its current
        // speed. Followers match the leader instead of braking at every slot.
        const leaderSpeed = index === 0 ? 0 : previousSpeeds[index - 1]
        const desiredSpeed = openEntrance ? driving.speed : Math.min(driving.speed, leaderSpeed + Math.sqrt(2 * driving.acceleration * room))
        const change = driving.acceleration * delta
        vehicle.velocity += Math.max(-change, Math.min(change, desiredSpeed - vehicle.velocity))
        // The hard spacing bound is independent of reaction, speed and frame
        // duration: a responsive motorcycle can never pass through its leader.
        const previous = vehicle.distance
        let proposed = Math.max(target, previous - vehicle.velocity * delta)
        const path = motionPaths.get(`${vehicle.route}-false`)
        const start = path.pointAt(-previous)
        if (!sweptClear(vehicle, start, path.pointAt(-proposed), obstacles)) {
          let safe = previous
          let blocked = proposed
          for (let iteration = 0; iteration < 12; iteration++) {
            const middle = (safe + blocked) / 2
            if (sweptClear(vehicle, start, path.pointAt(-middle), obstacles)) safe = middle
            else blocked = middle
          }
          proposed = safe
        }
        vehicle.distance = proposed
        if (!(openEntrance && proposed <= EPSILON)) vehicle.velocity = Math.max(0, (previous - proposed) / delta)
        obstacles.find(obstacle => obstacle.id === vehicle.id).position = path.pointAt(-proposed)
      }
      if (green) replenish(state, direction, lane)
    }
  }
}

function setPhase(state, phase) {
  state.phase = phase
  state.remaining = TIMING[phase]
  state.yellowCommitted = phase === 'yellow' && state.mode === 'normal'
    ? ['outer', 'inner'].map(lane => state.lanes[state.direction][lane][0]).filter(vehicle => vehicle && vehicle.distance <= 10 && vehicle.velocity > 8).map(vehicle => vehicle.id)
    : []
}

export function requestEvp(state, kind, direction) {
  if (state.evp || !DIRECTIONS.includes(direction) || !['ambulance', 'firetruck'].includes(kind)) return false
  // Keep the interrupted cycle's next direction, independent of the EVP origin.
  state.resumeDirection = nextDirection(state.direction)
  state.evp = { kind, direction, dispatched: false }
  state.yellowCommitted = []
  if (state.direction === direction && state.phase === 'green') {
    state.mode = 'priority'
    updatePriorityCountdown(state)
  } else {
    state.mode = 'preparing'
    if (state.phase === 'green') setPhase(state, 'yellow')
    // A yellow or all-red already in progress always completes its full phase.
  }
  return true
}

export function cancelEvp(state) {
  if (state.mode !== 'preparing') return false
  state.evp = null
  state.resumeDirection = null
  state.mode = 'normal'
  // Never jump back to green. Finish the current clearance sequence.
  return true
}

function updatePriorityCountdown(state) {
  const emergency = state.active.find(vehicle => vehicle.emergency)
  const remainingTravel = vehicle => (vehicle.pathLength - vehicle.travel) / vehicle.cruiseSpeed + Math.max(0, vehicle.cruiseSpeed - vehicle.velocity) / 128
  state.remaining = emergency ? remainingTravel(emergency)
    : Math.max(0, ...state.active.map(remainingTravel)) + state.clearanceRemaining + TIMING.emergency
}

function activateVehicle(state, vehicle) {
  const pathLength = motionPaths.get(`${vehicle.route}-${vehicle.emergency}`).pathLength
  const cruiseSpeed = vehicle.emergency ? pathLength / TIMING.emergency : Math.min(64, pathLength / TIMING.vehicle)
  state.active.push({ ...vehicle, queued: false, distance: 0, travel: 0, elapsed: 0, pathLength, cruiseSpeed,
    duration: pathLength / cruiseSpeed, enteredAt: state.time, enteredOn: state.phase,
    velocity: vehicle.emergency ? cruiseSpeed : vehicle.velocity,
  })
}

function dispatchEmergency(state) {
  // EVP alone waits for the whole platoon to clear. Normal traffic has no
  // global occupancy cap; its guards are per incoming lane and actual path.
  if (state.active.length || state.clearanceRemaining > EPSILON || state.phase !== 'green' || state.evp.dispatched) return
  activateVehicle(state, {
      id: ++state.serial, direction: state.direction, lane: 'inner',
      route: routes[state.direction].straight, kind: state.evp.kind,
      emergency: true,
  })
  state.evp.dispatched = true
}

function dispatchNormal(state) {
  if (state.mode !== 'normal' || state.phase === 'allRed') return
  const lanes = state.lanes[state.direction]
  for (const lane of ['outer', 'inner']) {
    const head = lanes[lane][0]
    if (!head || head.distance > EPSILON) continue
    if (state.phase !== 'green' && !state.yellowCommitted.includes(head.id)) continue
    if (!canEnter(state, head)) continue
    lanes[lane].shift()
    state.yellowCommitted = state.yellowCommitted.filter(id => id !== head.id)
    activateVehicle(state, { ...head, sourceId: head.id, id: ++state.serial })
    lanes.releaseIn[lane] = TIMING.headway
  }
}

function advanceActive(state, delta) {
  const obstacles = obstaclesFor(state)
  for (const vehicle of state.active) {
    const path = motionPaths.get(`${vehicle.route}-${vehicle.emergency}`)
    const acceleration = DRIVING[vehicle.kind]?.acceleration || 72
    let velocity = Math.min(vehicle.cruiseSpeed, vehicle.velocity + acceleration * delta)
    let proposed = Math.min(vehicle.pathLength, vehicle.travel + velocity * delta)
    // Maintain following distance on shared full paths. Diverging/crossing
    // paths are handled by swept silhouette checks below, independently.
    for (const leader of state.active) {
      if (leader.id !== vehicle.id && leader.route === vehicle.route && leader.travel > vehicle.travel) {
        proposed = Math.min(proposed, Math.max(vehicle.travel, leader.travel - followingDistance(leader, vehicle)))
      }
    }
    const start = path.pointAt(vehicle.travel)
    if (!sweptClear(vehicle, start, path.pointAt(proposed), obstacles)) {
      let safe = vehicle.travel
      let blocked = proposed
      for (let iteration = 0; iteration < 12; iteration++) {
        const middle = (safe + blocked) / 2
        if (sweptClear(vehicle, start, path.pointAt(middle), obstacles)) safe = middle
        else blocked = middle
      }
      proposed = safe
    }
    velocity = (proposed - vehicle.travel) / delta
    vehicle.velocity = Math.max(0, velocity)
    vehicle.travel = proposed
    vehicle.elapsed += delta
    obstacles.find(obstacle => obstacle.id === vehicle.id).position = path.pointAt(proposed)
  }
  const emergencyFinished = state.active.some(vehicle => vehicle.emergency && vehicle.travel >= vehicle.pathLength - EPSILON)
  state.active = state.active.filter(vehicle => vehicle.travel < vehicle.pathLength - EPSILON)
  return emergencyFinished
}

function step(state, delta) {
  state.time += delta
  for (const direction of DIRECTIONS) {
    for (const lane of ['outer', 'inner']) state.lanes[direction].releaseIn[lane] = Math.max(0, state.lanes[direction].releaseIn[lane] - delta)
  }
  if (state.active.length) state.clearanceRemaining = TIMING.gap
  else state.clearanceRemaining = Math.max(0, state.clearanceRemaining - delta)
  if (advanceActive(state, delta)) {
    state.mode = 'recovering'
    setPhase(state, 'yellow')
    advanceQueues(state, delta)
    return
  }

  if (state.mode === 'priority') {
    advanceQueues(state, delta)
    dispatchEmergency(state)
    updatePriorityCountdown(state)
    return
  }

  state.remaining = Math.max(0, state.remaining - delta)
  if (state.remaining <= EPSILON) {
    state.remaining = 0
    if (state.phase === 'green') setPhase(state, 'yellow')
    else if (state.phase === 'yellow') setPhase(state, 'allRed')
    else if (!state.active.length && state.clearanceRemaining <= EPSILON) {
      if (state.mode === 'preparing') {
        state.direction = state.evp.direction
        state.mode = 'priority'
        setPhase(state, 'green')
        dispatchEmergency(state)
        updatePriorityCountdown(state)
      } else {
        state.direction = state.mode === 'recovering' ? state.resumeDirection : nextDirection(state.direction)
        state.mode = 'normal'
        state.evp = null
        state.resumeDirection = null
        setPhase(state, 'green')
      }
    }
  }
  advanceQueues(state, delta)
  dispatchNormal(state)
}

export function advanceSimulation(state, seconds) {
  if (!state.playing || !Number.isFinite(seconds) || seconds <= 0) return
  // Small steps prevent a delayed frame or 2× speed from skipping a safety gate.
  let remaining = seconds * state.speed
  while (remaining > EPSILON) {
    const delta = Math.min(remaining, 1 / 120)
    step(state, delta)
    remaining -= delta
  }
}
