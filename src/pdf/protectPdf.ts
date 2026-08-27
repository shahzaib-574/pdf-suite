import * as pdfLib from 'pdf-lib';
import { configure, lock } from 'pdf-lib-encrypt';

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
