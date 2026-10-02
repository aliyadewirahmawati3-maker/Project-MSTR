export const AI_SERVICE_URL = (import.meta.env?.VITE_AI_SERVICE_URL?.trim() || 'http://localhost:8001').replace(/\/+$/, '')
const configuredInterval = Number(import.meta.env?.VITE_YOLO_INTERVAL_MS)
export const FRAME_INTERVAL_MS = Number.isFinite(configuredInterval) && configuredInterval >= 500 ? configuredInterval : 1000
export const MIN_FRAME_INTERVAL_MS = Number.isFinite(configuredInterval) && configuredInterval >= 500 ? configuredInterval : 500
const configuredFps = Number(import.meta.env?.VITE_YOLO_FPS)
export const DEFAULT_INFERENCE_FPS = configuredFps === 1 || configuredFps === 2 ? configuredFps : FRAME_INTERVAL_MS === 500 ? 2 : 1

async function request(path, options = {}) {
  // Browser-selected frames must never be sent to an internet hostname.
  const url = new URL(AI_SERVICE_URL)
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Inference snapshot hanya diizinkan ke FastAPI localhost.')
  }
  const response = await fetch(`${AI_SERVICE_URL}/local-video${path}`, { ...options, redirect: 'error' })
  if (!response.ok) {
    const error = new Error(`AI service: HTTP ${response.status}`)
    error.status = response.status
    throw error
  }
  return response.json()
}

export const inferenceApi = {
  start: (body, signal) => request('/sessions', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  stop: session => request(`/sessions/${session.camera_id}/${session.session_id}`, { method: 'DELETE', keepalive: true }),
  detect: (metadata, blob, signal) => request('/detect-frame', {
    method: 'POST', signal, headers: { 'Content-Type': blob.type, 'X-Frame-Metadata': JSON.stringify(metadata) }, body: blob,
  }),
}

export async function captureVideoFrame(video) {
  if (!video || video.paused || video.ended || video.seeking || video.readyState < 2 || !video.videoWidth) return null
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight))
  canvas.width = Math.round(video.videoWidth * scale)
  canvas.height = Math.round(video.videoHeight * scale)
  const metadata = { original_width: video.videoWidth, original_height: video.videoHeight,
    frame_width: canvas.width, frame_height: canvas.height, video_time_seconds: video.currentTime,
    captured_at: new Date().toISOString() }
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .85))
  if (!blob || blob.size > 2 * 1024 * 1024) throw new Error('Snapshot tidak valid atau melebihi 2 MiB.')
  return { blob, metadata }
}
