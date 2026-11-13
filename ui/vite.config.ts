import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
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

// Keep this pilot off for regular development and release builds.
const inventoryCompiler = process.env.FILAMENT_MANAGER_INVENTORY_REACT_COMPILER === '1'
  ? import('@rolldown/plugin-babel').then(({ default: babel }) => babel({
      include: /(?:^|[/\\])inventory_spool_collection\.tsx$/,
      plugins: [[
        createRequire(import.meta.url).resolve('babel-plugin-react-compiler'),
        { compilationMode: 'annotation' },
      ]],
    }))
  : false

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react(), inventoryCompiler, {
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
