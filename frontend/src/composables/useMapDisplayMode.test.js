import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ref } from 'vue'
import { useMapDisplayMode } from './useMapDisplayMode.js'

test('map defaults to visual simulation with an explicit source disclaimer', () => {
  const map = useMapDisplayMode()
  assert.equal(map.mode.value, 'SIMULATION_VISUAL')
  assert.equal(map.isSimulation.value, true)
  assert.equal(map.presentation.value.label, 'Simulasi visual')
  assert.equal(map.presentation.value.help, 'Bukan data CCTV/YOLO.')
})

test('standalone map without an inference provider remains a safe placeholder', () => {
  const map = useMapDisplayMode()
  map.selectMode('YOLO_LOCAL_REALTIME')
  assert.equal(map.mode.value, 'YOLO_LOCAL_REALTIME')
  assert.equal(map.isSimulation.value, false)
  assert.equal(map.presentation.value.label, 'YOLO lokal')
  assert.equal(map.presentation.value.status, 'Menunggu integrasi YOLO')
  assert.equal(map.presentation.value.help, 'Mode ini disiapkan untuk deteksi lokal dari video, bukan CCTV live ATCS.')
})

test('connected map follows inference readiness without claiming detection on selection', () => {
  const status = ref('Menunggu video')
  const map = useMapDisplayMode(status)
  map.selectMode('YOLO_LOCAL_REALTIME')
  assert.equal(map.presentation.value.status, 'Menunggu video')
  status.value = 'Model tidak tersedia'
  assert.equal(map.presentation.value.status, 'Model tidak tersedia')
  status.value = 'Mendeteksi'
  assert.equal(map.presentation.value.status, 'Mendeteksi')
  assert.equal(map.isSimulation.value, false)
})

test('returning to simulation restores its display without leaking the YOLO status', () => {
  const map = useMapDisplayMode()
  map.selectMode('YOLO_LOCAL_REALTIME')
  map.selectMode('SIMULATION_VISUAL')
  assert.equal(map.isSimulation.value, true)
  assert.equal(map.presentation.value.label, 'Simulasi visual')
  assert.equal(map.presentation.value.status, '')
  assert.equal(map.presentation.value.help, 'Bukan data CCTV/YOLO.')
})

test('invalid mode falls back safely and display preferences are not shared between instances', () => {
  const map = useMapDisplayMode()
  map.selectMode('YOLO_LOCAL_REALTIME')
  assert.equal(useMapDisplayMode().mode.value, 'SIMULATION_VISUAL')
  for (const value of ['UNKNOWN', null, undefined]) {
    map.selectMode(value)
    assert.equal(map.mode.value, 'SIMULATION_VISUAL')
  }
})
