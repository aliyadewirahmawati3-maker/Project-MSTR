import test from 'node:test'
import assert from 'node:assert/strict'
import { advanceSimulation, cancelEvp, collisionRadius, createSimulation, DENSITIES, DIRECTIONS, followingDistance, lightFor, queuedVehicles, queueLimit, requestEvp, setDensity, TIMING, vehiclePosition } from './intersectionSimulator.js'
import { flows, motionPaths, routes } from './mapGeometry.js'

const running = () => ({ ...createSimulation(), playing: true })
const queuePositions = state => queuedVehicles(state).map(vehicle => [vehicle.id, vehicle.distance])
function until(state, predicate, timeout = 160) {
  for (let time = 0; time < timeout; time += 0.04) {
    if (predicate(state)) return
    advanceSimulation(state, 0.04)
  }
  assert.fail(`State not reached: ${state.mode}/${state.direction}/${state.phase}`)
}

function assertSafety(state) {
  const vehicles = [...state.active, ...queuedVehicles(state)]
  assert.equal(new Set(vehicles.map(vehicle => vehicle.id)).size, vehicles.length)
  assert.ok(DIRECTIONS.filter(direction => lightFor(state, direction) === 'green').length <= 1)
  for (const direction of DIRECTIONS) {
    for (const lane of ['outer', 'inner']) {
      const queue = state.lanes[direction][lane]
      assert.ok(queue.length <= DENSITIES[state.density].perLane)
      for (let index = 0; index < queue.length; index++) {
        assert.ok(queue[index].distance >= 0 && queue[index].distance <= queueLimit(direction, lane))
        if (index > 0) assert.ok(queue[index].distance - queue[index - 1].distance >= followingDistance(queue[index - 1], queue[index]) - 0.00001)
      }
    }
  }
  const positions = vehicles.map(vehiclePosition)
  const radii = vehicles.map(collisionRadius)
  for (let first = 0; first < vehicles.length; first++) {
    for (let second = first + 1; second < vehicles.length; second++) {
      const distance = Math.hypot(positions[first].x - positions[second].x, positions[first].y - positions[second].y)
      assert.ok(distance >= radii[first] + radii[second] - 0.00001,
        `silhouettes overlap: ${vehicles[first].id}/${vehicles[second].id} at ${state.time}, gap ${distance}`)
    }
  }
}

test('initial/reset state is paused in Macet, with Barat green for 23 seconds and mixed queues', () => {
  const state = createSimulation()
  assert.equal(state.playing, false)
  assert.equal(state.density, 'congested')
  assert.equal(state.remaining, 23)
  assert.deepEqual(state.active, [])
  assert.deepEqual(DIRECTIONS.map(direction => lightFor(state, direction)), ['green', 'red', 'red', 'red'])
  for (const direction of DIRECTIONS) {
    for (const lane of ['outer', 'inner']) {
      assert.equal(state.lanes[direction][lane].length, 4)
      assert.equal(new Set(state.lanes[direction][lane].map(vehicle => vehicle.kind)).size, 2)
    }
  }
  const before = structuredClone(state)
  advanceSimulation(state, 60)
  assert.deepEqual(state, before)
  assertSafety(state)
})

test('both lane heads depart together, then followers start after 0.3–0.7 seconds', () => {
  const state = running()
  advanceSimulation(state, 0.01)
  assert.equal(state.active.length, 2)
  assert.deepEqual(state.active.map(vehicle => vehicle.lane), ['outer', 'inner'])
  assert.equal(state.active[0].enteredAt, state.active[1].enteredAt)
  const followers = ['outer', 'inner'].map(lane => state.lanes.west[lane][0])
  const positions = followers.map(vehicle => vehicle.distance)
  const started = [null, null]
  for (let index = 0; index < 80; index++) {
    advanceSimulation(state, 0.01)
    followers.forEach((vehicle, lane) => {
      if (started[lane] === null && vehicle.distance < positions[lane] - 0.00001) started[lane] = state.time
    })
  }
  for (const time of started) assert.ok(time >= 0.3 && time <= 0.7, `reaction time ${time}`)
  assertSafety(state)
})

