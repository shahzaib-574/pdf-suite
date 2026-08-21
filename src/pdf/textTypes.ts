export type LineToken = {
  text: string;
  x: number;
  xEnd: number;
  runs?: PdfTextRun[];
};

export type PdfTextRun = {
  text: string;
  fontSize: number;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
};

export type PdfParagraphLine = {
  text: string;
  fontSize: number;
  runs?: PdfTextRun[];
  x?: number;
  xEnd?: number;
  y?: number;
};

export type PdfTextLine = {
  text: string;
  fontSize: number;
  x: number;
  y: number;
  xEnd: number;
  cells: string[];
  tokens: LineToken[];
  runs: PdfTextRun[];
  height: number;
  bold: boolean;
  italic: boolean;
  direction: 'ltr' | 'rtl';
};

export type PdfBlock =
  | {
      kind: 'para';
      lines: PdfParagraphLine[];
      heading: boolean;
      x: number;
      xEnd?: number;
      top?: number;
      bottom?: number;
      spaceBeforePt?: number;
      lineSpacingPt?: number;
      alignment?: 'left' | 'center' | 'right';
      direction?: 'ltr' | 'rtl';
    }
  | {
      kind: 'table';
      rows: string[][];
      x?: number;
      top?: number;
      bottom?: number;
      spaceBeforePt?: number;
      columnWidthsPt?: number[];
      headerRows?: number;
    }
  | {
      kind: 'columns';
      columns: PdfBlock[][];
      widthsPt?: number[];
      x?: number;
      top?: number;
      bottom?: number;
      spaceBeforePt?: number;
    }
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
  rotation?: number;
};

export type TextGlyph = {
  str: string;
  x: number;
  y: number;
  width: number;
  size: number;
  eol: boolean;
  fontName?: string;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  direction?: 'ltr' | 'rtl';
};
