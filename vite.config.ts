import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function releaseMetadataPlugin(
  mode: string,
  bannerId: string,
  testMode: boolean,
): Plugin {
  return {
    name: 'ream-release-metadata',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'release-metadata.json',
        source: `${JSON.stringify(
          {
            schemaVersion: 1,
            mode,
            admob: { bannerId, testMode },
          },
          null,
          2,
        )}\n`,
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const bannerId = env.VITE_ADMOB_BANNER_ID?.trim() ?? ''
  const testMode = env.VITE_ADMOB_TEST_MODE === 'true'

  return {
    base: './',
    plugins: [react(), releaseMetadataPlugin(mode, bannerId, testMode)],
    worker: { format: 'es' },
    server: { host: true, port: 5173 },
  }
})
