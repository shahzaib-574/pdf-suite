import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), {
    name: 'ream-release-metadata',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'release-metadata.json',
        source: JSON.stringify({ schemaVersion: 3, mode, advertising: false }) + '\n' })
    },
  }],
  worker: { format: 'es' },
  server: { host: true, port: 5173 },
}))