test('both lanes sustain a dense platoon while earlier vehicles are still inside the intersection', () => {
  const state = running()
  const departures = new Map()
  let peakConcurrent = 0
  for (let index = 0; index < 1100; index++) {
    advanceSimulation(state, 0.02)
    peakConcurrent = Math.max(peakConcurrent, state.active.length)
    for (const vehicle of state.active) departures.set(vehicle.id, { ...vehicle })
    if (index % 10 === 0) assertSafety(state)
  }
  assert.ok(peakConcurrent >= 8)
  assert.ok(departures.size >= 24, `only ${departures.size} vehicles admitted during green`)
  for (const lane of ['outer', 'inner']) {
    const times = [...departures.values()].filter(vehicle => vehicle.lane === lane).map(vehicle => vehicle.enteredAt)
    assert.ok(times[1] - times[0] < 2.2, 'followers must not wait for a full traversal')
    for (let index = 1; index < times.length; index++) {
      assert.ok(times[index] - times[index - 1] >= TIMING.headway - 0.00001)
      assert.ok(times[index] - times[index - 1] < 3, 'flow must continue throughout green')
    }
  }
})

test('all 16 routes stay collision-free through complete B/T/U/S cycles and clearance phases', () => {
  const state = running()
  const greens = ['west']
  const usedRoutes = new Set()
  let phase = state.phase
  let phaseTime = 0
  for (let index = 0; index < 4600; index++) {
    const previousActive = new Set(state.active.map(vehicle => vehicle.id))
    const allowedYellow = new Set(state.yellowCommitted)
    const previousPhase = state.phase
    advanceSimulation(state, 0.04)
    phaseTime += 0.04
    assertSafety(state)
    for (const vehicle of state.active) {
      usedRoutes.add(vehicle.route)
      if (!previousActive.has(vehicle.id)) {
        assert.notEqual(vehicle.enteredOn, 'allRed')
        if (previousPhase === 'yellow' && vehicle.enteredOn === 'yellow') assert.ok(allowedYellow.has(vehicle.sourceId))
      }
    }
    if (state.phase !== phase) {
      assert.ok(phaseTime >= TIMING[phase] - 0.041)
      if (state.phase === 'green') {
        greens.push(state.direction)
        assert.ok(state.active.every(vehicle => vehicle.direction === state.direction))
      }
      phase = state.phase
      phaseTime = 0
    }
  }
  assert.deepEqual(greens.slice(0, 5), ['west', 'east', 'north', 'south', 'west'])
  assert.equal(usedRoutes.size, 16)
})

test('a slow leader constrains its own path while the parallel lane keeps flowing', () => {
  const state = running()
  advanceSimulation(state, 0.01)
  const pathLength = motionPaths.get('0-false').pathLength
  const leader = { ...state.active[0], route: 0, travel: 100, pathLength, velocity: 10, cruiseSpeed: 10, kind: 'car' }
  const follower = { ...leader, id: 1000, travel: 60, velocity: 60, cruiseSpeed: 64 }
  const parallel = { ...state.active[1], route: 8, travel: 100, pathLength: motionPaths.get('8-false').pathLength, velocity: 64, cruiseSpeed: 64 }
  state.active = [leader, parallel, follower]
  for (let index = 0; index < 100; index++) {
    advanceSimulation(state, 0.01)
    assertSafety(state)
    assert.ok(leader.travel - follower.travel >= followingDistance(leader, follower) - 0.00001)
  }
  assert.ok(parallel.travel >= 163)
  assert.ok(follower.velocity <= 10.01)
})

