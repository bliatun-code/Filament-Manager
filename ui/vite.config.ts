import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function manualChunks(id: string) {
  const normalizedId = id.replaceAll('\\', '/')
  if (!normalizedId.includes('/node_modules/')) {
    return undefined
  }
  if (normalizedId.includes('/node_modules/pdf-lib/')) {
    return 'vendor-pdf-lib'
  }
  if (normalizedId.includes('/node_modules/@zxing/')) {
    return 'vendor-zxing'
  }
  if (normalizedId.includes('/node_modules/qrcode/')) {
    return 'vendor-qrcode'
  }
  return undefined
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
})
