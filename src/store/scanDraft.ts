import { getMany, set, setMany, delMany } from 'idb-keyval';
import type { PickedFile, ImagePdfOptions } from '../lib/types';
import type { Point, ScanEdit } from '../pdf/scanGeometry';
export type ScanPageDraft = { corners: Point[]; rotation: number; dirty: boolean; mode: ScanEdit['mode'] };
export type ScanDraft = { version: 1; files: PickedFile[]; edits: (ScanPageDraft | null)[]; step: 'edit'|'pdf'; name: string; options: ImagePdfOptions; updatedAt: number };
const KEY = 'ream-scan-draft-v1';
const FILES_KEY = 'ream-scan-draft-files-v1';
let writes: Promise<unknown> = Promise.resolve();
let storedFiles: PickedFile[] | null = null;
export async function loadScanDraft(): Promise<ScanDraft | null> {
  await writes.catch(() => undefined);
  const [draft, files] = await getMany([KEY, FILES_KEY]) as [ScanDraft | undefined, PickedFile[] | undefined];
  if(draft && files) draft.files=files;
  return draft?.version === 1 && draft.files?.length ? draft : null;
}
export function saveScanDraft(draft: ScanDraft): Promise<void> {
  const next = writes.catch(() => undefined).then(async () => {
    if(!draft.files.length) {await delMany([KEY,FILES_KEY]);storedFiles=null;return;}
    const metadata={...draft,files:undefined};
    if(storedFiles !== draft.files) {
      await setMany([[KEY,metadata],[FILES_KEY,draft.files]]);
      storedFiles=draft.files;
    } else await set(KEY,metadata);
  });
  writes = next; return next;
}
export function clearScanDraft(): Promise<void> {
  const next = writes.catch(() => undefined).then(async () => {await delMany([KEY,FILES_KEY]);storedFiles=null;});
  writes = next; return next;
}
