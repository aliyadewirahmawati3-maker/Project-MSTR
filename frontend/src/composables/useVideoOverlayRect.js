import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { containedVideoRect } from '../utils/queueZones.js'

export function useVideoOverlayRect(videoSource) {
  const rect = ref(null)
  const placement = computed(() => rect.value && Object.fromEntries(Object.entries(rect.value).map(([key, value]) => [key, `${value}px`])))
  let cleanup = () => {}
  watch(videoSource, video => {
    cleanup(); rect.value = null
    if (!video) return
    const update = () => {
      const frame = video.parentElement
      if (!frame || !video.isConnected) { rect.value = null; return }
      const box = video.getBoundingClientRect(), parent = frame.getBoundingClientRect()
      const image = containedVideoRect(box.width, box.height, video.videoWidth, video.videoHeight)
      rect.value = image && { ...image, left: image.left + box.left - parent.left - frame.clientLeft,
        top: image.top + box.top - parent.top - frame.clientTop }
    }
    const observer = new ResizeObserver(update)
    observer.observe(video)
    if (video.parentElement) observer.observe(video.parentElement)
    const events = ['loadedmetadata', 'resize']
    events.forEach(event => video.addEventListener(event, update))
    window.addEventListener('resize', update)
    document.addEventListener('fullscreenchange', update)
    cleanup = () => {
      observer.disconnect()
      events.forEach(event => video.removeEventListener(event, update))
      window.removeEventListener('resize', update)
      document.removeEventListener('fullscreenchange', update)
    }
    update()
  }, { immediate: true, flush: 'post' })
  onBeforeUnmount(() => cleanup())
  return { rect, placement }
}
