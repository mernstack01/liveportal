import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Dev'da API bir xil origin'dan: CORS va Telegram Mini App uchun qulay.
    proxy: { '/api': 'http://localhost:4100' },
  },
})
