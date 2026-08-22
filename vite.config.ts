import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function releaseMetadataPlugin(
  mode: string,
  bannerId: string,
  testMode: boolean,
  audienceMode: string,
  umpDebugGeography: string,
  umpTestDeviceCount: number,
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
            schemaVersion: 2,
            mode,
            admob: {
              bannerId,
              testMode,
              audienceMode,
              umpDebugGeography,
              umpTestDeviceCount,
            },
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
  const audienceMode = env.VITE_ADMOB_AUDIENCE_MODE?.trim().toUpperCase() ?? ''
  const umpDebugGeography = env.VITE_UMP_DEBUG_GEOGRAPHY?.trim() ?? ''
  const umpTestDeviceCount = (env.VITE_UMP_TEST_DEVICE_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean).length

  return {
    base: './',
    plugins: [
      react(),
      releaseMetadataPlugin(
        mode,
        bannerId,
        testMode,
        audienceMode,
        umpDebugGeography,
        umpTestDeviceCount,
      ),
    ],
    worker: { format: 'es' },
    server: { host: true, port: 5173 },
  }
})
