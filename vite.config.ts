import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // Allow access via the Cloudflare quick-tunnel domain.
    allowedHosts: ['.trycloudflare.com'],
  },
})
