import { StandardFonts, type PDFDocument, type PDFFont } from "pdf-lib";
export type DocumentFonts = { r: PDFFont; b: PDFFont; i: PDFFont; bi: PDFFont };
const assets = [
  new URL(
    "../../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf",
    import.meta.url,
  ),
  new URL(
    "../../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf",
    import.meta.url,
  ),
  new URL(
    "../../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Italic.ttf",
    import.meta.url,
  ),
  new URL(
    "../../node_modules/pdfjs-dist/standard_fonts/LiberationSans-BoldItalic.ttf",
    import.meta.url,
  ),
];
let cache: Promise<Uint8Array[]> | undefined;
async function fontData() {
  cache ??= Promise.all(
    assets.map(async (url) => {
      if (url.protocol === "file:") {
        // Node self-checks read the same bundled fonts; the web worker uses local asset URLs.
        const moduleName = "node:fs/promises";
        const { readFile } = await import(/* @vite-ignore */ moduleName);
        return new Uint8Array(await readFile(url));
      }
      const response = await fetch(url);
      if (!response.ok)
        throw new Error("The bundled document font could not be loaded.");
      return new Uint8Array(await response.arrayBuffer());
    }),
  ).catch((error) => {
    cache = undefined;
    throw error;
  });
  return cache;
}
export async function documentFonts(
  pdf: PDFDocument,
  unicode: boolean,
): Promise<DocumentFonts> {
  if (!unicode)
    return {
      r: await pdf.embedFont(StandardFonts.Helvetica),
      b: await pdf.embedFont(StandardFonts.HelveticaBold),
      i: await pdf.embedFont(StandardFonts.HelveticaOblique),
      bi: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
    };
  const { default: fontkit } = await import("@pdf-lib/fontkit");
  pdf.registerFontkit(fontkit);
  const data = await fontData();
  const fonts = await Promise.all(
    data.map((bytes) => pdf.embedFont(bytes, { subset: true })),
  );
  return { r: fonts[0]!, b: fonts[1]!, i: fonts[2]!, bi: fonts[3]! };
}
export function supportsText(font: PDFFont, text: string): boolean {
  const supported = new Set(font.getCharacterSet());
  return [...text].every(
    (ch) => /\s/u.test(ch) || supported.has(ch.codePointAt(0)!),
  );
}
