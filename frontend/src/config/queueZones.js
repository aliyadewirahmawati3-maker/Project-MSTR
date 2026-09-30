import source from '../../../config/cctv/queue_zones.json' with { type: 'json' }
import { validateQueueZones } from '../utils/queueZones.js'

export const queueZoneSchemaVersion = 1
export const queueZoneMethod = 'MANUAL_LOCAL_OFFLINE'

// Adapt the inspected, versioned Stage 3 polygons without a second coordinate copy.
export const queueZones = source.cameras.flatMap(camera => camera.zones.map(zone => ({
  id: zone.zone_id,
  cameraId: camera.camera_code,
  laneType: zone.lane_type,
  label: `Zona ${camera.direction_label} — lajur ${zone.lane_type === 'outer' ? 'luar' : 'dalam'}`,
  movementRule: zone.movement_rules,
  movementLabel: zone.lane_type === 'outer' ? 'belok kiri / lurus' : 'lurus / belok kanan',
  polygon: zone.polygon.map(point => [...point]),
})))

validateQueueZones(queueZones)
for (const zone of queueZones) {
  zone.polygon.forEach(Object.freeze)
  Object.freeze(zone.polygon)
  Object.freeze(zone)
}
Object.freeze(queueZones)

export function zonesForCamera(cameraId) {
  return queueZones.filter(zone => zone.cameraId === cameraId)
}
