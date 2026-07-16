import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // Served from https://<user>.github.io/aggregate-screen-sim/ on GitHub Pages;
  // the dev server stays at the root.
  base: command === 'build' ? '/aggregate-screen-sim/' : '/',
  plugins: [react()],
  server: {
    host: true,
    // Allow access via the Cloudflare quick-tunnel domain.
    allowedHosts: ['.trycloudflare.com'],
  },
}))
