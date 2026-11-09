import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    outDir: 'dist',
    // Source maps roughly double the memory/time of `vite build` and the production
    // image doesn't use them. Opt in with BUILD_SOURCEMAP=true when debugging a prod bug.
    sourcemap: process.env.BUILD_SOURCEMAP === 'true'
  }
})
