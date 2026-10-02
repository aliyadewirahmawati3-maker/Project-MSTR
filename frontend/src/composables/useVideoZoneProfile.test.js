import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nextTick } from 'vue'
import { sourceIdentities, zoneProfiles, zonesForCamera } from '../config/queueZones.js'
import { useLocalVideo } from './useLocalVideo.js'
import { useVideoZoneProfile } from './useVideoZoneProfile.js'
import { matchVideoIdentity, profileIssue } from '../utils/zoneProfiles.js'

const frame = (width = 1920, height = 1080) => ({ videoWidth: width, videoHeight: height, duration: 25, paused: true })
const file = code => ({ name: 'same-name.mp4', type: 'video/mp4', size: 123, hash: sourceIdentities.find(s => s.camera_code === code)?.source_sha256 || 'unknown' })
const settle = async () => { await nextTick(); await new Promise(resolve => setImmediate(resolve)) }
function setup(t, fingerprint = async file => file.hash, options = {}) {
  let serial = 0
  const video = useLocalVideo({ canPlayType: () => 'probably', urls: { createObjectURL: () => `blob:${++serial}`, revokeObjectURL() {} } })
  const zones = useVideoZoneProfile(video, { fingerprint, ...options })
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
  assert.equal(zones.status.value, 'Kalibrasi zona diperlukan')
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

test('camera selection auto-selects its profile but metadata alone never confirms a viewpoint', async t => {
  const { zones, select } = setup(t)
  await select('unknown', 1280, 720)
  zones.chooseCamera('CAM-W-01')
  assert.equal(zones.selectedProfile.value, 'CAM-W-01')
  assert.equal(zones.canAnalyzeZones.value, false)
  zones.confirmSameView(true)
  assert.equal(zones.status.value, 'Zona aktif')
})

test('local calibration handles a new aspect ratio only after save and explicit use', async t => {
  const { zones, select } = setup(t)
  await select('CAM-W-01', 640, 480)
  assert.equal(zones.status.value, 'Kalibrasi zona diperlukan')
  assert.equal(zones.beginCalibration(), true)
  const original = zonesForCamera('CAM-W-01')[0].polygon[0]
  zones.movePoint('CAM-W-01-outer', 0, [.46, .44])
  assert.deepEqual(zonesForCamera('CAM-W-01')[0].polygon[0], original)
  assert.equal(zones.saveCalibration(), true)
  assert.equal(zones.canAnalyzeZones.value, false)
  assert.equal(zones.useCalibration(), true)
  assert.equal(zones.status.value, 'Zona aktif')
  assert.deepEqual(zones.activeZones.value[0].polygon[0], [.46, .44])
  assert.equal(zones.activeProfile.value.reference_frame.aspect_ratio, 640 / 480)
  await select('unknown')
  assert.equal(zones.savedCalibration.value, null)
  assert.equal(zones.localApplied.value, false)
  assert.deepEqual(zones.activeZones.value, [])
})

test('reset restores the immutable default polygons; invalid drafts cannot be applied', async t => {
  const { zones, select } = setup(t)
  await select('CAM-W-01')
  zones.beginCalibration()
  zones.movePoint('CAM-W-01-outer', 0, [.46, .44])
  zones.resetToProfile()
  assert.deepEqual(zones.activeZones.value, zonesForCamera('CAM-W-01'))
  assert.equal(zones.editing.value, false)
  assert.equal(zones.status.value, 'Zona aktif')
  assert.equal(zones.savedCalibration.value, null)
  zones.beginCalibration()
  zones.movePoint('CAM-W-01-outer', 0, zones.draftZones.value[0].polygon[1])
  assert.equal(zones.saveCalibration(), false)
  assert.equal(zones.useCalibration(), false)
  assert.ok(zones.calibrationError.value)
  assert.equal(zones.canAnalyzeZones.value, false)
})

test('registered fingerprints must uniquely map to an existing camera/profile pair', () => {
  const identity = sourceIdentities[0]
  assert.equal(matchVideoIdentity(identity.source_sha256, [identity], zoneProfiles), identity)
  for (const identities of [[{ ...identity, camera_code: 'CAM-N-01' }],
    [{ ...identity, profile_id: 'missing' }], [{ ...identity, viewpoint_confirmed: false }], [identity, identity]]) {
    assert.equal(matchVideoIdentity(identity.source_sha256, identities, zoneProfiles), null)
  }
  assert.equal(matchVideoIdentity('', sourceIdentities, zoneProfiles), null)
})

test('hash failure retains card profile as calibration candidate without activating it', async t => {
  const { video } = setup(t)
  const zones = useVideoZoneProfile(video, { cameraCode: 'CAM-W-01', fingerprint: async () => { throw new Error('unavailable') } })
  t.after(zones.dispose)
  video.select(file('unknown')); video.ready(frame(640, 480), video.version.value)
  await settle()
  assert.equal(zones.selectedProfile.value, 'CAM-W-01')
  assert.equal(zones.status.value, 'Kalibrasi zona diperlukan')
  assert.equal(zones.beginCalibration(), true)
  assert.equal(zones.saveCalibration(), true)
  assert.equal(zones.useCalibration(), true)
  zones.resetToProfile()
  assert.equal(zones.canAnalyzeZones.value, false)
  assert.equal(zones.savedCalibration.value, null)
})


test('single queue calibration activates exactly one polygon and replacement clears it', async t => {
  const { video, zones, select } = setup(t)
  await select('CAM-W-01')
  zones.beginCalibration()
  zones.chooseLaneMode('SINGLE_QUEUE')
  assert.equal(zones.draftZones.value.length, 1)
  assert.equal(zones.saveCalibration(), true)
  assert.equal(zones.useCalibration(), true)
  assert.equal(zones.activeProfile.value.lane_mode, 'SINGLE_QUEUE')
  assert.equal(zones.activeZones.value[0].laneType, 'queue')
  video.remove()
  assert.deepEqual(zones.activeZones.value, [])
})


test('local camera defaults new calibration to one queue and can opt into legacy lanes', async t => {
  const { zones, select } = setup(t, undefined, { defaultCalibrationMode: 'SINGLE_QUEUE' })
  await select('CAM-W-01')
  zones.beginCalibration()
  assert.equal(zones.draftZones.value.length, 1)
  assert.equal(zones.draftZones.value[0].laneType, 'queue')
  zones.chooseLaneMode('DUAL_LANE')
  assert.deepEqual(zones.draftZones.value.map(z => z.laneType), ['outer', 'inner'])
  assert.equal(zones.saveCalibration(), true)
  assert.equal(zones.useCalibration(), true)
  zones.beginCalibration()
  assert.deepEqual(zones.draftZones.value.map(z => z.laneType), ['outer', 'inner'])
})
