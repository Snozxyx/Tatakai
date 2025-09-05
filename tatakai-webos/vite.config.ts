import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/api/v4': {
        target: 'https://api.jikan.moe',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/v4/, '/v4')
      }
    }
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  }
})