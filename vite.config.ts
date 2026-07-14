import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  optimizeDeps: {
    exclude: ['manifold-3d'],
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
