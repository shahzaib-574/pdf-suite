import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { LiveUpdate } from '@capawesome/capacitor-live-update';
import ota from '../../ota.config.json';
import publicKey from '../../ota-public.pem?raw';
import { verifyUpdateManifest } from './updateManifest';
let readiness: Promise<void> | undefined;
let checking = false;
let lastCheck = 0;
async function checkForUpdate(): Promise<void> {
  if (checking || Date.now() - lastCheck < 15 * 60 * 1000) return;
  checking = true;
  lastCheck = Date.now();
  try {
    const { channel } = await LiveUpdate.getChannel();
    const { versionCode } = await LiveUpdate.getVersionCode();
    if (!channel || !/^(preview|production)-\d+$/.test(channel)) return;
    const response = await CapacitorHttp.get({
      url: `https://github.com/${ota.repository}/releases/download/${channel}/latest.json`,
      responseType: 'json', connectTimeout: 15000, readTimeout: 15000,
    });
    if (response.status === 404) return;
    if (response.status !== 200) throw new Error('Update host unavailable.');
    const manifest = await verifyUpdateManifest(
      typeof response.data === 'string' ? JSON.parse(response.data) : response.data,
      publicKey, ota.repository, channel, String(versionCode),
    );
    const [current, next, blocked] = await Promise.all([
      LiveUpdate.getCurrentBundle(), LiveUpdate.getNextBundle(), LiveUpdate.getBlockedBundles(),
    ]);
    const sequenceKey = `ream-ota-sequence:${channel}`;
    if (manifest.sequence < Number(localStorage.getItem(sequenceKey) || 0) ||
        current.bundleId === manifest.bundleId || next.bundleId === manifest.bundleId ||
        blocked.bundleIds.includes(manifest.bundleId)) return;
    const downloaded = await LiveUpdate.getBundles();
    if (!downloaded.bundleIds.includes(manifest.bundleId)) {
      await LiveUpdate.downloadBundle({ bundleId: manifest.bundleId, url: manifest.url,
        checksum: manifest.checksum, signature: manifest.signature, artifactType: 'zip' });
    }
    // Stage only. Never reload an active document task.
    await LiveUpdate.setNextBundle({ bundleId: manifest.bundleId });
    localStorage.setItem(sequenceKey, String(manifest.sequence));
  } catch (error) {
    console.warn('Background update check deferred.', error);
  } finally { checking = false; }
}
export function markUpdateReady(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve();
  return readiness ??= LiveUpdate.ready().then(() => {
    void checkForUpdate();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void checkForUpdate();
    });
  }).catch((error) => { console.warn('Could not acknowledge update readiness.', error); });
}
