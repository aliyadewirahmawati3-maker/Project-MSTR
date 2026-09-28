<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useDashboardConfiguration } from './composables/useDashboardConfiguration.js'
import { directionLabel } from './services/sigapApi.js'
import AppIcon from './components/AppIcon.vue'
import IntersectionMap from './components/IntersectionMap.vue'
import CctvMonitoring from './components/CctvMonitoring.vue'

const menus = [
  { label: 'Dashboard', icon: 'grid', target: 'dashboard' },
  { label: 'Live Monitoring', icon: 'camera', target: 'live-monitoring', keywords: 'cctv kamera' },
  { label: 'Peta Simpang', icon: 'map', target: 'peta-simpang' },
  { label: 'Rekomendasi AI', icon: 'spark', target: 'rekomendasi-ai' },
  { label: 'Kontrol Fase', icon: 'traffic' },
  { label: 'Emergency Vehicle Priority', icon: 'shield' },
  { label: 'Analitik Historis', icon: 'chart' },
  { label: 'Riwayat Keputusan', icon: 'history' },
  { label: 'Kesehatan Perangkat', icon: 'pulse' },
  { label: 'Pengaturan Simpang', icon: 'settings' },
]
const { configuration, configurationFresh, refreshing, error, lastChecked, backendStatus, databaseStatus, statusMessage, refresh, start, dispose } = useDashboardConfiguration()
const directions = computed(() => configuration.value?.approaches.map(approach => directionLabel(approach.direction)) || Array(4).fill('—'))
const systemMode = computed(() => configurationFresh.value ? configuration.value.systemStatus.current_mode : 'Standby')
const aiStatus = computed(() => !configurationFresh.value ? 'Belum terverifikasi' : configuration.value.systemStatus.is_ai_healthy === true ? 'Sehat' : 'Standby')
const cctvStatus = computed(() => !configurationFresh.value ? 'Belum terverifikasi' : configuration.value.systemStatus.is_cctv_healthy === true ? 'Sehat (API)' : 'Standby')
const serviceStatus = computed(() => refreshing.value ? 'Memuat...' : error.value ? 'Terganggu' : 'Online')
const activePhase = computed(() => configurationFresh.value ? configuration.value.signalPhases.find(phase => phase.is_active)?.name || 'Belum tersedia' : 'Belum terverifikasi')
const search = ref('')
const searchOpen = ref(false)
const searchResults = computed(() => menus.filter(menu => `${menu.label} ${menu.keywords || ''}`.toLowerCase().includes(search.value.trim().toLowerCase())))
const sidebarCompact = ref(false)
const isMobile = ref(false)
const mobileMenuOpen = ref(false)
const openPopover = ref('')
const placeholder = ref(null)
const placeholderDialog = ref(null)
const toast = ref('')
let toastTimer
let mobileQuery
function syncMobileLayout() {
  isMobile.value = mobileQuery.matches
  mobileMenuOpen.value = false
}

function notify(message) {
  toast.value = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, 5500)
}

async function checkHealth(manual = false) {
  await refresh()
  if (manual) notify(statusMessage.value)
}
async function navigate(menu) {
  searchOpen.value = false
  search.value = ''
  mobileMenuOpen.value = false
  openPopover.value = ''
  if (menu.target) {
    const section = document.getElementById(menu.target)
    section?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
    section?.focus({ preventScroll: true })
  } else {
    placeholder.value = menu
    await nextTick()
    placeholderDialog.value?.showModal()
  }
}
function closePlaceholder() { placeholderDialog.value?.close() }
function toggleMenu() {
  if (isMobile.value) mobileMenuOpen.value = !mobileMenuOpen.value
  else sidebarCompact.value = !sidebarCompact.value
}
function closeOverlays(event) {
  if (!event.target.closest('.topbar-popover-wrap')) openPopover.value = ''
  if (!event.target.closest('.search-box')) searchOpen.value = false
}
function handleEscape(event) {
  if (event.key === 'Escape') {
    openPopover.value = ''
    searchOpen.value = false
    mobileMenuOpen.value = false
  }
}
onMounted(() => {
  mobileQuery = window.matchMedia('(max-width: 1000px)')
  syncMobileLayout()
  mobileQuery.addEventListener('change', syncMobileLayout)
  start()
  document.addEventListener('click', closeOverlays)
  document.addEventListener('keydown', handleEscape)
})
onBeforeUnmount(() => {
  mobileQuery?.removeEventListener('change', syncMobileLayout)
  dispose()
  clearTimeout(toastTimer)
  document.removeEventListener('click', closeOverlays)
  document.removeEventListener('keydown', handleEscape)
})
</script>

