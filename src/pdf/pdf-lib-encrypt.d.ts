declare module 'pdf-lib-encrypt' {
  export function configure(pdfLib: unknown): void;
  export function lock(
    plainBytes: Uint8Array,
    password: string,
    opts?: { algo?: 'aes256' | 'rc4'; permissions?: number },
  ): Promise<Uint8Array>;
  export function unlockInPlace(doc: unknown, password: string): Promise<boolean>;
}
