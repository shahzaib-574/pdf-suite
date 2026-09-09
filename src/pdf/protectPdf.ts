import * as pdfLib from 'pdf-lib';
import { configure, lock, unlockInPlace } from 'pdf-lib-encrypt';

configure(pdfLib);

/**
 * AES-256 (/V5 /R6 /AESV3) user-password encryption via Web Crypto.
 * Already-encrypted inputs are rejected by PDFDocument.load.
 */
export async function protectPdf(
  pdfBytes: Uint8Array,
  userPassword: string,
): Promise<Uint8Array> {
  await pdfLib.PDFDocument.load(pdfBytes);
  return lock(pdfBytes, userPassword);
}

export async function unprotectPdf(
  pdfBytes: Uint8Array,
  password: string,
): Promise<Uint8Array> {
  const doc = await pdfLib.PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  if (!(await unlockInPlace(doc, password))) {
    throw new Error("That password was incorrect.");
  }
  const saved = await doc.save();
  return saved instanceof Uint8Array ? saved : new Uint8Array(saved);
}