test('only moving vehicles already near the stop point can enter on yellow', () => {
  const state = running()
  const allowed = []
  for (const lane of ['outer', 'inner']) {
    for (const vehicle of state.lanes.west[lane]) vehicle.distance += 5
    const head = state.lanes.west[lane][0]
    head.velocity = 20
    head.reaction = 1
    allowed.push(head.id)
  }
  const waiting = queuePositions(state).filter(([id]) => !allowed.includes(id))
  state.remaining = 0.005
  advanceSimulation(state, 0.7)
  assert.equal(state.phase, 'yellow')
  assert.equal(state.active.length, 2)
  assert.ok(state.active.every(vehicle => vehicle.enteredOn === 'yellow' && allowed.includes(vehicle.sourceId)))
  assert.deepEqual(queuePositions(state), waiting)
  const serial = state.serial
  advanceSimulation(state, 2.4)
  assert.equal(state.phase, 'allRed')
  assert.equal(state.serial, serial)
  assertSafety(state)
})

test('all-red admits nobody and waits for the entire platoon plus clearance gap', () => {
  const state = running()
  advanceSimulation(state, 5)
  assert.ok(state.active.length >= 6)
  state.remaining = 0.005
  advanceSimulation(state, 3.1)
  assert.equal(state.phase, 'allRed')
  const serial = state.serial
  const stopped = queuePositions(state)
  advanceSimulation(state, 2.1)
  assert.equal(state.phase, 'allRed')
  assert.equal(state.remaining, 0)
  assert.equal(state.serial, serial)
  assert.deepEqual(queuePositions(state), stopped)
  until(state, state => state.phase === 'green')
  assert.equal(state.direction, 'east')
  assert.ok(state.active.every(vehicle => vehicle.direction === 'east'))
})

test('red queues stay still; Pause freezes platoons and timers; 2× stays deterministic', () => {
  const state = running()
  const redQueues = queuePositions(state).filter(([id]) => !id.includes('west'))
  advanceSimulation(state, 3)
  assert.deepEqual(queuePositions(state).filter(([id]) => !id.includes('west')), redQueues)
  state.playing = false
  const before = structuredClone(state)
  advanceSimulation(state, 40)
  assert.deepEqual(state, before)
  const one = running()
  const two = { ...running(), speed: 2 }
  advanceSimulation(one, 4)
  advanceSimulation(two, 2)
  assert.deepEqual({ ...two, speed: 1 }, one)
})

test('density changes retain active platoons, signals, EVP and existing queue positions', () => {
  const state = running()
  advanceSimulation(state, 2)
  requestEvp(state, 'ambulance', 'north')
  state.playing = false
  const before = structuredClone(state)
  const positions = new Map(queuePositions(state))
  for (const density of ['normal', 'dense', 'congested']) {
    assert.equal(setDensity(state, density), true)
    assert.deepEqual(state.active, before.active)
    assert.deepEqual(state.evp, before.evp)
    assert.equal(state.phase, before.phase)
    assert.equal(state.remaining, before.remaining)
    for (const [id, distance] of queuePositions(state)) if (positions.has(id)) assert.equal(distance, positions.get(id))
    assertSafety(state)
  }
  assert.equal(setDensity(state, 'invalid'), false)
})

test('replacement vehicles fade in on the existing approaches without queue teleports', () => {
  const state = running()
  const ids = new Set(queuedVehicles(state).map(vehicle => vehicle.id))
  advanceSimulation(state, 0.02)
  const arriving = queuedVehicles(state).filter(vehicle => !ids.has(vehicle.id))
  assert.equal(arriving.length, 2)
  for (const vehicle of arriving) {
    assert.equal(vehicle.distance, queueLimit(vehicle.direction, vehicle.lane))
    assert.ok(vehicle.reveal < 1)
  }
  const positions = new Map(queuePositions(state))
  advanceSimulation(state, 1)
  for (const vehicle of arriving) assert.equal(vehicle.reveal, 1)
  for (const [id, distance] of queuePositions(state)) if (positions.has(id)) assert.ok(distance <= positions.get(id))
  assertSafety(state)
})

