import axios from 'axios'

const client = axios.create({
  baseURL: import.meta.env?.VITE_API_BASE_URL || 'http://localhost:8000/api',
  timeout: 5000,
  headers: { Accept: 'application/json' },
})

export async function getHealth(signal) {
  const { data } = await client.get('/health', {
    signal,
    validateStatus: status => status === 200 || status === 503,
  })
  if (!['ok', 'degraded'].includes(data?.status) || typeof data?.database?.connected !== 'boolean') {
    throw new Error('Respons health tidak valid.')
  }
  return data
}

async function getData(path, signal, collection = false) {
  const { data: response } = await client.get(path, { signal })
  const data = response?.data
  if (response?.status !== 'success' || !data ||
      (collection ? !Array.isArray(data) || data.some(item => !item || typeof item !== 'object') : typeof data !== 'object' || Array.isArray(data))) {
    throw new Error('Respons konfigurasi tidak valid.')
  }
  return data
}

export async function getDashboardConfiguration(signal) {
  const intersections = await getData('/intersections', signal, true)
  const selected = intersections.find(item => item.code === 'BDG-IBR-ADJ-01')
  if (!selected?.id) throw new Error('Simpang BDG-IBR-ADJ-01 tidak ditemukan.')
  const path = `/intersections/${encodeURIComponent(selected.id)}`
  const [intersection, approaches, cameras, systemStatus, signalPhases] = await Promise.all([
    getData(path, signal),
    getData(`${path}/approaches`, signal, true),
    getData(`${path}/cameras`, signal, true),
    getData(`${path}/system-status`, signal),
    getData(`${path}/signal-phases`, signal, true),
  ])
  return { intersection, approaches, cameras, systemStatus, signalPhases }
}

export function directionLabel(direction) {
  return { WEST: 'Barat', NORTH: 'Utara', EAST: 'Timur', SOUTH: 'Selatan' }[direction] || direction || '—'
}

export function movementLabel(rule) {
  return { LEFT_OR_STRAIGHT: 'belok kiri / lurus', STRAIGHT_OR_RIGHT: 'lurus / belok kanan' }[rule] || rule || 'Belum tersedia'
}
