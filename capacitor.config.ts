import type { CapacitorConfig } from '@capacitor/cli';
import type {} from '@capawesome/capacitor-live-update';
import { readFileSync } from 'node:fs';
import { createPublicKey } from 'node:crypto';
import ota from './ota.config.json';

const nativeVersion = readFileSync('android/variables.gradle', 'utf8').match(/appVersionCode\s*=\s*(\d+)/)?.[1];
const channel = process.env.REAM_OTA_CHANNEL_PREFIX || 'production';
if (!nativeVersion || !['preview', 'production'].includes(channel)) throw new Error('Invalid OTA native version or channel.');
let publicKey: string | undefined;
if (ota.repository) {
  publicKey = readFileSync('ota-public.pem', 'utf8');
  if (createPublicKey(publicKey).asymmetricKeyType !== 'rsa') throw new Error('OTA signing requires an RSA public key.');
}

const config: CapacitorConfig = {
  appId: 'com.reampdf.mobile',
  appName: 'Ream',
  webDir: 'dist',
  backgroundColor: '#eef1f7',
  loggingBehavior: 'none',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#eef1f7',
  },
  plugins: {
    LiveUpdate: {
      autoUpdateStrategy: 'none',
      defaultChannel: `${channel}-${nativeVersion}`,
      publicKey,
      readyTimeout: 15000,
      autoBlockRolledBackBundles: true,
      autoDeleteBundles: true,
      httpTimeout: 30000,
    },
  },
};

export default config;
