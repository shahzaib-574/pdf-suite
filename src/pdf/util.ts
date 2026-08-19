export function humanError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) {
    if (/encrypted/i.test(err.message)) {
      return 'This PDF is password-protected and cannot be processed on-device.';
    }
    return err.message;
  }
  if (typeof err === 'string' && err.trim()) return err;
  return 'PDF processing failed';
}

export function copyBytes(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  return out;
}

export function copyBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  return out.buffer as ArrayBuffer;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
