import assert from 'node:assert/strict'
import { test } from 'node:test'
import axios from 'axios'

// Exercise the real Laravel responses; failures are injected only in this client.
const transport = axios.getAdapter(axios.defaults.adapter)
let scenario = 'online'
const requests = []
axios.defaults.adapter = config => {
  requests.push(config.url)
  assert.equal(config.timeout, 5000)
  if (scenario === 'offline') return Promise.reject(new Error('Network unavailable'))
  if (scenario === 'partial' && config.url.endsWith('/cameras')) return Promise.reject(new Error('HTTP 500'))
  if (scenario === 'malformed' && config.url === '/health') return Promise.resolve({ data: '<html>Not API</html>', status: 200, config })
  if (scenario === 'missing' && config.url === '/intersections') return Promise.resolve({ data: { status: 'success', data: [] }, status: 200, config })
  if (scenario === 'degraded' && config.url === '/health') return Promise.resolve({ data: { status: 'degraded', database: { connected: false } }, status: 503, config })
  return transport(config)
}
const { useDashboardConfiguration } = await import('./useDashboardConfiguration.js')

test('Laravel configuration, offline, partial failure, degraded health and refresh recovery', async () => {
  const dashboard = useDashboardConfiguration()
  const first = dashboard.refresh()
  assert.equal(dashboard.refreshing.value, true)
  assert.equal(dashboard.statusMessage.value, 'Memuat konfigurasi simpang…')
  await first
  assert.equal(dashboard.error.value, '')
  assert.equal(dashboard.databaseStatus.value, 'Online')
  const data = dashboard.configuration.value
  assert.equal(data.intersection.code, 'BDG-IBR-ADJ-01')
  assert.equal(data.approaches.length, 4)
  assert.ok(data.approaches.every(approach => approach.lanes.length === 2))
  assert.equal(data.cameras.length, 4)
  assert.ok(data.cameras.every(camera => camera.status === 'UNCONFIGURED' && camera.stream_url === null))
  assert.equal(data.signalPhases.length, 2)
  assert.equal(new Set(requests).size, 7)

  for (const failure of ['offline', 'partial', 'malformed', 'missing', 'degraded']) {
    scenario = failure
    await dashboard.refresh()
    assert.equal(dashboard.refreshing.value, false)
    assert.ok(dashboard.error.value)
    if (failure === 'offline') {
      assert.equal(dashboard.statusMessage.value, 'Backend tidak dapat dihubungi; simulator lokal tetap aktif.')
      assert.equal(dashboard.backendStatus.value, 'Offline')
      assert.equal(dashboard.configuration.value, null)
    }
    if (failure === 'partial' || failure === 'missing') assert.equal(dashboard.configuration.value, null)
    if (failure === 'degraded') assert.equal(dashboard.databaseStatus.value, 'Offline')
    scenario = 'online'
    await dashboard.refresh()
    assert.equal(dashboard.error.value, '')
    assert.equal(dashboard.configuration.value.intersection.code, 'BDG-IBR-ADJ-01')
  }
  dashboard.dispose()
})
