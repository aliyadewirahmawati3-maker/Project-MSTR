const waiting = { label: 'Menunggu', variant: 'neutral', help: 'Menunggu deteksi', note: '' }
const offline = { label: 'AI offline', variant: 'danger', help: 'Service AI tidak terhubung.', note: '' }
const sources = {
  OFFLINE_CONFIG: waiting,
  WAITING_FOR_DETECTION: { ...waiting, label: 'Belum deteksi' },
  SIMULATOR: { label: 'Simulator', variant: 'amber', help: 'Angka antrean berasal dari mode demo.', note: 'Mode demo simulator.' },
  OFFLINE_ESTIMATION: { label: 'Estimasi offline', variant: 'amber', help: 'Angka berasal dari estimasi offline.', note: 'Estimasi offline; belum ada deteksi YOLO.' },
  YOLO_LOCAL_REALTIME: { label: 'YOLO lokal', variant: 'blue', help: 'Deteksi lokal dari video, bukan CCTV live ATCS.', note: 'Deteksi YOLO lokal, bukan CCTV live ATCS.' },
  YOLO_OFFLINE_DETECTION: { label: 'YOLO offline', variant: 'blue', help: 'Deteksi dari rekaman offline.', note: 'Deteksi YOLO dari rekaman offline.' },
}

// Presentation only. Knowing a mode name never activates an analyzer.
export function getQueueSourcePresentation(sourceType, status) {
  if (['ERROR', 'OFFLINE', 'AI_OFFLINE'].includes(status) || ['ERROR', 'OFFLINE', 'AI_OFFLINE'].includes(sourceType)) return { ...offline }
  if (status === 'LOADING') return { label: 'Memuat', variant: 'neutral', help: 'Memuat ringkasan antrean…', note: '' }
  // A configured YOLO/simulator mode without results must not look active.
  if (status === 'WAITING_FOR_DETECTION' || status === 'WAITING_FOR_DATA') return { ...waiting }
  return { ...(sources[sourceType] || waiting) }
}

export const formatQueueSourceLabel = (sourceType, status) => getQueueSourcePresentation(sourceType, status).label
export const getQueueSourceBadge = (sourceType, status) => `badge-${getQueueSourcePresentation(sourceType, status).variant}`
export const getQueueSourceHelpText = (sourceType, status) => getQueueSourcePresentation(sourceType, status).help
