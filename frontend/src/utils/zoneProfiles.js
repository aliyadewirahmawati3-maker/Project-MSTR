import { validatePolygon } from './queueZones.js'

export async function fingerprintVideo(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function profileIssue(profile, cameraCode, metadata, tolerance = 0.005) {
  if (!profile || profile.calibration?.status !== 'VALID') return 'Profile belum memiliki kalibrasi valid.'
  if (!cameraCode || profile.camera_code !== cameraCode) return 'Kode kamera input tidak cocok dengan profile zona.'
  const ref = profile.reference_frame
  if (!ref || ![ref.width, ref.height, ref.aspect_ratio].every(v => Number.isFinite(v) && v > 0) ||
    Math.abs(ref.width / ref.height - ref.aspect_ratio) > 1e-9) return 'Ukuran acuan profile tidak valid.'
  if (!metadata || ![metadata.width, metadata.height].every(v => Number.isFinite(v) && v > 0)) return 'Menunggu metadata frame.'
  if (Math.abs((metadata.width / metadata.height) / ref.aspect_ratio - 1) > tolerance) return 'Rasio frame berbeda; kalibrasi ulang diperlukan.'
  if (profile.zones?.length !== 2 || new Set(profile.zones.map(z => z.laneType)).size !== 2) return 'Dua zona lajur wajib tersedia.'
  try {
    for (const zone of profile.zones) {
      if (zone.cameraId !== cameraCode || !['outer', 'inner'].includes(zone.laneType)) return 'Kamera/lajur polygon tidak sesuai.'
      validatePolygon(zone.polygon)
    }
  } catch { return 'Polygon profile tidak valid.' }
  return ''
}
