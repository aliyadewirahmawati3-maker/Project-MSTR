export const INFERENCE_LABELS = Object.freeze({
  MODEL_LOADING: 'Memuat model', DETECTING: 'Mendeteksi', DETECTION_READY: 'Mendeteksi',
  WAITING_FOR_VIDEO: 'Menunggu video', WAITING_FOR_DETECTION: 'Menunggu video',
  ZONE_CALIBRATION_REQUIRED: 'Kalibrasi zona', STALE: 'Data kedaluwarsa',
  YOLO_MODEL_UNAVAILABLE: 'Model tidak tersedia', AI_OFFLINE: 'AI offline',
  INFERENCE_ERROR: 'Inference gagal', PAUSED: 'Video dijeda', DISABLED: 'Menunggu AI',
  INVALID_FRAME: 'Frame tidak valid',
})
export const inferenceLabel = status => INFERENCE_LABELS[status] || 'Menunggu video'

export function freshYoloResult(row, now = Date.now()) {
  return row?.source_type === 'YOLO_LOCAL_REALTIME' && row.inference_enabled === true && row.stale === false &&
    row.status === 'DETECTION_READY' && Number.isFinite(Date.parse(row.expires_at)) && Date.parse(row.expires_at) > now
}

export function safeYoloRow(row, session, now = Date.now()) {
  if (session && row.session_id === session.session_id && row.source_id === session.source_id && freshYoloResult(row, now)) return row
  return { ...row, outer_lane_queue: null, inner_lane_queue: null, total_queue: null,
    stale: row.stale || Boolean(row.expires_at && Date.parse(row.expires_at) <= now) }
}
