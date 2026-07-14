import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Use relative base ('./') for the Electron desktop build (file://),
// and absolute base ('/') for the web / PWA build.
const base = process.env.ELECTRON_BUILD ? './' : '/'

export default defineConfig({
  base,
  plugins: [react()],
  server: { port: 5173, open: true },
  build: { outDir: 'dist' },
})
