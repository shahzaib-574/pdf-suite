import { useEffect, useRef, useState } from 'react';
import type { ScanCameraProps } from './ScanCamera';
import { captureNativeDocument } from '../store/documentCamera';
import { fileListToPicked, MAX_INPUT_BYTES } from '../store/files';
import { pickGalleryImages } from '../store/incoming';

export function NativeScanCamera(props: ScanCameraProps) {
  const current = useRef(props); current.current = props;
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void captureNativeDocument().then(async result => {
      if (!active) return;
      const { pages, maxPages, onPages, onClose } = current.current;
      if (!result) { onClose(); return; }
      const added = result === 'gallery'
        ? await fileListToPicked((await pickGalleryImages(Math.max(1, maxPages - pages.length))) ?? [], true)
        : [result];
      if (!active) return;
      if (!added.length) { onClose(); return; }
      const next = [...pages, ...added];
      if (next.length > maxPages || next.reduce((sum, file) => sum + file.bytes.length, 0) > MAX_INPUT_BYTES)
        throw new Error('This scan exceeds the page limit or 128 MB. Finish these pages before adding more.');
      onPages(next);
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Could not take a photo.'); });
    return () => { active = false; };
  }, [attempt]);
  return <section className="ps-screen" aria-label="Document camera"><h1>Document camera</h1>
    {error ? <><p role="alert">{error}</p><button className="btn" onClick={() => { setError(''); setAttempt(value => value + 1); }}>Try camera again</button></> : <p role="status">Opening the native camera…</p>}
    <button className="btn" onClick={props.onClose}>Back to scan</button>
  </section>;
}
