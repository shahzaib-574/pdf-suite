export type LineToken = {
  text: string;
  x: number;
  xEnd: number;
};

export type PdfTextLine = {
  text: string;
  fontSize: number;
  x: number;
  y: number;
  xEnd: number;
  cells: string[];
  tokens: LineToken[];
};

export type PdfBlock =
  | {
      kind: 'para';
      lines: { text: string; fontSize: number }[];
      heading: boolean;
      x: number;
    }
  | { kind: 'table'; rows: string[][] }
  | { kind: 'columns'; columns: PdfBlock[][] }
  | {
      kind: 'image';
      bytes: Uint8Array;
      mime: 'image/jpeg';
      widthPt: number;
      heightPt: number;
    };

export type PdfTextPage = {
  width: number;
  height: number;
  blocks: PdfBlock[];
};

export type TextGlyph = {
  str: string;
  x: number;
  y: number;
  width: number;
  size: number;
  eol: boolean;
};
