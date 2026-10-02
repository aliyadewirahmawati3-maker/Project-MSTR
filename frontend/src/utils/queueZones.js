import { validateLaneZones } from './laneMode.js'

const cameras = ['CAM-W-01', 'CAM-N-01', 'CAM-E-01', 'CAM-S-01']
const rules = {
  queue: ['QUEUE', 'antrean utama'],
  outer: ['LEFT_OR_STRAIGHT', 'belok kiri / lurus'],
  inner: ['STRAIGHT_OR_RIGHT', 'lurus / belok kanan'],
}
const fields = ['id', 'cameraId', 'laneType', 'label', 'movementRule', 'movementLabel', 'polygon']
const epsilon = 1e-12
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

function require(condition, message) {
  if (!condition) throw new Error(message)
}

function onSegment(a, b, p) {
  return Math.abs(cross(a, b, p)) < epsilon &&
    p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0]) &&
    p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1])
}

function intersects(a, b, c, d) {
  return (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) ||
    onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b)
}

export function validatePolygon(polygon) {
  require(Array.isArray(polygon) && polygon.length >= 3, 'Polygon minimal tiga titik')
  for (const point of polygon) {
    require(Array.isArray(point) && point.length === 2 &&
      point.every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1),
    'Koordinat polygon harus angka finite dalam rentang 0–1')
  }
  require(new Set(polygon.map(point => point.join(','))).size === polygon.length, 'Titik polygon berulang')
  const n = polygon.length
  let doubleArea = 0
  for (let i = 0; i < n; i++) {
    const a = polygon[i], b = polygon[(i + 1) % n], c = polygon[(i + 2) % n]
    doubleArea += a[0] * b[1] - b[0] * a[1]
    // Adjacent collinear edges may continue forward, but must not double back.
    require(Math.abs(cross(a, b, c)) >= epsilon ||
      (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) >= 0,
    'Sisi polygon saling menimpa')
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue
      require(!intersects(a, b, polygon[j], polygon[(j + 1) % n]), 'Polygon memotong dirinya sendiri')
    }
  }
  require(Math.abs(doubleArea) > 2e-6, 'Luas polygon harus positif dan tidak degenerat')
  return true
}

export function validateQueueZones(zones) {
  require(Array.isArray(zones) && zones.length >= 4 && zones.length <= 8, 'Konfigurasi harus tepat 8 zona')
  const seen = new Set()
  for (const zone of zones) {
    require(zone && typeof zone === 'object' && Object.keys(zone).length === fields.length &&
      fields.every(field => Object.hasOwn(zone, field)),
    'Hanya field konfigurasi zona yang diperbolehkan; tanpa data analisis')
    require(cameras.includes(zone.cameraId), 'cameraId tidak dikenal')
    require(Object.hasOwn(rules, zone.laneType), 'laneType harus outer atau inner')
    require(zone.id === `${zone.cameraId}-${zone.laneType}` && !seen.has(zone.id), 'ID zona tidak sesuai atau berulang')
    seen.add(zone.id)
    require(typeof zone.label === 'string' && zone.label.trim().length > 0, 'Label zona wajib diisi')
    require(zone.movementRule === rules[zone.laneType][0] && zone.movementLabel === rules[zone.laneType][1],
      'Aturan lajur tidak sesuai')
    validatePolygon(zone.polygon)
  }
  for (const cameraId of cameras) {
    validateLaneZones(zones.filter(zone => zone.cameraId === cameraId))
  }
  return true
}

// Match object-fit: contain, excluding any horizontal or vertical letterbox bars.
export function containedVideoRect(width, height, videoWidth, videoHeight) {
  if (![width, height, videoWidth, videoHeight].every(value => Number.isFinite(value) && value > 0)) return null
  const scale = Math.min(width / videoWidth, height / videoHeight)
  const imageWidth = videoWidth * scale, imageHeight = videoHeight * scale
  return { left: (width - imageWidth) / 2, top: (height - imageHeight) / 2, width: imageWidth, height: imageHeight }
}

export function polygonCentroid(polygon) {
  let area = 0, x = 0, y = 0
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length]
    const weight = a[0] * b[1] - b[0] * a[1]
    area += weight
    x += (a[0] + b[0]) * weight
    y += (a[1] + b[1]) * weight
  })
  return [x / (3 * area), y / (3 * area)]
}
