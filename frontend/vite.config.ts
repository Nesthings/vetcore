import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5179,
    watch: {
      usePolling: true,
      interval: 300,
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://localhost:8009',
        changeOrigin: true,
      },
      '/media': {
        target: process.env.VITE_API_PROXY || 'http://localhost:8009',
        changeOrigin: true,
      },
    },
  },
})
