import assert from 'node:assert/strict'
import { test } from 'node:test'
import source from '../../../config/cctv/queue_zones.json' with { type: 'json' }
import { queueZones, queueZoneMethod, queueZoneSchemaVersion, zonesForCamera } from './queueZones.js'
import { containedVideoRect, polygonCentroid, validatePolygon, validateQueueZones } from '../utils/queueZones.js'

test('eight manual zones, two lanes per camera, with original inspected coordinates', () => {
  assert.equal(queueZoneSchemaVersion, 1)
  assert.equal(queueZoneMethod, 'MANUAL_LOCAL_OFFLINE')
  assert.equal(validateQueueZones(queueZones), true)
  assert.equal(queueZones.length, 8)
  for (const camera of source.cameras) {
    const zones = zonesForCamera(camera.camera_code)
    assert.equal(zones.length, 2)
    assert.deepEqual(zones.map(zone => zone.laneType), ['outer', 'inner'])
    for (const zone of zones) {
      const original = camera.zones.find(item => item.zone_id === zone.id)
      assert.deepEqual(zone.polygon, original.polygon)
      assert.equal(zone.movementRule, original.movement_rules)
      assert.ok(zone.label.includes(camera.direction_label))
    }
  }
  assert.deepEqual(zonesForCamera('UNKNOWN'), [])
})

test('configuration is immutable, including polygon points', () => {
  assert.throws(() => queueZones.push({}), TypeError)
  assert.throws(() => { queueZones[0].polygon[0][0] = 0 }, TypeError)
})

test('reject missing, additional, duplicate, or wrongly mapped zones', () => {
  assert.throws(() => validateQueueZones(queueZones.slice(1)))
  assert.throws(() => validateQueueZones([...queueZones, queueZones[0]]))
  const zones = structuredClone(queueZones)
  zones[7] = zones[0]
  assert.throws(() => validateQueueZones(zones))
  for (const [field, value] of [['cameraId', 'CAM-X-01'], ['laneType', 'middle'], ['id', 'invalid'], ['label', ' '], ['movementRule', 'RIGHT'], ['movementLabel', 'belok kanan']]) {
    const invalid = structuredClone(queueZones)
    invalid[0][field] = value
    assert.throws(() => validateQueueZones(invalid), field)
  }
})

test('reject nonfinite, nonnumeric and out-of-range coordinates', () => {
  for (const value of [-0.01, 1.01, NaN, Infinity, true, null, '0.5']) {
    const zones = structuredClone(queueZones)
    zones[0].polygon[0][0] = value
    assert.throws(() => validateQueueZones(zones), String(value))
  }
})

test('reject too few/repeated points, zero area, crossings and overlapping edges', () => {
  for (const polygon of [
    [[0, 0], [1, 1]],
    [[0, 0], [0.5, 0.5], [1, 1]],
    [[0, 0], [1, 0], [1, 1], [0, 0]],
    [[0, 0], [1, 0.8], [0, 1], [0.8, 0]],
    [[0, 0], [1, 0], [0.5, 0], [1, 1], [0, 1]],
  ]) assert.throws(() => validatePolygon(polygon))
  assert.equal(validatePolygon([[0, 0], [1, 0], [0, 1]]), true)
  assert.equal(validatePolygon([[0, 0], [0, 1], [1, 0]]), true)
})

test('allow only configuration fields; reject tracking, vehicle and analysis payloads', () => {
  const allowed = ['cameraId', 'id', 'label', 'laneType', 'movementLabel', 'movementRule', 'polygon']
  for (const zone of queueZones) assert.deepEqual(Object.keys(zone).sort(), allowed)
  for (const field of ['tracking_id', 'vehicles', 'vehicle_count', 'detections', 'congestion', 'plate', 'face']) {
    const zones = structuredClone(queueZones)
    zones[0][field] = null
    assert.throws(() => validateQueueZones(zones), /Hanya field konfigurasi/)
  }
})

test('overlay exactly fits matching video aspect ratio and scales responsively', () => {
  assert.deepEqual(containedVideoRect(320, 180, 1920, 1080), { left: 0, top: 0, width: 320, height: 180 })
  assert.deepEqual(containedVideoRect(640, 360, 1920, 1080), { left: 0, top: 0, width: 640, height: 360 })
})

test('overlay excludes letterboxing on both axes and waits for video metadata', () => {
  assert.deepEqual(containedVideoRect(320, 240, 1920, 1080), { left: 0, top: 30, width: 320, height: 180 })
  assert.deepEqual(containedVideoRect(400, 180, 1920, 1080), { left: 40, top: 0, width: 320, height: 180 })
  for (const dimensions of [[0, 180, 1920, 1080], [320, 180, 0, 0], [320, NaN, 1920, 1080]]) {
    assert.equal(containedVideoRect(...dimensions), null)
  }
})

test('label centroid respects polygon geometry and vertex winding', () => {
  const square = [[0, 0], [1, 0], [1, 1], [0, 1]]
  assert.deepEqual(polygonCentroid(square), [0.5, 0.5])
  assert.deepEqual(polygonCentroid(square.toReversed()), [0.5, 0.5])
  for (const zone of queueZones) assert.ok(polygonCentroid(zone.polygon).every(value => value >= 0 && value <= 1))
})
