import { applyScanEdit, type ScanEdit } from "./scanProcess";

self.onmessage = async (
  event: MessageEvent<{ bytes: ArrayBuffer; mime: string; edit: ScanEdit }>,
) => {
  try {
    const { bytes, mime, edit } = event.data;
    const output = await applyScanEdit(bytes, mime, edit);
    self.postMessage({ ok: true, bytes: output }, { transfer: [output] });
  } catch (error) {
    self.postMessage({
      ok: false,
      message:
        error instanceof Error ? error.message : "Could not adjust this scan.",
    });
  }
};
