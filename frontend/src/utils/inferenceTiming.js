export const OVERLAY_HOLD_MS = 1500

export function inferenceFps(value) {
  return Number(value) === 2 ? 2 : 1
}

export function samplingInterval(fps, roundTripMs, serverMinimumMs = 0) {
  // Try 2 FPS only after a completed request fits its 500 ms budget.
  const fast = inferenceFps(fps) === 2 && Number.isFinite(roundTripMs) && roundTripMs <= 500
  return Math.max(fast ? 500 : 1000, serverMinimumMs)
}

export function overlayTiming(result, now, videoTime, holdMs = OVERLAY_HOLD_MS) {
  if (!result) return { expired: false, delayed: false, ageMs: null }
  const expires = Date.parse(result.expires_at)
  const captured = Date.parse(result.captured_at)
  const ageMs = Number.isFinite(captured) ? Math.max(0, now - captured) : null
  const videoLag = Number.isFinite(result.video_time_seconds) && Number.isFinite(videoTime)
    ? videoTime - result.video_time_seconds : 0
  return {
    expired: result.stale === true || !Number.isFinite(expires) || expires <= now,
    delayed: ageMs === null || ageMs > holdMs || videoLag > holdMs / 1000 || videoLag < -.1,
    ageMs,
  }
}
