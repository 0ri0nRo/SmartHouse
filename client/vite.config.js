import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,        // espone la porta sulla rete locale del Pi
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',  // Flask
        changeOrigin: true,
      },
      '/api_sensors': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../src/static/react',  // build va direttamente nel volume montato
    emptyOutDir: true,
  },
})