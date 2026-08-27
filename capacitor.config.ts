import type { CapacitorConfig } from '@capacitor/cli';

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
};

export default config;
