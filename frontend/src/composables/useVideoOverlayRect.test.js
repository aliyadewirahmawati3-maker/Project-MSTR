import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRenderer, h, nextTick, shallowRef } from 'vue'
import { useVideoOverlayRect } from './useVideoOverlayRect.js'

test('shared overlay follows resize/fullscreen, excludes bars, replaces video and cleans up', async t => {
  const previous = Object.fromEntries(['window', 'document', 'ResizeObserver'].map(key => [key, globalThis[key]]))
  const windowEvents = new EventTarget(), documentEvents = new EventTarget()
  const observers = []
  globalThis.window = windowEvents; globalThis.document = documentEvents
  globalThis.ResizeObserver = class {
    constructor(update) { this.update = update; this.targets = []; this.disconnected = false; observers.push(this) }
    observe(target) { this.targets.push(target) }
    disconnect() { this.disconnected = true }
  }
  let app
  t.after(() => {
    app?.unmount()
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value
    }
  })
  let box = { left: 27, top: 43, width: 640, height: 480 }
  const parent = { clientLeft: 2, clientTop: 3, getBoundingClientRect: () => ({ left: 25, top: 40 }) }
  const video = Object.assign(new EventTarget(), { parentElement: parent, isConnected: true,
    videoWidth: 1920, videoHeight: 1080, getBoundingClientRect: () => box })
  const source = shallowRef(video)
  let overlay
  const renderer = createRenderer({ createElement: () => ({}), insert() {}, remove() {}, patchProp() {},
    createText: () => ({}), createComment: () => ({}), setText() {}, setElementText() {}, parentNode() {}, nextSibling() {} })
  app = renderer.createApp({ setup() { overlay = useVideoOverlayRect(source); return () => h('div') } })
  app.mount({})
  await nextTick()
  assert.deepEqual(overlay.rect.value, { left: 0, top: 60, width: 640, height: 360 })
  assert.deepEqual(observers[0].targets, [video, parent])
  box = { ...box, width: 400, height: 180 }
  observers[0].update()
  assert.deepEqual(overlay.rect.value, { left: 40, top: 0, width: 320, height: 180 })
  box = { ...box, width: 1920, height: 1200 }
  documentEvents.dispatchEvent(new Event('fullscreenchange'))
  assert.deepEqual(overlay.rect.value, { left: 0, top: 60, width: 1920, height: 1080 })
  assert.equal(overlay.placement.value.top, '60px')
  source.value = null; await nextTick()
  assert.equal(overlay.rect.value, null)
  assert.equal(observers[0].disconnected, true)
  windowEvents.dispatchEvent(new Event('resize'))
  assert.equal(overlay.rect.value, null)
})
