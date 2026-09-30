import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), {
    name: 'static-favicon-only',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'favicon.svg', source: readFileSync(new URL('./public/favicon.svg', import.meta.url)) })
    },
  }],
  // Selected files stay in the browser; never bundle old public CCTV copies.
  build: { copyPublicDir: false },
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
  }
})