<template>
  <div class="app-shell" :class="{ 'sidebar-compact': sidebarCompact, 'mobile-menu-open': mobileMenuOpen }">
    <a class="skip-link" href="#dashboard">Lewati ke konten utama</a>
    <header class="topbar">
      <div class="brand-area">
        <a href="#dashboard" class="brand" aria-label="SIGAP Dashboard" @click.prevent="navigate(menus[0])">
          <svg class="brand-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M11 3h10v8h8v10h-8v8H11v-8H3V11h8Z" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M16 7v6m9 3h-6m-3 9v-6M7 16h6" stroke="currentColor" stroke-width="2"/><circle cx="16" cy="16" r="2" fill="currentColor"/></svg>
          <span>SIGAP</span>
        </a>
        <button class="icon-button menu-toggle" aria-label="Buka atau ringkas navigasi" aria-controls="main-sidebar" :aria-expanded="isMobile ? mobileMenuOpen : !sidebarCompact" @click="toggleMenu"><AppIcon name="menu" :size="21" /></button>
      </div>
      <div class="topbar-content">
        <form class="search-box" role="search" @submit.prevent="searchResults.length && navigate(searchResults[0])">
          <AppIcon name="search" :size="18" /><input v-model="search" aria-label="Cari menu atau pemantauan" placeholder="Cari menu atau pemantauan..." autocomplete="off" :aria-expanded="searchOpen" aria-controls="search-results" @focus="searchOpen = true" @input="searchOpen = true" /><kbd aria-hidden="true">⌕</kbd>
          <div v-if="searchOpen" id="search-results" class="search-results"><span class="popover-eyebrow">NAVIGASI CEPAT</span><button v-for="menu in searchResults" :key="menu.label" type="button" @click="navigate(menu)"><AppIcon :name="menu.icon" :size="16" /><span>{{ menu.label }}</span><span v-if="!menu.target" class="search-placeholder">Standby</span><AppIcon v-else name="chevron" :size="14" /></button><p v-if="!searchResults.length">Menu tidak ditemukan. Coba “CCTV” atau “Peta”.</p></div>
        </form>
        <div class="topbar-right">
          <span class="topbar-status"><i class="status-dot"></i>Mode Simulator</span><span class="topbar-divider"></span>
          <div class="topbar-popover-wrap"><button class="icon-button notification-button" aria-label="Notifikasi sistem" :aria-expanded="openPopover === 'notifications'" @click="openPopover = openPopover === 'notifications' ? '' : 'notifications'"><AppIcon name="bell" /></button><div v-if="openPopover === 'notifications'" class="topbar-popover notification-popover"><h3>Notifikasi sistem</h3><div class="notification-item"><span class="icon-tile blue"><AppIcon name="info" :size="19" /></span><div><strong>Menunggu koneksi CCTV</strong><p>Stream tidak ditampilkan pada tahap ini. Status kamera tersedia pada panel CCTV dari konfigurasi API.</p></div></div><span class="popover-note">Informasi prototype · Simulator</span></div></div>
          <div class="topbar-popover-wrap"><button class="operator-button" :aria-expanded="openPopover === 'profile'" aria-label="Profil Operator BCC" @click="openPopover = openPopover === 'profile' ? '' : 'profile'"><span class="avatar avatar-small">OP</span><span class="topbar-operator">Operator BCC</span><AppIcon name="down" :size="14" /></button><div v-if="openPopover === 'profile'" class="topbar-popover profile-popover"><span class="avatar">OP</span><h3>Operator BCC</h3><p>Bandung Command Center</p><span class="badge badge-blue">Operator · Simulator</span></div></div>
        </div>
      </div>
    </header>

    <button v-if="mobileMenuOpen" class="sidebar-backdrop" aria-label="Tutup navigasi" @click="mobileMenuOpen = false"></button>
    <aside id="main-sidebar" class="sidebar" aria-label="Navigasi utama" :inert="isMobile && !mobileMenuOpen">
      <div class="sidebar-profile"><span class="avatar">OP<span class="avatar-dot"></span></span><div class="sidebar-profile-text"><strong>Operator BCC</strong><span>Bandung Command Center</span></div></div>
      <div class="navigation-label">RUANG OPERASIONAL</div>
      <nav><button v-for="(menu, index) in menus" :key="menu.label" :class="['nav-item', { active: index === 0, 'nav-group-start': index === 6 }]" :aria-current="index === 0 ? 'page' : undefined" :title="menu.label + (!menu.target ? ' · Standby' : '')" @click="navigate(menu)"><AppIcon :name="menu.icon" :size="19" /><span>{{ menu.label }}</span><span v-if="index === 0" class="active-dot"></span></button></nav>
      <div class="sidebar-bottom"><div class="sidebar-location"><AppIcon name="pin" :size="18" /><div><strong>{{ configuration?.intersection.name || 'Konfigurasi simpang' }}</strong><span>{{ configuration?.intersection.location || 'Belum tersedia' }}</span></div></div><div class="prototype-label"><span class="status-dot blue"></span>PROTOTYPE DSS<span>v0.1</span></div></div>
    </aside>

    <main id="dashboard" class="main-content" tabindex="-1">
      <section class="hero" aria-labelledby="dashboard-title">
        <div class="hero-content"><div class="hero-eyebrow"><span>COMMAND CENTER</span><span class="eyebrow-slash">/</span>PEMANTAUAN SIMPANG</div><h1 id="dashboard-title">Dashboard Operasional</h1><p>SIGAP — {{ configuration?.intersection.name || 'Konfigurasi simpang' }} · {{ configuration?.intersection.code || '—' }} · {{ configuration?.intersection.location || '—' }}</p></div>
        <div class="hero-actions"><span class="hero-badge"><i class="status-dot"></i>{{ systemMode }} · SIMULATOR</span><div class="hero-action-row"><span class="operator-monitor"><AppIcon name="shield" :size="15" />Dipantau Operator BCC</span><button class="refresh-button" :disabled="refreshing" @click="checkHealth(true)"><AppIcon name="refresh" :size="16" :class="{ spinning: refreshing }" />{{ refreshing ? 'Memeriksa...' : 'Refresh Status' }}</button></div></div>
      </section>

      <div class="dashboard-body">
        <div class="summary-grid">
          <section class="card operation-card" aria-labelledby="operation-title">
            <div class="summary-heading"><h2 id="operation-title">Status Operasional Simpang</h2><span class="summary-meta">{{ lastChecked ? `${lastChecked} WIB` : 'Menunggu status' }}</span></div>
            <div class="operation-metrics">
              <div class="operation-metric"><span class="icon-tile blue"><AppIcon name="arrows" /></span><div><span class="metric-label">Fase aktif (konfigurasi API)</span><strong>{{ activePhase }}</strong><span class="metric-note">Parameter simulator</span></div></div>
              <div class="operation-metric"><span class="icon-tile indigo"><AppIcon name="traffic" /></span><div><span class="metric-label">Mode sistem</span><strong>{{ systemMode }}</strong><span class="metric-note">Simulator</span></div></div>
              <div class="operation-metric"><span class="icon-tile green"><AppIcon name="shield" /></span><div><span class="metric-label">Status EVP</span><strong class="text-green">Aman</strong><span class="metric-note">Simulator</span></div></div>
              <div class="operation-metric"><span class="icon-tile amber"><AppIcon name="pulse" /></span><div><span class="metric-label">Kesehatan layanan</span><strong>{{ serviceStatus }}</strong><span class="metric-note" role="status" aria-live="polite">{{ statusMessage }}</span></div></div>
            </div>
          </section>
          <section class="card queue-card" aria-labelledby="queue-title"><div class="summary-heading"><h2 id="queue-title">Ringkasan Antrean</h2><span class="badge badge-neutral">Menunggu data</span></div><div class="queue-metrics"><div v-for="(direction, index) in directions" :key="index" class="queue-metric"><div><span>{{ direction }}</span><strong>—</strong></div><div class="queue-indicator" aria-hidden="true"><i v-for="segment in 12" :key="segment"></i></div><p>Menunggu data CCTV</p></div></div></section>
        </div>

        <div class="main-grid">
          <IntersectionMap :api-approaches="configuration?.approaches || []" :signal-phases="configuration?.signalPhases || []" />
          <div class="decision-column">
            <section id="rekomendasi-ai" class="card recommendation-card" tabindex="-1" aria-labelledby="recommendation-title">
              <div class="card-heading"><div class="heading-with-icon"><span class="icon-tile blue"><AppIcon name="spark" :size="19" /></span><div><h2 id="recommendation-title">Rekomendasi AI / Heuristik</h2><p>Pendukung keputusan operator</p></div></div><span class="badge badge-neutral">Standby</span></div>
              <div class="recommendation-content"><dl class="recommendation-metrics"><div><dt>Fase rekomendasi</dt><dd>—</dd></div><div><dt>Skor prioritas</dt><dd>—</dd></div><div><dt>Durasi hijau</dt><dd>—</dd></div></dl><div class="recommendation-reason"><AppIcon name="clock" :size="19" /><div><strong>Menunggu data antrean</strong><p><span class="sr-only">Alasan: </span>Menunggu pengukuran zona antrean dari CCTV.</p></div></div><p class="heuristic-note">Rekomendasi belum tersedia; menunggu data CCTV.</p></div>
            </section>
            <section class="card integration-card" aria-labelledby="integration-title">
              <div class="card-heading"><div><h2 id="integration-title">Status Integrasi ATCS</h2><p>Alur mode operasional sistem</p></div><AppIcon name="link" class="muted-icon" :size="19" /></div>
              <div class="integration-content"><ol class="integration-flow" aria-label="SIGAP Adaptive ke Fallback Aman ke ATCS Normal"><li :class="{ current: systemMode === 'SIGAP_ADAPTIVE' }"><AppIcon name="spark" :size="19" /><span>SIGAP Adaptive</span></li><li class="flow-step-arrow" aria-hidden="true"><AppIcon name="arrow" :size="15" /></li><li :class="{ current: systemMode === 'FALLBACK_ATCS' }"><AppIcon name="shield" :size="19" /><span>Fallback Aman</span></li><li class="flow-step-arrow" aria-hidden="true"><AppIcon name="arrow" :size="15" /></li><li :class="{ current: systemMode === 'ATCS_NORMAL' }"><AppIcon name="traffic" :size="19" /><span>ATCS Normal</span></li></ol><div class="integration-active"><span><i class="status-dot blue"></i>Status aktif</span><strong>{{ systemMode }} (Simulator)</strong></div><p class="operator-note">Operator Bandung Command Center tetap memantau sistem pada seluruh mode.</p><div class="service-readout"><span>Backend <i class="status-dot" :class="{ green: backendStatus === 'Online' }"></i>{{ backendStatus }}</span><span>Database <i class="status-dot" :class="{ green: databaseStatus === 'Online' }"></i>{{ databaseStatus }}</span><span>Layanan AI <i class="status-dot" :class="{ green: aiStatus === 'Sehat' }"></i>{{ aiStatus }}</span><span>CCTV <i class="status-dot" :class="{ green: cctvStatus === 'Sehat (API)' }"></i>{{ cctvStatus }}</span></div></div>
            </section>
          </div>
        </div>

        <CctvMonitoring :status-fresh="configurationFresh" :cameras="configuration?.cameras || []" :approaches="configuration?.approaches || []" />
        <footer class="page-footer"><p>SIGAP — Prototype Decision Support System untuk ATCS Bandung Command Center</p><span><i class="status-dot blue"></i>Lingkungan simulator</span></footer>
      </div>
    </main>
    <div class="toast-region" role="status" aria-live="polite"><div v-if="toast" class="toast"><AppIcon name="info" :size="19" /><span>{{ toast }}</span><button aria-label="Tutup pesan" @click="toast = ''"><AppIcon name="close" :size="16" /></button></div></div>
    <dialog ref="placeholderDialog" class="placeholder-dialog" aria-labelledby="placeholder-title" @click="event => { if (event.target === placeholderDialog) closePlaceholder() }"><template v-if="placeholder"><button class="dialog-close" aria-label="Tutup" @click="closePlaceholder"><AppIcon name="close" /></button><span class="icon-tile blue"><AppIcon :name="placeholder.icon" :size="26" /></span><span class="badge badge-neutral">Standby</span><h2 id="placeholder-title">{{ placeholder.label }}</h2><p>Modul ini belum terhubung pada prototype SIGAP. Pemantauan simpang tersedia di Dashboard Operasional.</p><button class="primary-button" @click="closePlaceholder">Kembali ke dashboard</button></template></dialog>
  </div>
</template>
