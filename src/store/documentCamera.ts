import { Capacitor, registerPlugin } from '@capacitor/core';
import { validCorners, type Point } from '../pdf/scanGeometry';
import type { PickedFile } from '../lib/types';

type Capture = { cancelled?: boolean; gallery?: boolean; id: string; name: string; mime: string; size: number; corners?: Point[] };
const camera = registerPlugin<{ capture(): Promise<Capture> }>('DocumentCamera');
export function nativeDocumentCameraAvailable(): boolean {
  return Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('DocumentCamera');
}
// Share the pending request across React StrictMode's effect setup/cleanup cycle.
let pending: Promise<PickedFile | 'gallery' | null> | undefined;
export function captureNativeDocument(): Promise<PickedFile | 'gallery' | null> {
  if (!pending) pending = (async () => {
    const capture = await camera.capture();
    if (capture.gallery) return 'gallery' as const;
    if (capture.cancelled) return null;
    const { readNativeCameraPhoto } = await import('./incoming');
    const file = await readNativeCameraPhoto(capture);
    return { ...file, scanCorners: capture.corners && validCorners(capture.corners) ? capture.corners : undefined };
  })().finally(() => { pending = undefined; });
  return pending;
}
