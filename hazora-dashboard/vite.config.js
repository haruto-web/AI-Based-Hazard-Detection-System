import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Let the bundler decide chunk boundaries. Custom manualChunks with the
    // rolldown bundler produced a broken chunk (missing module init function,
    // "init_... is not defined") that crashed the lazily-loaded Dashboard.
    chunkSizeWarningLimit: 4000,
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
