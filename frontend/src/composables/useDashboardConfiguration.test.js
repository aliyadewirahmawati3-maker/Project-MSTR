import assert from 'node:assert/strict'
import { test } from 'node:test'
import axios from 'axios'

// Exercise the real Laravel responses; failures are injected only in this client.
const transport = axios.getAdapter(axios.defaults.adapter)
let scenario = 'online'
let pollingHealth
let pendingHealthSignal
const requests = []
axios.defaults.adapter = config => {
  requests.push(config.url)
  assert.equal(config.timeout, 5000)
  if (scenario === 'slow-health' && config.url === '/health') {
    pendingHealthSignal = config.signal
    return new Promise((resolve, reject) => config.signal.addEventListener('abort', () => reject(new axios.CanceledError()), { once: true }))
  }
  if (scenario === 'polling' && config.url === '/health') return Promise.resolve({ data: pollingHealth, status: 200, config })
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
      assert.equal(dashboard.configuration.value.intersection.code, 'BDG-IBR-ADJ-01')
      assert.equal(dashboard.configurationFresh.value, false)
    }
    if (failure === 'partial' || failure === 'missing') assert.equal(dashboard.configurationFresh.value, false)
    if (failure === 'degraded') assert.equal(dashboard.databaseStatus.value, 'Offline')
    scenario = 'online'
    await dashboard.refresh()
    assert.equal(dashboard.error.value, '')
    assert.equal(dashboard.configuration.value.intersection.code, 'BDG-IBR-ADJ-01')
  }
  dashboard.dispose()
})

test('health polling waits 15 seconds, preserves configuration and stops on dispose', async t => {
  const dashboard = useDashboardConfiguration()
  t.after(() => dashboard.dispose())
  // Load actual API data before advancing fake time.
  scenario = 'online'
  await dashboard.refresh()
  assert.equal(dashboard.configurationFresh.value, true)
  t.mock.timers.enable({ apis: ['setTimeout'] })
  // Use a cached, real health response for deterministic timer assertions.
  const onlineHealth = dashboard.health.value
  // The instance captured the wrapper at import time; it delegates to this scenario.
  pollingHealth = onlineHealth
  scenario = 'polling'
  await dashboard.start()
  const count = requests.length
  t.mock.timers.tick(14_999)
  assert.equal(requests.length, count)
  t.mock.timers.tick(1)
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(requests.slice(count), ['/health'])
  assert.equal(dashboard.configurationFresh.value, true)
  scenario = 'offline'
  t.mock.timers.tick(15_000)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(dashboard.configurationFresh.value, false)
  assert.equal(dashboard.backendStatus.value, 'Offline')
  assert.ok(dashboard.configuration.value)
  dashboard.dispose()
  const stoppedCount = requests.length
  t.mock.timers.tick(60_000)
  assert.equal(requests.length, stoppedCount)
})

test('slow health does not overlap; manual refresh and dispose cancel pending requests', async t => {
  scenario = 'online'
  const dashboard = useDashboardConfiguration()
  t.after(() => dashboard.dispose())
  t.mock.timers.enable({ apis: ['setTimeout'] })
  await dashboard.start()
  scenario = 'slow-health'
  const beforePoll = requests.length
  t.mock.timers.tick(15_000)
  await new Promise(resolve => setImmediate(resolve))
  t.mock.timers.tick(45_000)
  assert.deepEqual(requests.slice(beforePoll), ['/health'])
  assert.equal(pendingHealthSignal.aborted, false)
  scenario = 'online'
  await dashboard.refresh()
  assert.equal(pendingHealthSignal.aborted, true)
  assert.equal(dashboard.configurationFresh.value, true)
  scenario = 'slow-health'
  t.mock.timers.tick(15_000)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(pendingHealthSignal.aborted, false)
  dashboard.dispose()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(pendingHealthSignal.aborted, true)
  const stoppedCount = requests.length
  t.mock.timers.tick(60_000)
  assert.equal(requests.length, stoppedCount)
})