for (const kind of ['ambulance', 'firetruck']) {
  for (const direction of DIRECTIONS) {
    test(`${kind}/${direction}: clear the entire platoon, traverse alone, then restore the cycle`, () => {
      const state = running()
      advanceSimulation(state, 3)
      assert.ok(state.active.length >= 4)
      const admitted = new Set(state.active.map(vehicle => vehicle.id))
      const stopped = queuePositions(state)
      assert.equal(requestEvp(state, kind, direction), true)
      assert.equal(state.phase, direction === 'west' ? 'green' : 'yellow')
      assert.equal(requestEvp(state, kind, direction), false)
      let waited = 0
      while (!state.active.some(vehicle => vehicle.emergency) && waited < 20) {
        advanceSimulation(state, 0.04)
        waited += 0.04
        assert.ok(state.active.every(vehicle => vehicle.emergency || admitted.has(vehicle.id)))
        assert.deepEqual(queuePositions(state), stopped)
        assertSafety(state)
      }
      assert.equal(state.active.length, 1)
      assert.equal(state.active[0].emergency, true)
      assert.equal(state.active[0].direction, direction)
      assert.equal(state.direction, direction)
      assert.ok(waited > 5)
      assert.equal(cancelEvp(state), false)
      until(state, state => state.mode === 'recovering')
      assert.deepEqual(state.active, [])
      assert.equal(state.phase, 'yellow')
      assert.deepEqual(queuePositions(state), stopped)
      advanceSimulation(state, 3)
      assert.equal(state.phase, 'allRed')
      advanceSimulation(state, 2)
      assert.equal(state.mode, 'normal')
      assert.equal(state.direction, 'east')
      assert.equal(state.evp, null)
      assertSafety(state)
    })
  }
}

for (const phase of ['yellow', 'allRed']) {
  test(`cancel during ${phase} completes clearance without spawning emergency traffic`, () => {
    const state = running()
    requestEvp(state, 'firetruck', 'north')
    until(state, state => state.phase === phase)
    const remaining = state.remaining
    assert.equal(cancelEvp(state), true)
    assert.equal(state.phase, phase)
    assert.equal(state.remaining, remaining)
    until(state, state => state.phase === 'green')
    assert.equal(state.direction, 'east')
    assert.equal(state.evp, null)
    assert.ok(state.active.every(vehicle => !vehicle.emergency))
  })
}

test('random platoons, EVP, density changes, pause and 2× speed remain collision-free', () => {
  const state = running()
  let seed = 581
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32 }
  for (let index = 0; index < 7000; index++) {
    if (random() < 0.004) requestEvp(state, random() < 0.5 ? 'ambulance' : 'firetruck', DIRECTIONS[Math.floor(random() * 4)])
    if (random() < 0.006) cancelEvp(state)
    if (random() < 0.005) setDensity(state, Object.keys(DENSITIES)[Math.floor(random() * 3)])
    state.speed = random() < 0.5 ? 1 : 2
    state.playing = random() > 0.05
    const before = structuredClone(state)
    advanceSimulation(state, 0.04)
    if (!state.playing) assert.deepEqual(state, before)
    assert.ok(state.remaining >= 0)
    if (before.phase === 'allRed' && state.phase === 'allRed') assert.equal(state.serial, before.serial)
    if (state.active.some(vehicle => vehicle.emergency)) assert.equal(state.active.length, 1)
    assertSafety(state)
  }
})

test('motion and guards share 16 original paths, including incoming turn segments', () => {
  assert.equal(flows.length, 16)
  const entrances = { west: [[260, 322], [244, 365]], east: [[512, 451], [528, 408]], north: [[451, 260], [408, 244]], south: [[322, 512], [365, 528]] }
  for (const direction of DIRECTIONS) {
    for (const [laneIndex, lane] of ['outer', 'inner'].entries()) {
      for (const route of routes[direction][lane]) {
        const path = motionPaths.get(`${route}-false`)
        assert.deepEqual(Object.values(path.pointAt(0)), entrances[direction][laneIndex])
        assert.ok(path.pathLength > 300)
        for (let distance = -queueLimit(direction, lane); distance < path.pathLength; distance += 4) {
          const point = path.pointAt(distance)
          assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y))
          const next = path.pointAt(distance + 4)
          assert.ok(Math.hypot(next.x - point.x, next.y - point.y) <= 4.001)
        }
      }
    }
  }
})
