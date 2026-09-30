import { computed, ref, shallowRef } from 'vue'
import { localVideoStatus, mediaErrorMessage, validateLocalVideo, videoMetadata } from '../utils/localVideo.js'

// Session-only File/object URL ownership. No storage, filesystem paths, or HTTP.
export function useLocalVideo({ urls = URL, canPlayType = type => document.createElement('video').canPlayType(type) } = {}) {
  const file = shallowRef(null)
  const source = ref('')
  const version = ref(0)
  const state = ref('empty')
  const metadata = ref(null)
  const failure = ref('')
  const selectionError = ref('')
  const playback = ref('')
  const isCurrent = token => token === version.value && !!source.value

  function replace(selected) {
    let next
    try { next = urls.createObjectURL(selected) } catch {
      selectionError.value = 'Akses file gagal. Pilih ulang rekaman lokal.'
      return false
    }
    const previous = source.value
    version.value += 1
    file.value = selected
    source.value = next
    metadata.value = null
    failure.value = ''
    selectionError.value = ''
    playback.value = ''
    state.value = 'loading'
    if (previous) urls.revokeObjectURL(previous)
    return true
  }

  function select(selected) {
    if (!selected) return false // Cancelling a picker preserves the current video.
    const error = validateLocalVideo(selected, canPlayType)
    if (error) { selectionError.value = error; return false }
    return replace(selected)
  }

  function remove() {
    const previous = source.value
    version.value += 1 // Ignore late events and autoplay promises from old media.
    source.value = ''
    file.value = null
    metadata.value = null
    failure.value = ''
    selectionError.value = ''
    playback.value = ''
    state.value = 'empty'
    if (previous) urls.revokeObjectURL(previous)
  }

  function readMetadata(video, token) {
    if (!isCurrent(token) || state.value === 'error') return false
    try { metadata.value = videoMetadata(video); return true } catch (error) {
      metadata.value = null
      failure.value = error.message
      state.value = 'error'
      return false
    }
  }

  function ready(video, token) {
    if (!readMetadata(video, token)) return false
    state.value = 'ready'
    playback.value = video.paused ? 'Siap · tekan Putar' : 'Memutar rekaman'
    return true
  }

  function failed(code, token) {
    if (!isCurrent(token)) return
    failure.value = mediaErrorMessage(code)
    state.value = 'error'
    playback.value = ''
  }

  function setPlayback(message, token) {
    if (isCurrent(token) && state.value === 'ready') playback.value = message
  }

  return { file, source, version, state, metadata, failure, selectionError, playback,
    status: computed(() => localVideoStatus(state.value)),
    select, remove, dispose: remove, retry: () => file.value && replace(file.value),
    isCurrent, readMetadata, ready, failed, setPlayback }
}
