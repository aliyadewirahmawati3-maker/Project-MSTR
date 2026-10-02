const mimeByExtension = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', ogg: 'video/ogg', mov: 'video/quicktime' }
export const localVideoAccept = '.mp4,.m4v,.webm,.ogv,.ogg,.mov,video/mp4,video/webm,video/ogg,video/quicktime'

export function validateLocalVideo(file, canPlayType) {
  if (!file || typeof file.name !== 'string' || !Number.isFinite(file.size) || file.size <= 0) {
    return 'File kosong atau tidak valid. Pilih rekaman video dari perangkat Anda.'
  }
  const extension = file.name.split('.').pop().toLowerCase()
  if (!Object.hasOwn(mimeByExtension, extension)) return 'Format tidak didukung. Pilih MP4, M4V, WebM, OGV/OGG, atau MOV yang dapat diputar browser.'
  const type = (file.type || '').toLowerCase().split(';')[0].trim()
  if (type && type !== 'application/octet-stream' && !type.startsWith('video/')) return 'File yang dipilih bukan video. Pilih rekaman video yang valid.'
  const mime = !type || type === 'application/octet-stream' ? mimeByExtension[extension] : type
  if (!['maybe', 'probably'].includes(canPlayType(mime))) return 'Browser ini tidak mendukung tipe video tersebut. Pilih format lain, misalnya MP4/H.264.'
  return ''
}

export function videoMetadata(video) {
  const { videoWidth: width, videoHeight: height, duration } = video
  if (![width, height, duration].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error('Resolusi atau durasi rekaman tidak valid. Pilih video lain dengan metadata yang dapat dibaca.')
  }
  return { width, height, aspect_ratio: width / height, duration }
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return 'Belum tersedia'
  const total = Math.floor(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')} (${seconds.toFixed(2)} detik)`
}

export function mediaErrorMessage(code) {
  return ({
    1: 'Pemutaran dibatalkan. Coba lagi atau pilih ulang video.',
    2: 'File lokal tidak dapat dibaca. Coba lagi atau pilih ulang file.',
    3: 'Video gagal didekode. File mungkin rusak atau codec tidak didukung browser.',
    4: 'Format atau codec video tidak didukung browser. Pilih rekaman lain.',
  })[code] || 'Video tidak dapat diputar. Coba lagi atau pilih rekaman lain.'
}

export function localVideoStatus(state) {
  return ({ empty: 'Belum ada video — pilih rekaman lokal', loading: 'Memuat rekaman lokal…',
    ready: 'Rekaman lokal siap — menunggu analisis AI', error: 'Rekaman lokal gagal dimuat' })[state]
}
