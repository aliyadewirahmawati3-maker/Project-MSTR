import { validateLaneZones, laneModeForZones } from './laneMode.js'
import { validatePolygon } from './queueZones.js'

export const copyZones = zones => zones.map(zone => ({ ...zone, polygon: zone.polygon.map(point => [...point]) }))

export function validateLocalZones(zones, cameraCode) {
  validateLaneZones(zones)
  for (const zone of zones) {
    if (zone.cameraId !== cameraCode || !['queue', 'outer', 'inner'].includes(zone.laneType)) throw new Error('Kamera dan profile zona tidak cocok.')
    validatePolygon(zone.polygon)
  }
  return true
}

export function normalizedPointer(clientX, clientY, rect) {
  if (!rect || rect.width <= 0 || rect.height <= 0) return null
  return [Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
    Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))]
}

export function pointInZone([x, y], polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, ay] = polygon[j], [bx, by] = polygon[i]
    const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax)
    if (Math.abs(cross) < 1e-12 && x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by)) return true
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside
  }
  return inside
}

export function applyLocalCalibration(result, zones, cameraCode, now = Date.now()) {
  if (!result || result.source_type !== 'YOLO_LOCAL_REALTIME' || result.inference_enabled !== true || result.stale !== false ||
    !['DETECTION_READY', 'ZONE_CALIBRATION_REQUIRED'].includes(result.status) ||
    !Number.isFinite(Date.parse(result.expires_at)) || Date.parse(result.expires_at) <= now || !Array.isArray(result.detections)) return result
  validateLocalZones(zones, cameraCode)
  let outer = 0, inner = 0, ambiguous = 0
  const single = laneModeForZones(zones) === 'SINGLE_QUEUE'
  for (const detection of result.detections) {
    if (!['car', 'motorcycle', 'bus', 'truck'].includes(detection.class_name) || !Number.isFinite(detection.confidence) ||
      detection.confidence < 0 || detection.confidence > 1 || !Array.isArray(detection.bbox) || detection.bbox.length !== 4 ||
      !detection.bbox.every(value => Number.isFinite(value) && value >= 0 && value <= 1)) continue
    const [x1, y1, x2, y2] = detection.bbox
    if (x2 <= x1 || y2 <= y1) continue
    const lanes = zones.filter(zone => pointInZone([(x1 + x2) / 2, y2], zone.polygon))
    if (lanes.length === 1) { if (lanes[0].laneType !== 'inner') outer++; else inner++ }
    else if (lanes.length > 1) ambiguous++
  }
  return { ...result, status: 'DETECTION_READY', lane_mode: single ? 'SINGLE_QUEUE' : 'DUAL_LANE', queue_count: outer + inner, outer_lane_queue: outer, inner_lane_queue: single ? null : inner,
    total_queue: outer + inner, ambiguous_detections: ambiguous, local_calibration: true,
    note: (single ? 'Satu zona: outer_lane_queue alias queue_count; inner_lane_queue null karena tidak digunakan. ' : '') + 'Okupansi zona kalibrasi lokal dari bbox YOLO frame terbaru; bukan hitungan kumulatif.' }
}
