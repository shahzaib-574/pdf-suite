import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.reampdf.mobile',
  appName: 'Ream',
  webDir: 'dist',
  backgroundColor: '#f7f6fb',
  loggingBehavior: 'none',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#f7f6fb',
  },
};

export default config;
