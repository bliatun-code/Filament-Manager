import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

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
  plugins: [tailwindcss(), react(), {
    name: 'bundled-third-party-notices',
    generateBundle() {
      for (const [fileName, sourcePath] of [
        ['NOTICE.md', '../NOTICE.md'],
        ['LICENSE.txt', '../LICENSE'],
        ['BambuStudio-LICENSE.txt', './src/assets/printers/BambuStudio-LICENSE.txt'],
        ['PrusaSlicer-LICENSE.txt', './src/assets/printers/PrusaSlicer-LICENSE.txt'],
        ['lucide-LICENSE.txt', './src/assets/licenses/lucide-LICENSE.txt'],
        ['printer-image-sources.json', './src/assets/printers/sources.json'],
      ]) {
        this.emitFile({ type: 'asset', fileName: `licenses/${fileName}`, source: readFileSync(new URL(sourcePath, import.meta.url), 'utf8') })
      }
    },
  }],
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
})
