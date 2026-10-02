export const DEFAULT_OVERLAY_CONFIDENCE = 0.45
const CLASSES = new Set(['car', 'motorcycle', 'bus', 'truck'])
const LABEL_HEIGHT = 18
const GAP = 3

export function overlayConfidence(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value : DEFAULT_OVERLAY_CONFIDENCE
}

const overlaps = (a, b) => a.left < b.left + b.width + GAP && a.left + a.width + GAP > b.left &&
  a.top < b.top + b.height + GAP && a.top + a.height + GAP > b.top

// Presentation only: never mutate inference results or recalculate queue counts.
export function layoutDetections(detections, frame, { minConfidence = DEFAULT_OVERLAY_CONFIDENCE, mode = 'compact', showOutside = true } = {}) {
  if (!frame || !Number.isFinite(frame.width) || !Number.isFinite(frame.height) || frame.width <= 0 || frame.height <= 0) return []
  const threshold = overlayConfidence(minConfidence)
  const boxes = detections.flatMap(detection => {
    if (!detection || !CLASSES.has(detection.class_name) || !Number.isFinite(detection.confidence) ||
      detection.confidence < threshold || detection.confidence > 1 || !Array.isArray(detection.bbox) ||
      detection.bbox.length !== 4 || !detection.bbox.every(Number.isFinite)) return []
    const bbox = detection.bbox.map(value => Math.max(0, Math.min(1, value)))
    if (bbox[2] <= bbox[0] || bbox[3] <= bbox[1]) return []
    const inQueueZone = detection.in_queue_zone === true
    if (!showOutside && !inQueueZone) return []
    return [{ class_name: detection.class_name, confidence: detection.confidence, bbox,
      in_queue_zone: inQueueZone, lane_zone: inQueueZone ? detection.lane_zone ?? null : null }]
  }).sort((a, b) => b.confidence - a.confidence)
  const occupied = []
  return boxes.map(detection => {
    const [x1, y1, x2, y2] = detection.bbox
    const boxWidth = (x2 - x1) * frame.width, boxHeight = (y2 - y1) * frame.height
    const text = detection.class_name + (mode === 'detail' ? ` ${Math.round(detection.confidence * 100)}%` : '')
    // Fixed-width monospace labels keep collision bounds consistent with the DOM.
    const width = text.length * 7 + 10
    if (boxWidth < 24 || boxHeight < 18 || boxWidth * boxHeight < 600 || width > frame.width || LABEL_HEIGHT > frame.height) return detection
    const left = Math.max(0, Math.min(frame.width - width, x1 * frame.width))
    const candidates = [y1 * frame.height - LABEL_HEIGHT - GAP, y1 * frame.height + GAP, y2 * frame.height + GAP]
    for (const top of candidates) {
      const label = { text, left, top, width, height: LABEL_HEIGHT }
      if (top < 0 || top + LABEL_HEIGHT > frame.height || occupied.some(other => overlaps(label, other))) continue
      occupied.push(label)
      return { ...detection, label }
    }
    return detection
  })
}
