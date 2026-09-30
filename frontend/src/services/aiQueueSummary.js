import axios from 'axios'
import { AI_SERVICE_URL } from './localInference.js'

export const QUEUE_APPROACH_ORDER = ['WEST', 'NORTH', 'EAST', 'SOUTH']

export const QUEUE_APPROACH_LABELS = {
  WEST: 'Barat',
  NORTH: 'Utara',
  EAST: 'Timur',
  SOUTH: 'Selatan',
}

const aiClient = axios.create({
  baseURL: AI_SERVICE_URL,
  timeout: 5000,
  headers: { Accept: 'application/json' },
})

function normalizeQueueValue(value, field) {
  if (value === null) return null
  if (Number.isFinite(value) && value >= 0) return value
  throw new Error(`Nilai ${field} tidak valid.`)
}

function normalizeText(value, field) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  throw new Error(`Field ${field} tidak valid.`)
}

export function normalizeQueueSummary(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Respons ringkasan antrean tidak valid.')
  }
  if (!Array.isArray(payload.approaches)) {
    throw new Error('Daftar arah ringkasan antrean tidak valid.')
  }

  const seen = new Set()
  const approaches = payload.approaches.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('Item arah ringkasan antrean tidak valid.')
    }
    const approachCode = normalizeText(item.approach_code, 'approach_code')
    if (!QUEUE_APPROACH_ORDER.includes(approachCode) || seen.has(approachCode)) {
      throw new Error('Kode arah ringkasan antrean tidak valid.')
    }
    seen.add(approachCode)
    return {
      approach_code: approachCode,
      approach_name: normalizeText(item.approach_name, 'approach_name'),
      camera_id: item.camera_id === null ? null : normalizeText(item.camera_id, 'camera_id'),
      profile_id: item.profile_id === null ? null : normalizeText(item.profile_id, 'profile_id'),
      outer_lane_queue: normalizeQueueValue(item.outer_lane_queue, 'outer_lane_queue'),
      inner_lane_queue: normalizeQueueValue(item.inner_lane_queue, 'inner_lane_queue'),
      total_queue: normalizeQueueValue(item.total_queue, 'total_queue'),
      source_type: normalizeText(item.source_type, 'source_type'),
      status: normalizeText(item.status, 'status'),
      note: normalizeText(item.note, 'note'),
      session_id: item.session_id || null,
      source_id: item.source_id || null,
      inference_enabled: item.inference_enabled === true,
      model_name: item.model_name || null,
      captured_at: item.captured_at || null,
      processed_at: item.processed_at || null,
      expires_at: item.expires_at || null,
      video_time_seconds: item.video_time_seconds ?? null,
      inference_duration_ms: item.inference_duration_ms ?? null,
      stale: item.stale === true,
    }
  })

  if (QUEUE_APPROACH_ORDER.some(code => !seen.has(code))) {
    throw new Error('Ringkasan antrean belum memuat empat arah.')
  }

  approaches.sort((a, b) => QUEUE_APPROACH_ORDER.indexOf(a.approach_code) - QUEUE_APPROACH_ORDER.indexOf(b.approach_code))

  return {
    source_type: normalizeText(payload.source_type, 'source_type'),
    configuration_valid: payload.configuration_valid === true,
    inference_enabled: payload.inference_enabled === true,
    source_validation: normalizeText(payload.source_validation, 'source_validation'),
    error_code: payload.error_code === null || payload.error_code === undefined ? null : normalizeText(payload.error_code, 'error_code'),
    approaches,
  }
}

export async function getLocalVideoQueueSummary(signal, mode) {
  const { data } = await aiClient.get('/local-video/queue-summary', {
    signal,
    params: mode === 'YOLO_LOCAL_REALTIME' ? { mode } : undefined,
    validateStatus: status => status === 200 || status === 503,
  })
  return normalizeQueueSummary(data)
}

export function formatQueueValue(value) {
  return Number.isFinite(value) ? String(value) : '-'
}

export function laneQueueLabel(value) {
  return Number.isFinite(value) ? `${value} kendaraan` : 'Menunggu deteksi'
}
