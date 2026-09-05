export type UpdateManifest = {
  schema: 1; bundleId: string; channel: string; nativeVersion: string;
  sequence: number; url: string; checksum: string; signature: string;
};
function decode(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}
export async function verifyUpdateManifest(
  envelope: { payload: string; signature: string }, publicKey: string,
  repository: string, channel: string, nativeVersion: string,
): Promise<UpdateManifest> {
  if (typeof envelope.payload !== 'string' || envelope.payload.length > 12000 || typeof envelope.signature !== 'string') throw new Error('Invalid update manifest.');
  const key = await crypto.subtle.importKey('spki', decode(publicKey.replace(/-----[^-]+-----|\s/g, '')),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(envelope.signature), new TextEncoder().encode(envelope.payload))) throw new Error('Update manifest signature rejected.');
  const value = JSON.parse(envelope.payload) as UpdateManifest;
  if (value.schema !== 1 || value.channel !== channel || value.nativeVersion !== nativeVersion ||
      !Number.isSafeInteger(value.sequence) || value.sequence <= 0 ||
      !/^ream-[a-z0-9-]+$/.test(value.bundleId) || !/^[a-f0-9]{64}$/.test(value.checksum) ||
      typeof value.signature !== 'string' || value.signature.length > 1024 ||
      value.url !== `https://github.com/${repository}/releases/download/${value.bundleId}/bundle.zip`) throw new Error('Update is incompatible or has an invalid download URL.');
  return value;
}
