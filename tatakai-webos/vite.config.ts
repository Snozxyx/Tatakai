import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/api/v2/hianime': {
        target: 'https://aniwatch-api-taupe-eight.vercel.app',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path
      }
    }
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  }
})