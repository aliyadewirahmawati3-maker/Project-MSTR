import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nextTick } from 'vue'
import { sourceIdentities, zoneProfiles, zonesForCamera } from '../config/queueZones.js'
import { useLocalVideo } from './useLocalVideo.js'
import { useVideoZoneProfile } from './useVideoZoneProfile.js'
import { profileIssue } from '../utils/zoneProfiles.js'

const frame = (width = 1920, height = 1080) => ({ videoWidth: width, videoHeight: height, duration: 25, paused: true })
const file = code => ({ name: 'same-name.mp4', type: 'video/mp4', size: 123, hash: sourceIdentities.find(s => s.camera_code === code)?.source_sha256 || 'unknown' })
const settle = async () => { await nextTick(); await new Promise(resolve => setImmediate(resolve)) }
function setup(t, fingerprint = async file => file.hash) {
  let serial = 0
  const video = useLocalVideo({ canPlayType: () => 'probably', urls: { createObjectURL: () => `blob:${++serial}`, revokeObjectURL() {} } })
  const zones = useVideoZoneProfile(video, { fingerprint })
  t.after(() => { zones.dispose(); video.dispose() })
  const select = async (code, width, height) => {
    video.select(file(code))
    video.ready(frame(width, height), video.version.value)
    await settle()
  }
  return { video, zones, select }
}

test('CAM-W source uses West; replacement CAM-N uses North, never old polygons', async t => {
  const { video, zones, select } = setup(t)
  await select('CAM-W-01')
  assert.deepEqual(zones.activeZones.value, zonesForCamera('CAM-W-01'))
  zones.analysisResult.value = Symbol('previous result marker')
  video.select(file('CAM-N-01'))
  assert.equal(video.metadata.value, null)
  assert.equal(zones.analysisResult.value, null)
  assert.deepEqual(zones.activeZones.value, [])
  assert.equal(zones.canAnalyzeZones.value, false)
  video.ready(frame(), video.version.value)
  await settle()
  assert.equal(zones.inputCameraCode.value, 'CAM-N-01')
  assert.deepEqual(zones.activeZones.value, zonesForCamera('CAM-N-01'))
  assert.ok(zones.activeZones.value.every(zone => zone.cameraId !== 'CAM-W-01'))
})

test('unknown source has no fallback even with identical filename/resolution', async t => {
  const { zones, select } = setup(t)
  await select('CAM-W-01')
  await select('unknown')
  assert.deepEqual(zones.activeZones.value, [])
  assert.equal(zones.activeProfile.value, null)
  assert.equal(zones.canAnalyzeZones.value, false)
  assert.equal(zones.status.value, 'Zona antrean belum dikalibrasi untuk sumber ini')
})

test('mismatched camera/profile disables zone analysis', async t => {
  const { zones, select } = setup(t)
  await select('CAM-N-01')
  zones.chooseProfile('CAM-W-01')
  assert.equal(zones.inputCameraCode.value, 'CAM-N-01')
  assert.deepEqual(zones.activeZones.value, [])
  assert.match(zones.issue.value, /Kode kamera input tidak cocok/)
  zones.chooseProfile('CAM-N-01')
  assert.equal(zones.canAnalyzeZones.value, true)
})

test('same-camera proportional resolution changes retain normalized polygons', async t => {
  const { zones, select } = setup(t)
  await select('CAM-W-01', 1280, 720)
  assert.deepEqual(zones.activeZones.value, zonesForCamera('CAM-W-01'))
  await select('CAM-W-01', 640, 480)
  assert.deepEqual(zones.activeZones.value, [])
  assert.match(zones.issue.value, /Rasio frame berbeda/)
})

test('unknown recording requires camera, matching profile and explicit same-view confirmation', async t => {
  const { zones, select } = setup(t)
  await select('unknown', 1280, 720)
  zones.chooseCamera('CAM-W-01')
  zones.chooseProfile('CAM-N-01')
  zones.confirmSameView(true)
  assert.equal(zones.canAnalyzeZones.value, false)
  zones.chooseProfile('CAM-W-01')
  assert.equal(zones.canAnalyzeZones.value, false)
  zones.confirmSameView(true)
  assert.equal(zones.canAnalyzeZones.value, true)
  await select('unknown')
  assert.equal(zones.sameViewConfirmed.value, false)
  assert.deepEqual(zones.activeZones.value, [])
})

test('late fingerprint of replaced West cannot overwrite current North identity', async t => {
  const pending = []
  const { video, zones } = setup(t, selected => new Promise(resolve => pending.push(() => resolve(selected.hash))))
  video.select(file('CAM-W-01')); video.ready(frame(), video.version.value)
  await nextTick()
  video.select(file('CAM-N-01')); video.ready(frame(), video.version.value)
  await nextTick()
  pending[1](); await settle()
  pending[0](); await settle()
  assert.equal(zones.activeProfile.value.camera_code, 'CAM-N-01')
})

test('remove, retry, decode failure and hash failure cannot retain active zones/results', async t => {
  const { video, zones, select } = setup(t)
  await select('CAM-W-01')
  zones.analysisResult.value = Symbol('previous result marker')
  video.failed(3, video.version.value)
  assert.equal(zones.analysisResult.value, null)
  assert.equal(zones.activeProfile.value, null)
  video.retry()
  assert.equal(zones.activeProfile.value, null)
  video.remove()
  await settle()
  assert.deepEqual(zones.activeZones.value, [])
  const broken = setup(t, async () => { throw new Error('hash unavailable') })
  await broken.select('CAM-W-01')
  assert.equal(broken.zones.canAnalyzeZones.value, false)
})

test('profiles include camera, direction, reference size/ratio and valid calibration', () => {
  assert.equal(zoneProfiles.length, 4)
  for (const profile of zoneProfiles) {
    assert.ok(profile.camera_code && profile.direction && profile.calibration.revision)
    assert.equal(profileIssue(profile, profile.camera_code, { width: 1280, height: 720 }), '')
    const invalid = structuredClone(profile)
    invalid.calibration.status = 'UNCALIBRATED'
    assert.ok(profileIssue(invalid, profile.camera_code, { width: 1280, height: 720 }))
  }
})
