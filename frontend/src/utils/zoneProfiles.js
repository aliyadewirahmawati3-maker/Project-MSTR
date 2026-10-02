import { validateLaneZones } from './laneMode.js'
import { validatePolygon } from './queueZones.js'

export async function fingerprintVideo(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

// Dimensions/duration describe a recording, but cannot prove its camera viewpoint.
// Only a registered fingerprint with an explicit viewpoint confirmation is trusted.
export function matchVideoIdentity(hash, identities, profiles) {
  if (!hash) return null
  const matches = identities.filter(item => item.source_sha256 === hash && item.viewpoint_confirmed === true &&
    profiles.some(profile => profile.profile_id === item.profile_id && profile.camera_code === item.camera_code))
  return matches.length === 1 ? matches[0] : null
}

export function profileIssue(profile, cameraCode, metadata, tolerance = 0.005) {
  if (!profile || profile.calibration?.status !== 'VALID') return 'Profile belum memiliki kalibrasi valid.'
  if (!cameraCode || profile.camera_code !== cameraCode) return 'Kode kamera input tidak cocok dengan profile zona.'
  const ref = profile.reference_frame
  if (!ref || ![ref.width, ref.height, ref.aspect_ratio].every(v => Number.isFinite(v) && v > 0) ||
    Math.abs(ref.width / ref.height - ref.aspect_ratio) > 1e-9) return 'Ukuran acuan profile tidak valid.'
  if (!metadata || ![metadata.width, metadata.height].every(v => Number.isFinite(v) && v > 0)) return 'Menunggu metadata frame.'
  if (Math.abs((metadata.width / metadata.height) / ref.aspect_ratio - 1) > tolerance) return 'Rasio frame berbeda; kalibrasi ulang diperlukan.'
  try { validateLaneZones(profile.zones, profile.lane_mode) } catch { return 'Zona harus sesuai mode antrean.' }
  try {
    for (const zone of profile.zones) {
      if (zone.cameraId !== cameraCode || !['queue', 'outer', 'inner'].includes(zone.laneType)) return 'Kamera/lajur polygon tidak sesuai.'
      validatePolygon(zone.polygon)
    }
  } catch { return 'Polygon profile tidak valid.' }
  return ''
}
