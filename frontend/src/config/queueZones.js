import source from '../../../config/cctv/queue_zones.json' with { type: 'json' }
import { validateQueueZones } from '../utils/queueZones.js'

export const queueZoneSchemaVersion = 1
export const queueZoneMethod = 'MANUAL_LOCAL_OFFLINE'

// Adapt the inspected, versioned Stage 3 polygons without a second coordinate copy.
export const queueZones = source.cameras.flatMap(camera => camera.zones.map(zone => ({
  id: zone.zone_id,
  cameraId: camera.camera_code,
  laneType: zone.lane_type,
  label: zone.lane_type === 'queue' ? `Antrean ${camera.direction_label}` : `Zona ${camera.direction_label} — lajur ${zone.lane_type === 'outer' ? 'luar' : 'dalam'}`,
  movementRule: zone.movement_rules,
  movementLabel: zone.lane_type === 'queue' ? 'antrean utama' : zone.lane_type === 'outer' ? 'belok kiri / lurus' : 'lurus / belok kanan',
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

function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}

export const zoneProfiles = freeze(source.cameras.map(camera => ({
  lane_mode: camera.lane_mode || 'DUAL_LANE',
  profile_id: camera.profile_id,
  camera_code: camera.camera_code,
  direction: camera.direction,
  reference_frame: { ...camera.reference_frame },
  calibration: { ...camera.calibration, reference_source_sha256: camera.source_sha256,
    reference_frame_seconds: camera.reference_frame_seconds, notes: camera.geometry_notes },
  zones: zonesForCamera(camera.camera_code),
})))
export const sourceIdentities = freeze(source.video_sources.map(identity => ({ ...identity })))
export const aspectRatioTolerance = source.aspect_ratio_tolerance
