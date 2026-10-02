import assert from 'node:assert/strict'
import { test } from 'node:test'
import { useLocalVideo } from './useLocalVideo.js'
import { formatDuration, validateLocalVideo, videoMetadata } from '../utils/localVideo.js'

const file = (name = 'rekaman.mp4', type = 'video/mp4', size = 100) => ({ name, type, size })
const video = { videoWidth: 1920, videoHeight: 1080, duration: 25.067, paused: true }
const canPlayType = type => ['video/mp4', 'video/webm'].includes(type) ? 'probably' : ''
function setup() {
  const created = [], revoked = []
  const registration = useLocalVideo({ canPlayType, urls: {
    createObjectURL(selected) { created.push(selected); return `blob:local-test-${created.length}` },
    revokeObjectURL(url) { revoked.push(url) },
  } })
  return { registration, created, revoked }
}

test('empty state has no file, URL, or metadata until user selects a video', () => {
  const { registration: r, created } = setup()
  assert.equal(r.state.value, 'empty')
  assert.equal(r.source.value, '')
  assert.equal(r.file.value, null)
  assert.equal(r.metadata.value, null)
  assert.match(r.status.value, /Belum ada video/)
  assert.deepEqual(created, [])
})

test('validate extension, MIME, nonempty file and browser support', () => {
  for (const valid of [file(), file('A.MP4', ''), file('a.m4v', 'application/octet-stream'), file('a.webm', 'video/webm')]) {
    assert.equal(validateLocalVideo(valid, canPlayType), '')
  }
  for (const invalid of [null, file('x.mp4', 'video/mp4', 0), file('x.txt', 'text/plain'),
    file('x.mp4', 'text/plain'), file('x.avi', 'video/x-msvideo'), file('x.mov', 'video/quicktime')]) {
    assert.ok(validateLocalVideo(invalid, canPlayType))
  }
  assert.ok(validateLocalVideo(file(), () => ''))
  assert.equal(validateLocalVideo(file(), () => 'maybe'), '')
})

test('ready status requires readable frame and real media metadata; pause does not imply AI', () => {
  const { registration: r } = setup()
  r.select(file())
  assert.equal(r.state.value, 'loading')
  assert.ok(r.readMetadata(video, r.version.value))
  assert.equal(r.state.value, 'loading')
  assert.ok(r.ready(video, r.version.value))
  assert.equal(r.status.value, 'Rekaman lokal siap — menunggu analisis AI')
  assert.deepEqual(r.metadata.value, { width: 1920, height: 1080, aspect_ratio: 1920 / 1080, duration: 25.067 })
  r.setPlayback('Rekaman dijeda · tekan Putar', r.version.value)
  assert.equal(r.state.value, 'ready')
  assert.match(r.playback.value, /dijeda/)
})

test('metadata rejects zero/nonfinite dimensions and unknown duration', () => {
  for (const patch of [{ videoWidth: 0 }, { videoHeight: NaN }, { duration: Infinity }, { duration: 0 }]) {
    assert.throws(() => videoMetadata({ ...video, ...patch }))
  }
  const { registration: r } = setup()
  r.select(file())
  assert.equal(r.ready({ ...video, duration: Infinity }, r.version.value), false)
  assert.equal(r.state.value, 'error')
  assert.equal(r.metadata.value, null)
})

test('invalid selection and picker cancellation preserve an existing valid video', () => {
  const { registration: r, created, revoked } = setup()
  r.select(file())
  r.ready(video, r.version.value)
  const currentUrl = r.source.value
  assert.equal(r.select(undefined), false)
  assert.equal(r.select(file('wrong.txt', 'text/plain')), false)
  assert.equal(r.source.value, currentUrl)
  assert.equal(r.state.value, 'ready')
  assert.ok(r.selectionError.value)
  assert.equal(created.length, 1)
  assert.deepEqual(revoked, [])
})

test('replacement revokes previous URL, clears metadata, and ignores old media/autoplay events', () => {
  const { registration: r, revoked } = setup()
  r.select(file())
  const oldVersion = r.version.value, oldUrl = r.source.value
  r.ready(video, oldVersion)
  r.select(file('second.webm', 'video/webm'))
  assert.deepEqual(revoked, [oldUrl])
  assert.equal(r.metadata.value, null)
  r.failed(3, oldVersion)
  assert.equal(r.ready(video, oldVersion), false)
  r.setPlayback('Old autoplay result', oldVersion)
  assert.equal(r.state.value, 'loading')
  assert.equal(r.playback.value, '')
})

test('decode errors cannot claim readiness; retry creates a fresh URL for the same file', () => {
  const { registration: r, created, revoked } = setup()
  const selected = file()
  r.select(selected)
  r.failed(3, r.version.value)
  assert.equal(r.state.value, 'error')
  assert.match(r.failure.value, /didekode/)
  assert.equal(r.ready(video, r.version.value), false)
  assert.ok(r.retry())
  assert.equal(r.state.value, 'loading')
  assert.equal(created[0], created[1])
  assert.equal(revoked.length, 1)
  assert.ok(r.ready(video, r.version.value))
})

test('remove and dispose release URLs exactly once and prevent late resurrection', () => {
  const { registration: r, revoked } = setup()
  r.select(file())
  const token = r.version.value
  r.remove()
  r.failed(2, token)
  r.ready(video, token)
  assert.equal(r.state.value, 'empty')
  assert.equal(r.file.value, null)
  assert.equal(r.metadata.value, null)
  assert.equal(r.source.value, '')
  r.dispose()
  assert.equal(revoked.length, 1)
  r.select(file())
  r.dispose()
  assert.equal(revoked.length, 2)
})

test('autoplay denial retains a ready recording and controls can start playback', () => {
  const { registration: r } = setup()
  r.select(file())
  r.ready(video, r.version.value)
  r.setPlayback('Autoplay tidak dimulai · tekan Putar', r.version.value)
  assert.equal(r.state.value, 'ready')
  r.setPlayback('Memutar rekaman', r.version.value)
  assert.equal(r.playback.value, 'Memutar rekaman')
})

test('independent camera instances and new sessions never restore file access', () => {
  const a = setup(), b = setup()
  a.registration.select(file())
  assert.equal(b.registration.source.value, '')
  a.registration.dispose()
  assert.equal(setup().registration.state.value, 'empty')
})

test('object URL failure is recoverable and duration formatting is honest', () => {
  const r = useLocalVideo({ canPlayType, urls: { createObjectURL() { throw new Error('Unavailable') } } })
  assert.equal(r.select(file()), false)
  assert.equal(r.state.value, 'empty')
  assert.match(r.selectionError.value, /Akses file gagal/)
  assert.equal(formatDuration(25.067), '0:25 (25.07 detik)')
  assert.equal(formatDuration(Infinity), 'Belum tersedia')
})
