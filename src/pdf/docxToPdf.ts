/**
 * On-device DOCX → PDF. No DOM / network. Runs in the browser and in Node.
 */
import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PDFFont, PDFImage, PDFPage } from "pdf-lib";
import type { JobOk, JobResult, PickedFile } from "../lib/types";
import { clamp, humanError } from "./util";
import { documentFonts } from "./fonts";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const DEFAULT_MARGIN = 72;
const MAX_IMAGE_H = 320;

type PageLayout = {
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
};

function contentWidth(layout: PageLayout): number {
  return Math.max(40, layout.width - layout.left - layout.right);
}
const NOT_DOCX = "This does not look like a Word .docx file.";
const EMPTY_LINE = "This document had no readable text.";
const INK = rgb(0, 0, 0);
const CELL_PAD = 5;

const WIN1252_EXTRA = new Set<number>([
  0x0152, 0x0153, 0x0160, 0x0161, 0x0178, 0x017d, 0x017e, 0x0192, 0x02c6,
  0x02dc, 0x2013, 0x2014, 0x2018, 0x2019, 0x201a, 0x201c, 0x201d, 0x201e,
  0x2020, 0x2021, 0x2022, 0x2026, 0x2030, 0x2039, 0x203a, 0x20ac, 0x2122,
]);

const TEXT_MAP: Record<string, string> = {
  "\u00a0": " ",
  "\u2002": " ",
  "\u2003": " ",
  "\u2009": " ",
  "\u202f": " ",
  "\u200b": "",
  "\u200c": "",
  "\u200d": "",
  "\u2060": "",
  "\ufeff": "",
  "\u00ad": "",
  "\t": "    ",
};

type Align = "left" | "center" | "right";
type Heading = 1 | 2 | 3;
type XmlNode = Record<string, unknown>;

type Rel = { target: string; external: boolean };

type StyleInfo = {
  heading?: Heading;
  numId?: string;
  ilvl?: number;
  bold?: boolean;
  italic?: boolean;
  sizePt?: number;
  spaceBefore?: number;
  spaceAfter?: number;
  lineMult?: number;
  indentLeft?: number;
  indentFirst?: number;
};

type Edge = { width: number; color: { r: number; g: number; b: number } };

type SideBorders = {
  top?: Edge | null;
  left?: Edge | null;
  bottom?: Edge | null;
  right?: Edge | null;
  insideH?: Edge | null;
  insideV?: Edge | null;
};

type StylePack = {
  byId: Map<string, StyleInfo>;
  defaultSize: number;
  tableBorders: Map<string, SideBorders>;
};

type NumInfo = {
  absOf: Map<string, string>;
  fmtOf: Map<string, string>;
  counters: Map<string, number[]>;
};

type RunPr = { bold?: boolean; italic?: boolean; sizePt?: number };

type Piece =
  | { kind: "text"; text: string; bold: boolean; italic: boolean; size: number }
  | { kind: "nl" }
  | { kind: "break" }
  | { kind: "image"; relId: string; cx?: number; cy?: number };

type Run = { text: string; bold: boolean; italic: boolean; size: number };

type CellPara = {
  runs: Run[];
  align: Align;
  size: number;
  spaceAfter: number;
  lineMult: number;
};

type TableCell = {
  paras: CellPara[];
  span: number;
  vContinue: boolean;
  fill?: { r: number; g: number; b: number };
  edges: SideBorders;
};

type Block =
  | {
      kind: "para";
      runs: Run[];
      align: Align;
      indent: number;
      firstIndent: number;
      empty: boolean;
      size: number;
      spaceBefore: number;
      spaceAfter: number;
      lineMult: number;
    }
  | { kind: "image"; relId: string; cx?: number; cy?: number; align: Align }
  | { kind: "break" }
  | {
      kind: "table";
      rows: TableCell[][];
      colWeights: number[];
      edges: SideBorders;
    };

type Fonts = { r: PDFFont; b: PDFFont; i: PDFFont; bi: PDFFont };

type LinePart = {
  text: string;
  bold: boolean;
  italic: boolean;
  size: number;
  width: number;
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true,
  removeNSPrefix: true,
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  allowBooleanAttributes: true,
  ignoreDeclaration: true,
  processEntities: true,
});

export async function docxToPdf(file: PickedFile): Promise<JobResult> {
  try {
    return await convert(file);
  } catch (err) {
    return fail(err);
  }
}

function fail(err: unknown): JobResult {
  const message = humanError(err);
  if (message === "PDF processing failed") {
    return { ok: false, message: "Could not convert this Word document." };
  }
  return { ok: false, message };
}

export function validateDocxArchive(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let total = 0,
    entries = 0;
  for (let i = Math.max(0, bytes.length - 65557); i + 22 <= bytes.length; i++) {
    if (view.getUint32(i, true) !== 0x06054b50) continue;
    const count = view.getUint16(i + 10, true);
    let at = view.getUint32(i + 16, true);
    if (count > 2000 || count === 65535)
      throw new Error(
        "This DOCX contains too many parts. Simplify it in Word before converting.",
      );
    for (let n = 0; n < count; n++) {
      if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50)
        throw new Error("The DOCX archive is damaged.");
      const size = view.getUint32(at + 24, true);
      total += size;
      entries++;
      if (size > 32 * 1024 * 1024 || total > 128 * 1024 * 1024)
        throw new Error(
          "The expanded DOCX is too large to convert safely on this device.",
        );
      at +=
        46 +
        view.getUint16(at + 28, true) +
        view.getUint16(at + 30, true) +
        view.getUint16(at + 32, true);
    }
    if (entries) return;
  }
  throw new Error(NOT_DOCX);
}

async function convert(file: PickedFile): Promise<JobResult> {
  const bytes = file.bytes.slice();
  let zip: JSZip;
  try {
    validateDocxArchive(bytes);
    zip = await JSZip.loadAsync(bytes);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : NOT_DOCX,
    };
  }

  const docXml = await readZipString(zip, "word/document.xml");
  if (docXml === undefined) {
    return { ok: false, message: NOT_DOCX };
  }

  let parsed: unknown;
  try {
    parsed = parseXml(docXml);
  } catch {
    return { ok: false, message: "Could not read this Word document." };
  }

  const rels = await loadRels(zip, "word/_rels/document.xml.rels");
  const styles = await loadStyles(zip);
  const numbering = await loadNumbering(zip);
  const blocks = walkBody(parsed, styles, numbering);
  const layout = parsePageLayout(parsed);

  return renderPdf(zip, rels, blocks, file.name, layout);
}

function parsePageLayout(parsed: unknown): PageLayout {
  const body = findFirst(asNodes(parsed), "body");
  const sect = body ? findFirst(childrenOf(body), "sectpr") : undefined;
  const pgSz = sect ? childNamed(sect, "pgsz") : undefined;
  const pgMar = sect ? childNamed(sect, "pgmar") : undefined;
  const width = twipsToPt(pgSz ? attr(pgSz, "w") : undefined) ?? PAGE_W;
  const height = twipsToPt(pgSz ? attr(pgSz, "h") : undefined) ?? PAGE_H;
  const top =
    twipsToPt(pgMar ? attr(pgMar, "top") : undefined) ?? DEFAULT_MARGIN;
  const right =
    twipsToPt(pgMar ? attr(pgMar, "right") : undefined) ?? DEFAULT_MARGIN;
  const bottom =
    twipsToPt(pgMar ? attr(pgMar, "bottom") : undefined) ?? DEFAULT_MARGIN;
  const left =
    twipsToPt(pgMar ? attr(pgMar, "left") : undefined) ?? DEFAULT_MARGIN;
  return {
    width: Math.max(200, width),
    height: Math.max(200, height),
    top: Math.max(18, top),
    right: Math.max(18, right),
    bottom: Math.max(18, bottom),
    left: Math.max(18, left),
  };
}

export async function docxBlockKinds(file: PickedFile): Promise<string[]> {
  try {
    const zip = await JSZip.loadAsync(file.bytes.slice());
    const docXml = await readZipString(zip, "word/document.xml");
    if (docXml === undefined) return [];
    const parsed = parseXml(docXml);
    const styles = await loadStyles(zip);
    const numbering = await loadNumbering(zip);
    return walkBody(parsed, styles, numbering).map((block) => block.kind);
  } catch {
    return [];
  }
}

function parseXml(xml: string): unknown {
  const trimmed = xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml;
  return xmlParser.parse(trimmed) as unknown;
}

function isRecord(value: unknown): value is XmlNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNodes(value: unknown): XmlNode[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (isRecord(value)) return [value];
  return [];
}

function localName(tag: string): string {
  const i = tag.indexOf(":");
  return (i >= 0 ? tag.slice(i + 1) : tag).toLowerCase();
}

function elementKey(node: XmlNode): string | undefined {
  for (const key of Object.keys(node)) {
    if (key !== ":@" && key !== "#text") return key;
  }
  return undefined;
}

function tagOf(node: XmlNode): string {
  const key = elementKey(node);
  return key ? localName(key) : "";
}

function childrenOf(node: XmlNode): XmlNode[] {
  const key = elementKey(node);
  if (!key) return [];
  return asNodes(node[key]);
}

function attrsOf(node: XmlNode): Record<string, string> {
  const raw = node[":@"];
  if (!isRecord(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || value === null) continue;
    const name = key.startsWith("@_") ? key.slice(2) : key;
    out[localName(name)] = String(value);
  }
  return out;
}

function attr(node: XmlNode, name: string): string | undefined {
  return attrsOf(node)[name.toLowerCase()];
}

function textOf(node: XmlNode): string {
  const direct = node["#text"];
  if (typeof direct === "string") return direct;
  if (typeof direct === "number" || typeof direct === "boolean")
    return String(direct);
  let out = "";
  for (const child of childrenOf(node)) {
    if ("#text" in child && !elementKey(child)) {
      out += textOf(child);
    } else if (tagOf(child) === "") {
      out += textOf(child);
    }
  }
  return out;
}

function findFirst(nodes: XmlNode[], name: string): XmlNode | undefined {
  for (const node of nodes) {
    if (tagOf(node) === name) return node;
    const inner = findFirst(childrenOf(node), name);
    if (inner) return inner;
  }
  return undefined;
}

function unwrapAlternate(node: XmlNode): XmlNode[] {
  const kids = childrenOf(node);
  const choices = kids.filter((k) => tagOf(k) === "choice");
  for (const choice of choices) {
    const inner = childrenOf(choice);
    if (inner.length > 0) return inner;
  }
  const fallback = kids.find((k) => tagOf(k) === "fallback");
  return fallback ? childrenOf(fallback) : [];
}

function expand(nodes: XmlNode[]): XmlNode[] {
  const out: XmlNode[] = [];
  for (const node of nodes) {
    const name = tagOf(node);
    if (name === "alternatecontent") {
      out.push(...expand(unwrapAlternate(node)));
      continue;
    }
    if (name === "sdt") {
      const content = childrenOf(node).find((c) => tagOf(c) === "sdtcontent");
      if (content) out.push(...expand(childrenOf(content)));
      continue;
    }
    if (
      name === "sdtcontent" ||
      name === "hyperlink" ||
      name === "ins" ||
      name === "moveto" ||
      name === "smarttag" ||
      name === "customxml" ||
      name === "fldsimple" ||
      name === "ruby"
    ) {
      out.push(...expand(childrenOf(node)));
      continue;
    }
    out.push(node);
  }
  return out;
}

function onOff(node: XmlNode | undefined): boolean {
  if (!node) return false;
  const val = attr(node, "val");
  if (val === undefined || val === "") return true;
  const v = val.toLowerCase();
  return v !== "0" && v !== "false" && v !== "off";
}

function childNamed(node: XmlNode, name: string): XmlNode | undefined {
  return expand(childrenOf(node)).find((c) => tagOf(c) === name);
}

function readRunPr(rPr: XmlNode | undefined): RunPr {
  if (!rPr) return {};
  const kids = expand(childrenOf(rPr));
  const b =
    kids.find((c) => tagOf(c) === "b") ?? kids.find((c) => tagOf(c) === "bcs");
  const i =
    kids.find((c) => tagOf(c) === "i") ?? kids.find((c) => tagOf(c) === "ics");
  const sz =
    kids.find((c) => tagOf(c) === "sz") ??
    kids.find((c) => tagOf(c) === "szcs");
  const half = sz ? Number(attr(sz, "val")) : Number.NaN;
  return {
    bold: b ? onOff(b) : undefined,
    italic: i ? onOff(i) : undefined,
    sizePt: Number.isFinite(half) && half > 0 ? half / 2 : undefined,
  };
}

function headingFromName(val: string): Heading | undefined {
  const v = val.trim().toLowerCase().replace(/[_-]+/g, " ");
  if (v === "title" || v === "heading 1" || v === "heading1") return 1;
  if (v === "subtitle" || v === "heading 2" || v === "heading2") return 2;
  if (v === "heading 3" || v === "heading3") return 3;
  const m = /heading\s*(\d)/.exec(v);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (n === 1 || n === 2 || n === 3) return n;
  return undefined;
}

function headingFromOutline(val: string | undefined): Heading | undefined {
  if (val === undefined) return undefined;
  const n = Number(val);
  if (n === 0) return 1;
  if (n === 1) return 2;
  if (n === 2) return 3;
  return undefined;
}

function headingSize(level: Heading): number {
  if (level === 1) return 18;
  if (level === 2) return 14;
  return 12;
}

function normPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function findZipEntry(zip: JSZip, path: string) {
  const want = normPath(path).toLowerCase();
  for (const name of Object.keys(zip.files)) {
    if (normPath(name).toLowerCase() !== want) continue;
    const entry = zip.files[name];
    if (entry && !entry.dir) return entry;
  }
  return undefined;
}

async function readZipString(
  zip: JSZip,
  path: string,
): Promise<string | undefined> {
  const entry = findZipEntry(zip, path);
  if (!entry) return undefined;
  return entry.async("string");
}

async function readZipBytes(
  zip: JSZip,
  path: string,
): Promise<Uint8Array | undefined> {
  const entry = findZipEntry(zip, path);
  if (!entry) return undefined;
  return entry.async("uint8array");
}

function resolveZipTarget(target: string): string | undefined {
  const trimmed = target.trim().replace(/\\/g, "/");
  if (!trimmed || /^(https?:|mailto:|file:)/i.test(trimmed)) return undefined;
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    decoded = trimmed;
  }
  const raw = decoded.startsWith("/") ? decoded.slice(1) : `word/${decoded}`;
  const parts: string[] = [];
  for (const seg of raw.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      if (parts.length === 0) return undefined;
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return parts.join("/") || undefined;
}

async function loadRels(zip: JSZip, path: string): Promise<Map<string, Rel>> {
  const map = new Map<string, Rel>();
  const xml = await readZipString(zip, path);
  if (xml === undefined) return map;
  let parsed: unknown;
  try {
    parsed = parseXml(xml);
  } catch {
    return map;
  }
  const root = asNodes(parsed);
  const relRoot =
    findFirst(root, "relationships") ??
    (root.length === 1 ? root[0] : undefined);
  if (!relRoot) return map;
  for (const node of expand(childrenOf(relRoot))) {
    if (tagOf(node) !== "relationship") continue;
    const id = attr(node, "id");
    const target = attr(node, "target");
    if (!id || !target) continue;
    map.set(id, {
      target,
      external: (attr(node, "targetmode") ?? "").toLowerCase() === "external",
    });
  }
  return map;
}

function readNumPr(pPr: XmlNode | undefined): {
  numId?: string;
  ilvl: number;
  explicitOff: boolean;
} {
  if (!pPr) return { ilvl: 0, explicitOff: false };
  const numPr = childNamed(pPr, "numpr");
  if (!numPr) return { ilvl: 0, explicitOff: false };
  const idNode = childNamed(numPr, "numid");
  const lvlNode = childNamed(numPr, "ilvl");
  const ilvlRaw = lvlNode ? Number(attr(lvlNode, "val")) : 0;
  const rawId = idNode ? attr(idNode, "val") : undefined;
  if (rawId === "0") return { ilvl: 0, explicitOff: true };
  return {
    numId: rawId,
    ilvl: Number.isFinite(ilvlRaw) && ilvlRaw > 0 ? Math.trunc(ilvlRaw) : 0,
    explicitOff: false,
  };
}

async function loadStyles(zip: JSZip): Promise<StylePack> {
  const byId = new Map<string, StyleInfo>();
  const tableRaw = new Map<string, SideBorders>();
  const tableBasedOn = new Map<string, string>();
  const tableBorders = new Map<string, SideBorders>();
  let defaultSize = 11;
  const empty = (): StylePack => ({ byId, defaultSize, tableBorders });
  const xml = await readZipString(zip, "word/styles.xml");
  if (xml === undefined) return empty();
  let parsed: unknown;
  try {
    parsed = parseXml(xml);
  } catch {
    return empty();
  }
  const styles = findFirst(asNodes(parsed), "styles");
  if (!styles) return empty();

  const defaults = findFirst(childrenOf(styles), "docdefaults");
  if (defaults) {
    const rPr = findFirst(childrenOf(defaults), "rpr");
    const sz = rPr ? readRunPr(rPr).sizePt : undefined;
    if (sz !== undefined) defaultSize = clamp(sz, 8, 28);
  }

  for (const node of expand(childrenOf(styles))) {
    if (tagOf(node) !== "style") continue;
    const id = attr(node, "styleid");
    if (!id) continue;
    const nameNode = childNamed(node, "name");
    const pPr = childNamed(node, "ppr");
    const rPr = childNamed(node, "rpr");
    const outline = pPr ? childNamed(pPr, "outlinelvl") : undefined;
    const num = readNumPr(pPr);
    const run = readRunPr(rPr);
    const heading =
      headingFromName(nameNode ? (attr(nameNode, "val") ?? "") : "") ??
      headingFromName(id) ??
      headingFromOutline(outline ? attr(outline, "val") : undefined);
    const space = parseSpacing(pPr, undefined, 11);
    const ind = parseInd(pPr, undefined);
    byId.set(id, {
      heading,
      numId: num.numId,
      ilvl: num.numId ? num.ilvl : undefined,
      bold: run.bold,
      italic: run.italic,
      sizePt: run.sizePt,
      spaceBefore: space.before,
      spaceAfter: space.after,
      lineMult: space.lineMult,
      indentLeft: ind.left,
      indentFirst: ind.first,
    });
    if ((attr(node, "type") ?? "").toLowerCase() === "table") {
      tableRaw.set(
        id,
        parseBordersFrom(childNamed(node, "tblpr"), "tblborders"),
      );
      const based = childNamed(node, "basedon");
      const parent = based ? attr(based, "val") : undefined;
      if (parent) tableBasedOn.set(id, parent);
    }
  }
  const resolveTable = (id: string, seen: Set<string>): SideBorders => {
    if (seen.has(id)) return tableRaw.get(id) ?? {};
    seen.add(id);
    const parent = tableBasedOn.get(id);
    const base = parent ? resolveTable(parent, seen) : {};
    return mergeBorders(base, tableRaw.get(id) ?? {});
  };
  for (const id of tableRaw.keys()) {
    tableBorders.set(id, resolveTable(id, new Set()));
  }
  return { byId, defaultSize, tableBorders };
}

function parseHexColor(
  raw: string | undefined,
): { r: number; g: number; b: number } | undefined {
  if (!raw || raw.toLowerCase() === "auto") return { r: 0, g: 0, b: 0 };
  const hex = raw.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return undefined;
  return {
    r: parseInt(hex.slice(0, 2), 16) / 255,
    g: parseInt(hex.slice(2, 4), 16) / 255,
    b: parseInt(hex.slice(4, 6), 16) / 255,
  };
}

function parseEdge(node: XmlNode | undefined): Edge | null | undefined {
  if (!node) return undefined;
  const val = (attr(node, "val") ?? "").toLowerCase();
  if (val === "nil" || val === "none" || val === "hidden") return null;
  if (!val && attr(node, "sz") === undefined) return undefined;
  const sz = Number(attr(node, "sz"));
  const width = Number.isFinite(sz) && sz > 0 ? Math.min(2.4, sz / 8) : 0.5;
  if (width <= 0) return null;
  const color = parseHexColor(attr(node, "color")) ?? { r: 0, g: 0, b: 0 };
  return { width, color };
}

function twipsToPt(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return n / 20;
}

function parseSpacing(
  pPr: XmlNode | undefined,
  style: StyleInfo | undefined,
  size: number,
): { before: number; after: number; lineMult: number } {
  const node = pPr ? childNamed(pPr, "spacing") : undefined;
  const line = Number(node ? attr(node, "line") : undefined);
  const rule = (
    node ? (attr(node, "linerule") ?? attr(node, "lineRule")) : undefined
  )?.toLowerCase();
  let lineMult = style?.lineMult ?? 1.08;
  if (Number.isFinite(line) && line > 0) {
    if (rule === "exact" || rule === "atleast") {
      const exact = line / 20;
      lineMult = Math.max(0.7, exact / Math.max(size, 1));
    } else {
      lineMult = Math.max(0.7, line / 240);
    }
  }
  const linePt = size * lineMult;
  const beforeTwip = twipsToPt(node ? attr(node, "before") : undefined);
  const afterTwip = twipsToPt(node ? attr(node, "after") : undefined);
  const beforeLines = Number(
    node ? (attr(node, "beforelines") ?? attr(node, "beforeLines")) : undefined,
  );
  const afterLines = Number(
    node ? (attr(node, "afterlines") ?? attr(node, "afterLines")) : undefined,
  );
  const beforeFromLines =
    Number.isFinite(beforeLines) && beforeLines > 0
      ? (beforeLines / 100) * linePt
      : undefined;
  const afterFromLines =
    Number.isFinite(afterLines) && afterLines > 0
      ? (afterLines / 100) * linePt
      : undefined;
  const before = beforeTwip ?? beforeFromLines ?? style?.spaceBefore ?? 0;
  const after = afterTwip ?? afterFromLines ?? style?.spaceAfter ?? 0;
  return { before: Math.max(0, before), after: Math.max(0, after), lineMult };
}

function parseInd(
  pPr: XmlNode | undefined,
  style?: StyleInfo,
): { left: number; first: number } {
  const node = pPr ? childNamed(pPr, "ind") : undefined;
  const left = twipsToPt(
    node ? (attr(node, "left") ?? attr(node, "start")) : undefined,
  );
  const first = twipsToPt(node ? attr(node, "firstline") : undefined);
  const hanging = twipsToPt(node ? attr(node, "hanging") : undefined);
  const leftPt = left ?? style?.indentLeft ?? 0;
  let firstPt = first ?? style?.indentFirst ?? 0;
  if (hanging !== undefined) firstPt = -hanging;
  return { left: Math.max(0, leftPt), first: firstPt };
}

function parseBordersFrom(
  pr: XmlNode | undefined,
  tag: "tblborders" | "tcborders",
): SideBorders {
  if (!pr) return {};
  const box = childNamed(pr, tag);
  if (!box) return {};
  return {
    top: parseEdge(childNamed(box, "top")),
    left: parseEdge(childNamed(box, "left")),
    bottom: parseEdge(childNamed(box, "bottom")),
    right: parseEdge(childNamed(box, "right")),
    insideH: parseEdge(childNamed(box, "insideh")),
    insideV: parseEdge(childNamed(box, "insidev")),
  };
}

function mergeBorders(base: SideBorders, over: SideBorders): SideBorders {
  return {
    top: over.top !== undefined ? over.top : base.top,
    left: over.left !== undefined ? over.left : base.left,
    bottom: over.bottom !== undefined ? over.bottom : base.bottom,
    right: over.right !== undefined ? over.right : base.right,
    insideH: over.insideH !== undefined ? over.insideH : base.insideH,
    insideV: over.insideV !== undefined ? over.insideV : base.insideV,
  };
}

async function loadNumbering(zip: JSZip): Promise<NumInfo> {
  const info: NumInfo = {
    absOf: new Map(),
    fmtOf: new Map(),
    counters: new Map(),
  };
  const xml = await readZipString(zip, "word/numbering.xml");
  if (xml === undefined) return info;
  let parsed: unknown;
  try {
    parsed = parseXml(xml);
  } catch {
    return info;
  }
  const root = findFirst(asNodes(parsed), "numbering");
  if (!root) return info;
  for (const node of expand(childrenOf(root))) {
    const name = tagOf(node);
    if (name === "abstractnum") {
      const absId = attr(node, "abstractnumid");
      if (absId === undefined) continue;
      for (const lvl of expand(childrenOf(node))) {
        if (tagOf(lvl) !== "lvl") continue;
        const ilvl = attr(lvl, "ilvl") ?? "0";
        const fmt = childNamed(lvl, "numfmt");
        info.fmtOf.set(
          `${absId}:${ilvl}`,
          fmt ? (attr(fmt, "val") ?? "bullet") : "bullet",
        );
      }
    } else if (name === "num") {
      const numId = attr(node, "numid");
      const abs = childNamed(node, "abstractnumid");
      const absId = abs ? attr(abs, "val") : undefined;
      if (numId !== undefined && absId !== undefined)
        info.absOf.set(numId, absId);
    }
  }
  return info;
}

function listPrefix(numbering: NumInfo, numId: string, ilvl: number): string {
  const abs = numbering.absOf.get(numId);
  const fmt = abs ? numbering.fmtOf.get(`${abs}:${String(ilvl)}`) : undefined;
  const decimal =
    fmt !== undefined && /decimal|ordinal|cardinal|arabic/i.test(fmt);
  if (!decimal) return "• ";
  let counters = numbering.counters.get(numId);
  if (!counters) {
    counters = [];
    numbering.counters.set(numId, counters);
  }
  while (counters.length <= ilvl) counters.push(0);
  counters[ilvl] = (counters[ilvl] ?? 0) + 1;
  for (let i = ilvl + 1; i < counters.length; i++) counters[i] = 0;
  return `${counters[ilvl]}. `;
}

function walkBody(
  parsed: unknown,
  styles: StylePack,
  numbering: NumInfo,
): Block[] {
  const body = findFirst(asNodes(parsed), "body");
  if (!body) return [];
  const blocks: Block[] = [];
  collectFlow(childrenOf(body), styles, numbering, blocks);
  return blocks;
}

function collectFlow(
  nodes: XmlNode[],
  styles: StylePack,
  numbering: NumInfo,
  out: Block[],
): void {
  for (const node of expand(nodes)) {
    const name = tagOf(node);
    if (name === "p") {
      out.push(...paraToBlocks(node, styles, numbering, false));
      continue;
    }
    if (name === "tbl") {
      const table = parseTable(node, styles, numbering);
      if (table) out.push(table);
      continue;
    }
    if (
      name === "sectpr" ||
      name === "bookmarkstart" ||
      name === "bookmarkend" ||
      name === "prooferr" ||
      name === "commentrange" ||
      name === "commentrangestart" ||
      name === "commentrangeend"
    ) {
      continue;
    }
    const kids = childrenOf(node);
    if (kids.length > 0) collectFlow(kids, styles, numbering, out);
  }
}

function paraToBlocks(
  para: XmlNode,
  styles: StylePack,
  numbering: NumInfo,
  inTable: boolean,
): Block[] {
  const pPr = childNamed(para, "ppr");
  const pStyle = pPr ? childNamed(pPr, "pstyle") : undefined;
  const styleId = pStyle ? attr(pStyle, "val") : undefined;
  const style = styleId ? styles.byId.get(styleId) : undefined;
  const outline = pPr ? childNamed(pPr, "outlinelvl") : undefined;
  const heading =
    (styleId ? headingFromName(styleId) : undefined) ??
    style?.heading ??
    headingFromOutline(outline ? attr(outline, "val") : undefined);

  const jc = pPr ? childNamed(pPr, "jc") : undefined;
  const jcVal = (jc ? attr(jc, "val") : undefined)?.toLowerCase();
  let align: Align = "left";
  if (jcVal === "center") align = "center";
  else if (jcVal === "right" || jcVal === "end") align = "right";

  const pMark = pPr ? readRunPr(childNamed(pPr, "rpr")) : {};
  const paraNum = readNumPr(pPr);
  const numId = paraNum.explicitOff
    ? undefined
    : (paraNum.numId ?? style?.numId);
  const ilvl = paraNum.numId !== undefined ? paraNum.ilvl : (style?.ilvl ?? 0);
  const isList = numId !== undefined && numId !== "0" && heading === undefined;

  const baseSize = heading
    ? headingSize(heading)
    : clamp(style?.sizePt ?? pMark.sizePt ?? styles.defaultSize, 8, 28);
  const baseBold = heading !== undefined || Boolean(style?.bold ?? pMark.bold);
  const baseItalic = Boolean(style?.italic ?? pMark.italic);
  const metrics = parseSpacing(pPr, style, baseSize);
  const spacingNode = pPr ? childNamed(pPr, "spacing") : undefined;
  if (
    heading &&
    !spacingNode &&
    (style?.spaceBefore === undefined || style.spaceBefore === 0)
  ) {
    metrics.before = heading === 1 ? 12 : heading === 2 ? 10 : 8;
  }
  if (
    heading &&
    !spacingNode &&
    (style?.spaceAfter === undefined || style.spaceAfter === 0)
  ) {
    metrics.after = heading === 1 ? 6 : 4;
  }
  const ind = parseInd(pPr, style);

  const extent = {
    cx: undefined as number | undefined,
    cy: undefined as number | undefined,
  };
  const pieces: Piece[] = [];
  walkContent(expand(childrenOf(para)), {
    bold: baseBold,
    italic: baseItalic,
    size: baseSize,
    heading,
    inTable,
    extent,
    pieces,
  });

  const blocks: Block[] = [];
  let buf: Extract<Piece, { kind: "text" | "nl" }>[] = [];
  let listPrefixed = false;

  const flush = (forceEmpty: boolean): void => {
    const runs: Run[] = [];
    for (const item of buf) {
      if (item.kind === "nl") {
        const last = runs[runs.length - 1];
        if (last) last.text += "\n";
        else
          runs.push({
            text: "\n",
            bold: baseBold,
            italic: baseItalic,
            size: baseSize,
          });
        continue;
      }
      if (!item.text) continue;
      const last = runs[runs.length - 1];
      if (
        last &&
        last.bold === item.bold &&
        last.italic === item.italic &&
        last.size === item.size &&
        !last.text.endsWith("\n")
      ) {
        last.text += item.text;
      } else {
        runs.push({
          text: item.text,
          bold: item.bold,
          italic: item.italic,
          size: item.size,
        });
      }
    }
    const hasText = runs.some((r) => r.text.replace(/\s/g, "").length > 0);
    if (!hasText) {
      if (forceEmpty) {
        blocks.push({
          kind: "para",
          runs: [],
          align,
          indent: 0,
          firstIndent: 0,
          empty: true,
          size: baseSize,
          spaceBefore: metrics.before,
          spaceAfter: metrics.after,
          lineMult: metrics.lineMult,
        });
      }
      buf = [];
      return;
    }
    if (isList && numId && !listPrefixed) {
      const prefix = listPrefix(numbering, numId, ilvl);
      const first = runs[0];
      if (first) first.text = prefix + first.text;
      else
        runs.unshift({
          text: prefix,
          bold: baseBold,
          italic: baseItalic,
          size: baseSize,
        });
      listPrefixed = true;
    }
    const listPad = isList && ind.left === 0 ? 18 + Math.min(ilvl, 8) * 14 : 0;
    blocks.push({
      kind: "para",
      runs,
      align,
      indent: ind.left + listPad,
      firstIndent: ind.first,
      empty: false,
      size: baseSize,
      spaceBefore: metrics.before,
      spaceAfter: metrics.after,
      lineMult: metrics.lineMult,
    });
    buf = [];
  };

  const hadPieces = pieces.length > 0;
  for (const piece of pieces) {
    if (piece.kind === "break") {
      flush(false);
      if (!inTable) blocks.push({ kind: "break" });
    } else if (piece.kind === "image") {
      flush(false);
      blocks.push({ ...piece, align });
    } else {
      buf.push(piece);
    }
  }
  flush(!hadPieces && !inTable);

  return blocks;
}

function parseTable(
  tbl: XmlNode,
  styles: StylePack,
  numbering: NumInfo,
): Extract<Block, { kind: "table" }> | undefined {
  const colWeights = parseGridWeights(tbl);
  const rows: TableCell[][] = [];
  collectRows(tbl, styles, numbering, rows);
  if (rows.length === 0) return undefined;
  const colCount = rows.reduce(
    (max, row) =>
      Math.max(
        max,
        row.reduce((n, cell) => n + cell.span, 0),
      ),
    0,
  );
  if (colCount < 1) return undefined;
  const weights =
    colWeights.length >= colCount
      ? colWeights.slice(0, colCount)
      : padWeights(colWeights, colCount);
  const tblPr = expand(childrenOf(tbl)).find((c) => tagOf(c) === "tblpr");
  const styleNode = tblPr ? childNamed(tblPr, "tblstyle") : undefined;
  const styleId = styleNode ? attr(styleNode, "val") : undefined;
  const styleEdges = styleId ? (styles.tableBorders.get(styleId) ?? {}) : {};
  const localEdges = parseBordersFrom(tblPr, "tblborders");
  return {
    kind: "table",
    rows,
    colWeights: weights,
    edges: mergeBorders(styleEdges, localEdges),
  };
}

function padWeights(weights: number[], colCount: number): number[] {
  const next = weights.slice();
  while (next.length < colCount) next.push(1);
  return next;
}

function parseGridWeights(tbl: XmlNode): number[] {
  const grid = expand(childrenOf(tbl)).find((c) => tagOf(c) === "tblgrid");
  if (!grid) return [];
  const weights: number[] = [];
  for (const col of expand(childrenOf(grid))) {
    if (tagOf(col) !== "gridcol") continue;
    const raw = Number(attr(col, "w"));
    weights.push(Number.isFinite(raw) && raw > 0 ? raw : 1);
  }
  return weights;
}

function collectRows(
  tbl: XmlNode,
  styles: StylePack,
  numbering: NumInfo,
  rows: TableCell[][],
): void {
  for (const node of expand(childrenOf(tbl))) {
    const name = tagOf(node);
    if (name === "tr") {
      const row = parseRow(node, styles, numbering);
      if (row.length > 0) rows.push(row);
      continue;
    }
    if (name === "tblpr" || name === "tblgrid") continue;
    const kids = childrenOf(node);
    if (kids.length > 0) collectRows(node, styles, numbering, rows);
  }
}

function parseRow(
  tr: XmlNode,
  styles: StylePack,
  numbering: NumInfo,
): TableCell[] {
  const row: TableCell[] = [];
  for (const node of expand(childrenOf(tr))) {
    if (tagOf(node) === "tc") {
      row.push(parseCell(node, styles, numbering));
      continue;
    }
    if (tagOf(node) === "trpr") continue;
    const nested = expand(childrenOf(node)).filter((c) => tagOf(c) === "tc");
    for (const tc of nested) row.push(parseCell(tc, styles, numbering));
  }
  return row;
}

function parseCell(
  tc: XmlNode,
  styles: StylePack,
  numbering: NumInfo,
): TableCell {
  const pr = childNamed(tc, "tcpr");
  const spanNode = pr ? childNamed(pr, "gridspan") : undefined;
  const spanRaw = spanNode ? Number(attr(spanNode, "val")) : 1;
  const span =
    Number.isFinite(spanRaw) && spanRaw > 1
      ? Math.min(12, Math.trunc(spanRaw))
      : 1;
  const merge = pr ? childNamed(pr, "vmerge") : undefined;
  const mergeVal = (merge ? attr(merge, "val") : undefined)?.toLowerCase();
  const vContinue = Boolean(merge) && mergeVal !== "restart";
  const paras: CellPara[] = [];
  for (const child of expand(childrenOf(tc))) {
    const name = tagOf(child);
    if (name === "p") {
      for (const block of paraToBlocks(child, styles, numbering, true)) {
        if (block.kind === "para" && !block.empty) {
          paras.push({
            runs: block.runs,
            align: block.align,
            size: block.size,
            spaceAfter: block.spaceAfter,
            lineMult: block.lineMult,
          });
        }
      }
    } else if (name === "tbl") {
      const inner = parseTable(child, styles, numbering);
      if (inner) {
        for (const row of inner.rows) {
          const text = row
            .map((cell) =>
              cell.paras
                .map((p) => p.runs.map((r) => r.text).join(""))
                .join(" "),
            )
            .join("  |  ")
            .trim();
          if (text) {
            paras.push({
              runs: [{ text, bold: false, italic: false, size: 9 }],
              align: "left",
              size: 9,
              spaceAfter: 0,
              lineMult: 1.08,
            });
          }
        }
      }
    }
  }
  return {
    paras,
    span,
    vContinue,
    fill: parseShade(pr),
    edges: parseBordersFrom(pr, "tcborders"),
  };
}

function parseShade(
  pr: XmlNode | undefined,
): { r: number; g: number; b: number } | undefined {
  if (!pr) return undefined;
  const shd = childNamed(pr, "shd");
  const fill = shd ? attr(shd, "fill") : undefined;
  if (!fill || fill.toLowerCase() === "auto") return undefined;
  const hex = fill.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return undefined;
  return {
    r: parseInt(hex.slice(0, 2), 16) / 255,
    g: parseInt(hex.slice(2, 4), 16) / 255,
    b: parseInt(hex.slice(4, 6), 16) / 255,
  };
}

function walkContent(
  nodes: XmlNode[],
  ctx: {
    bold: boolean;
    italic: boolean;
    size: number;
    heading?: Heading;
    inTable: boolean;
    extent: { cx?: number; cy?: number };
    pieces: Piece[];
  },
): void {
  for (const node of nodes) {
    const name = tagOf(node);
    if (
      name === "ppr" ||
      name === "rpr" ||
      name === "sectpr" ||
      name === "del" ||
      name === "movefrom" ||
      name === "instrtext" ||
      name === "footnotereference" ||
      name === "endnotereference" ||
      name === "commentreference"
    ) {
      continue;
    }
    if (name === "r") {
      const runPr = readRunPr(childNamed(node, "rpr"));
      const size = resolveSize(runPr.sizePt, ctx.size, ctx.heading);
      walkContent(expand(childrenOf(node)), {
        ...ctx,
        bold: runPr.bold ?? ctx.bold,
        italic: runPr.italic ?? ctx.italic,
        size,
      });
      continue;
    }
    if (name === "t") {
      ctx.pieces.push({
        kind: "text",
        text: textOf(node),
        bold: ctx.bold,
        italic: ctx.italic,
        size: ctx.size,
      });
      continue;
    }
    if (name === "tab" || name === "ptab") {
      ctx.pieces.push({
        kind: "text",
        text: "    ",
        bold: ctx.bold,
        italic: ctx.italic,
        size: ctx.size,
      });
      continue;
    }
    if (name === "br") {
      const typ = (attr(node, "type") ?? "").toLowerCase();
      if (typ === "page" && !ctx.inTable) ctx.pieces.push({ kind: "break" });
      else ctx.pieces.push({ kind: "nl" });
      continue;
    }
    if (name === "cr") {
      ctx.pieces.push({ kind: "nl" });
      continue;
    }
    if (name === "lastrenderedpagebreak") {
      continue;
    }
    if (name === "extent") {
      const cx = Number(attr(node, "cx"));
      const cy = Number(attr(node, "cy"));
      if (Number.isFinite(cx) && cx > 0) ctx.extent.cx = cx;
      if (Number.isFinite(cy) && cy > 0) ctx.extent.cy = cy;
      continue;
    }
    if (name === "blip") {
      const id = attr(node, "embed");
      if (id) {
        ctx.pieces.push({
          kind: "image",
          relId: id,
          cx: ctx.extent.cx,
          cy: ctx.extent.cy,
        });
      }
      continue;
    }
    if (name === "imagedata") {
      const id = attr(node, "id");
      if (id) {
        ctx.pieces.push({
          kind: "image",
          relId: id,
          cx: ctx.extent.cx,
          cy: ctx.extent.cy,
        });
      }
      continue;
    }
    if (name === "drawing" || name === "pict" || name === "object") {
      walkContent(expand(childrenOf(node)), {
        ...ctx,
        extent: { cx: undefined, cy: undefined },
      });
      continue;
    }
    walkContent(expand(childrenOf(node)), ctx);
  }
}

function resolveSize(
  runPt: number | undefined,
  paraPt: number,
  heading?: Heading,
): number {
  if (heading) {
    const floor = headingSize(heading);
    if (runPt === undefined) return floor;
    return clamp(Math.max(runPt, floor), 8, 36);
  }
  if (runPt === undefined) return paraPt;
  return clamp(runPt, 8, 28);
}

const REPLACED_GLYPH_WARNING =
  "This PDF uses standard fonts; some characters were replaced.";

type GlyphStats = { letters: number; replaced: number };

function isWinAnsi(cp: number): boolean {
  if (cp >= 0x20 && cp <= 0x7e) return true;
  if (cp >= 0xa0 && cp <= 0xff) return true;
  return WIN1252_EXTRA.has(cp);
}

function isLetterLike(ch: string): boolean {
  return /\p{L}/u.test(ch);
}

const characterSets = new WeakMap<PDFFont, Set<number>>();
function toPdfText(text: string, stats?: GlyphStats, font?: PDFFont): string {
  let characters = font ? characterSets.get(font) : undefined;
  if (font && !characters) {
    characters = new Set(font.getCharacterSet());
    characterSets.set(font, characters);
  }
  let out = "";
  for (const ch of text) {
    if (ch === "\n" || ch === "\r") {
      out += ch === "\n" ? "\n" : "";
      continue;
    }
    const letter = isLetterLike(ch);
    const mapped = TEXT_MAP[ch] ?? ch;
    let replacedLetter = false;
    for (const unit of mapped) {
      const cp = unit.codePointAt(0);
      if (cp === undefined) continue;
      if (cp < 0x20) continue;
      if (characters ? characters.has(cp) : isWinAnsi(cp)) {
        out += unit;
      } else {
        out += "?";
        replacedLetter = true;
      }
    }
    if (stats) {
      if (letter) stats.letters += 1;
      if (replacedLetter) stats.replaced += 1;
    }
  }
  return out;
}

function collectGlyphStats(blocks: Block[], fonts?: Fonts): GlyphStats {
  const stats: GlyphStats = { letters: 0, replaced: 0 };
  const addRuns = (runs: Run[]): void => {
    for (const run of runs)
      toPdfText(
        run.text,
        stats,
        fonts ? pickFont(fonts, run.bold, run.italic) : undefined,
      );
  };
  for (const block of blocks) {
    if (block.kind === "para") addRuns(block.runs);
    else if (block.kind === "table") {
      for (const row of block.rows) {
        for (const cell of row) {
          for (const para of cell.paras) addRuns(para.runs);
        }
      }
    }
  }
  return stats;
}

function wordToPdfExtra(stats: GlyphStats): JobOk["extra"] | undefined {
  if (stats.replaced <= 0) return undefined;
  return {
    wordToPdf: {
      replacedChars: stats.replaced,
      warnings: [REPLACED_GLYPH_WARNING],
    },
  };
}

function followingInkReserve(
  blocks: Block[],
  index: number,
  y: number,
  bottom: number,
): number {
  let reserved = 0;
  const available = y - bottom;
  if (available <= 0) return 0;
  for (let i = index + 1; i < blocks.length; i++) {
    const next = blocks[i];
    if (!next) continue;
    if (next.kind === "break") break;
    let h = 0;
    if (next.kind === "para") {
      if (next.empty) continue;
      h = next.size * next.lineMult;
    } else if (next.kind === "image") h = 8;
    else if (next.kind === "table") h = 16;
    if (h <= 0) continue;
    if (reserved + h > available) break;
    reserved += h;
  }
  return reserved;
}

function pickFont(fonts: Fonts, bold: boolean, italic: boolean): PDFFont {
  if (bold && italic) return fonts.bi;
  if (bold) return fonts.b;
  if (italic) return fonts.i;
  return fonts.r;
}

function hasJpegMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  );
}

function hasPngMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

function imageFormat(
  bytes: Uint8Array,
  path: string,
): "jpg" | "png" | undefined {
  if (hasJpegMagic(bytes)) return "jpg";
  if (hasPngMagic(bytes)) return "png";
  const lower = path.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "jpg";
  if (lower.endsWith(".png")) return "png";
  return undefined;
}

async function loadImage(
  zip: JSZip,
  rels: Map<string, Rel>,
  relId: string,
): Promise<{ bytes: Uint8Array; format: "jpg" | "png" } | undefined> {
  const rel = rels.get(relId);
  if (!rel || rel.external) return undefined;
  const path = resolveZipTarget(rel.target);
  if (!path) return undefined;
  const bytes = await readZipBytes(zip, path);
  if (!bytes || bytes.byteLength < 8) return undefined;
  const format = imageFormat(bytes, path);
  if (!format) return undefined;
  return { bytes, format };
}

function wrapLine(
  runs: Run[],
  maxWidth: number,
  fonts: Fonts,
  lineMult = 1.08,
): { parts: LinePart[]; width: number; height: number }[] {
  const lines: { parts: LinePart[]; width: number; height: number }[] = [];
  let parts: LinePart[] = [];
  let width = 0;
  let height = 0;

  const flush = (): void => {
    lines.push({ parts, width, height: height || 11 * lineMult });
    parts = [];
    width = 0;
    height = 0;
  };

  const pushPart = (part: LinePart): void => {
    parts.push(part);
    width += part.width;
    height = Math.max(height, part.size * lineMult);
  };

  const measure = (
    text: string,
    bold: boolean,
    italic: boolean,
    size: number,
  ): number => {
    return pickFont(fonts, bold, italic).widthOfTextAtSize(text, size);
  };

  const addToken = (
    text: string,
    bold: boolean,
    italic: boolean,
    size: number,
  ): void => {
    if (!text) return;
    const w = measure(text, bold, italic, size);
    const isSpace = /^[ \t]+$/.test(text);
    if (width + w > maxWidth && parts.length > 0) {
      flush();
      if (isSpace) return;
    }
    if (w > maxWidth && !isSpace) {
      let chunk = "";
      for (const ch of text) {
        const next = chunk + ch;
        const nw = measure(next, bold, italic, size);
        if (nw > maxWidth && chunk) {
          pushPart({
            text: chunk,
            bold,
            italic,
            size,
            width: measure(chunk, bold, italic, size),
          });
          flush();
          chunk = ch;
        } else {
          chunk = next;
        }
      }
      if (chunk) {
        pushPart({
          text: chunk,
          bold,
          italic,
          size,
          width: measure(chunk, bold, italic, size),
        });
      }
      return;
    }
    pushPart({ text, bold, italic, size, width: w });
  };

  for (const run of runs) {
    const text = toPdfText(
      run.text,
      undefined,
      pickFont(fonts, run.bold, run.italic),
    );
    let i = 0;
    while (i < text.length) {
      if (text[i] === "\n") {
        flush();
        i += 1;
        continue;
      }
      if (text[i] === " ") {
        let j = i + 1;
        while (j < text.length && text[j] === " ") j += 1;
        addToken(text.slice(i, j), run.bold, run.italic, run.size);
        i = j;
        continue;
      }
      let j = i + 1;
      while (j < text.length && text[j] !== " " && text[j] !== "\n") j += 1;
      addToken(text.slice(i, j), run.bold, run.italic, run.size);
      i = j;
    }
  }
  if (parts.length > 0 || lines.length === 0) flush();
  return lines;
}

function colWidths(weights: number[], count: number, inner: number): number[] {
  const raw = padWeights(weights, count);
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  return raw.map((w) => (w / sum) * inner);
}

function cellWidth(widths: number[], start: number, span: number): number {
  let w = 0;
  for (let i = start; i < start + span && i < widths.length; i++)
    w += widths[i] ?? 0;
  return Math.max(16, w);
}

function measureCell(
  cell: TableCell,
  width: number,
  fonts: Fonts,
): {
  height: number;
  lines: { parts: LinePart[]; width: number; height: number; align: Align }[];
} {
  const inner = Math.max(20, width - CELL_PAD * 2);
  const lines: {
    parts: LinePart[];
    width: number;
    height: number;
    align: Align;
  }[] = [];
  let height = CELL_PAD * 2;
  if (cell.vContinue || cell.paras.length === 0) {
    return { height: Math.max(height, 16), lines };
  }
  for (const para of cell.paras) {
    const wrapped = wrapLine(para.runs, inner, fonts, para.lineMult);
    for (const line of wrapped) {
      lines.push({ ...line, align: para.align });
      height += line.height;
    }
    height += para.spaceAfter;
  }
  return { height, lines };
}

function resolveEdge(
  table: SideBorders,
  cell: SideBorders,
  side: "top" | "left" | "bottom" | "right",
  row: number,
  col: number,
  rowCount: number,
  colCount: number,
  span: number,
): Edge | null {
  const direct = cell[side];
  if (direct !== undefined) return direct;
  if (side === "top") return (row === 0 ? table.top : table.insideH) ?? null;
  if (side === "bottom") {
    return (row === rowCount - 1 ? table.bottom : table.insideH) ?? null;
  }
  if (side === "left") return (col === 0 ? table.left : table.insideV) ?? null;
  return (col + span >= colCount ? table.right : table.insideV) ?? null;
}

function strokeEdge(
  page: PDFPage,
  edge: Edge | null,
  start: { x: number; y: number },
  end: { x: number; y: number },
): void {
  if (!edge) return;
  page.drawLine({
    start,
    end,
    thickness: edge.width,
    color: rgb(edge.color.r, edge.color.g, edge.color.b),
  });
}

function drawTable(
  table: Extract<Block, { kind: "table" }>,
  ctx: {
    fonts: Fonts;
    layout: PageLayout;
    newPage: () => void;
    ensurePage: () => PDFPage;
    getY: () => number;
    setY: (y: number) => void;
    markInk: () => void;
  },
): boolean {
  const colCount = table.rows.reduce(
    (max, row) =>
      Math.max(
        max,
        row.reduce((n, cell) => n + cell.span, 0),
      ),
    0,
  );
  if (colCount < 1) return false;
  const widths = colWidths(
    table.colWeights,
    colCount,
    contentWidth(ctx.layout),
  );
  const rowCount = table.rows.length;
  let painted = false;

  for (let r = 0; r < table.rows.length; r++) {
    const row = table.rows[r];
    if (!row) continue;
    const measured: {
      cell: TableCell;
      width: number;
      col: number;
      lines: {
        parts: LinePart[];
        width: number;
        height: number;
        align: Align;
      }[];
    }[] = [];
    let col = 0;
    let rowH = 16;
    for (const cell of row) {
      const width = cellWidth(widths, col, cell.span);
      const m = measureCell(cell, width, ctx.fonts);
      measured.push({ cell, width, col, lines: m.lines });
      rowH = Math.max(rowH, m.height);
      col += cell.span;
    }

    ctx.ensurePage();
    if (ctx.getY() - rowH < ctx.layout.bottom) ctx.newPage();
    const dest = ctx.ensurePage();
    ctx.markInk();
    let x = ctx.layout.left;
    const top = ctx.getY();
    const bottom = top - rowH;
    for (const item of measured) {
      if (item.cell.fill) {
        dest.drawRectangle({
          x,
          y: bottom,
          width: item.width,
          height: rowH,
          color: rgb(item.cell.fill.r, item.cell.fill.g, item.cell.fill.b),
          borderWidth: 0,
        });
      }
      const right = x + item.width;
      strokeEdge(
        dest,
        resolveEdge(
          table.edges,
          item.cell.edges,
          "top",
          r,
          item.col,
          rowCount,
          colCount,
          item.cell.span,
        ),
        { x, y: top },
        { x: right, y: top },
      );
      strokeEdge(
        dest,
        resolveEdge(
          table.edges,
          item.cell.edges,
          "bottom",
          r,
          item.col,
          rowCount,
          colCount,
          item.cell.span,
        ),
        { x, y: bottom },
        { x: right, y: bottom },
      );
      strokeEdge(
        dest,
        resolveEdge(
          table.edges,
          item.cell.edges,
          "left",
          r,
          item.col,
          rowCount,
          colCount,
          item.cell.span,
        ),
        { x, y: top },
        { x, y: bottom },
      );
      strokeEdge(
        dest,
        resolveEdge(
          table.edges,
          item.cell.edges,
          "right",
          r,
          item.col,
          rowCount,
          colCount,
          item.cell.span,
        ),
        { x: right, y: top },
        { x: right, y: bottom },
      );
      if (!item.cell.vContinue) {
        let ty = top - CELL_PAD;
        for (const line of item.lines) {
          ty -= line.height;
          let tx = x + CELL_PAD;
          if (line.align === "center") {
            tx = x + (item.width - line.width) / 2;
          } else if (line.align === "right") {
            tx = x + item.width - CELL_PAD - line.width;
          }
          let cursor = tx;
          for (const part of line.parts) {
            if (!part.text) continue;
            dest.drawText(part.text, {
              x: cursor,
              y: ty + line.height * 0.15,
              size: part.size,
              font: pickFont(ctx.fonts, part.bold, part.italic),
              color: INK,
            });
            cursor += part.width;
            if (part.text.replace(/\s/g, "").length > 0) painted = true;
          }
        }
      }
      x += item.width;
    }
    ctx.setY(bottom);
  }
  return painted;
}

function pdfNameFromDocx(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "document";
  const stem = base.replace(/\.docx$/i, "").trim() || "document";
  return `${stem}.pdf`;
}

async function renderPdf(
  zip: JSZip,
  rels: Map<string, Rel>,
  blocks: Block[],
  sourceName: string,
  layout: PageLayout,
): Promise<JobResult> {
  const filename = pdfNameFromDocx(sourceName);
  const inner = contentWidth(layout);
  const pdf = await PDFDocument.create();
  const fonts = await documentFonts(
    pdf,
    collectGlyphStats(blocks).replaced > 0,
  );

  let page: PDFPage | undefined;
  let y = 0;
  let hadText = false;
  let hadImage = false;
  const pageInk: boolean[] = [];
  const imageCache = new Map<string, PDFImage | null>();
  const glyphStats = collectGlyphStats(blocks, fonts);
  if (glyphStats.replaced > 0)
    return {
      ok: false,
      message:
        "This document contains characters that the bundled fonts cannot preserve. Export it to PDF from Word or your original editor to keep every character.",
    };
  const extra = wordToPdfExtra(glyphStats);

  const newPage = (): void => {
    page = pdf.addPage([layout.width, layout.height]);
    y = layout.height - layout.top;
    pageInk.push(false);
  };

  const markInk = (): void => {
    if (pageInk.length > 0) pageInk[pageInk.length - 1] = true;
  };

  const ensurePage = (): PDFPage => {
    if (!page) newPage();
    return page as PDFPage;
  };

  const ensureSpace = (height: number): PDFPage => {
    const current = ensurePage();
    if (y - height < layout.bottom) {
      newPage();
      return page as PDFPage;
    }
    return current;
  };

  const tryAdvanceY = (gap: number, reserved = 0): void => {
    if (!page || gap <= 0) return;
    if (y - gap - reserved >= layout.bottom) y -= gap;
  };

  const embedImage = async (relId: string): Promise<PDFImage | undefined> => {
    if (imageCache.has(relId)) {
      return imageCache.get(relId) ?? undefined;
    }
    const loaded = await loadImage(zip, rels, relId);
    if (!loaded) {
      throw new Error("An embedded image could not be preserved. Export this document from Word to keep its complete contents.");
    }
    try {
      const img =
        loaded.format === "jpg"
          ? await pdf.embedJpg(loaded.bytes)
          : await pdf.embedPng(loaded.bytes);
      imageCache.set(relId, img);
      return img;
    } catch {
      throw new Error("An embedded image could not be preserved. Export this document from Word to keep its complete contents.");
    }
  };

  for (const [i, block] of blocks.entries()) {
    if (block.kind === "table") {
      const painted = drawTable(block, {
        fonts,
        layout,
        newPage,
        ensurePage,
        getY: () => y,
        setY: (next) => {
          y = next;
        },
        markInk,
      });
      if (painted) hadText = true;
      continue;
    }
    if (block.kind === "break") {
      if (page) newPage();
      continue;
    }
    if (block.kind === "image") {
      const img = await embedImage(block.relId);
      if (!img) continue;
      hadImage = true;
      const emuW = block.cx !== undefined ? block.cx / 12700 : img.width;
      const emuH = block.cy !== undefined ? block.cy / 12700 : img.height;
      const boxW = Math.max(1, emuW);
      const boxH = Math.max(1, emuH);
      const scale = Math.min(inner / boxW, MAX_IMAGE_H / boxH, 1);
      const drawW = boxW * scale;
      const drawH = boxH * scale;
      ensurePage();
      if (drawH > y - layout.bottom) newPage();
      const dest = page as PDFPage;
      let x = layout.left;
      if (block.align === "center") x = layout.left + (inner - drawW) / 2;
      else if (block.align === "right") x = layout.width - layout.right - drawW;
      dest.drawImage(img, {
        x,
        y: y - drawH,
        width: drawW,
        height: drawH,
      });
      markInk();
      y -= drawH + 8;
      continue;
    }

    if (block.empty) {
      const gap =
        block.spaceBefore + block.spaceAfter + block.size * block.lineMult;
      tryAdvanceY(gap, followingInkReserve(blocks, i, y, layout.bottom));
      continue;
    }

    const maxW = Math.max(40, inner - block.indent);
    const lines = wrapLine(block.runs, maxW, fonts, block.lineMult);
    const firstH = lines[0]?.height ?? block.size * block.lineMult;
    tryAdvanceY(
      block.spaceBefore,
      firstH + followingInkReserve(blocks, i, y - firstH, layout.bottom),
    );

    let lineIndex = 0;
    for (const line of lines) {
      const target = ensureSpace(line.height);
      const baseline = y - line.height + line.height * 0.2;
      const indentExtra = lineIndex === 0 ? block.firstIndent : 0;
      let x = layout.left + block.indent + indentExtra;
      if (block.align === "center") {
        x = layout.left + block.indent + (maxW - line.width) / 2;
      } else if (block.align === "right") {
        x = layout.width - layout.right - line.width;
      }
      let cursor = x;
      for (const part of line.parts) {
        if (!part.text) continue;
        target.drawText(part.text, {
          x: cursor,
          y: baseline,
          size: part.size,
          font: pickFont(fonts, part.bold, part.italic),
          color: INK,
        });
        markInk();
        cursor += part.width;
        if (part.text.replace(/\s/g, "").length > 0) hadText = true;
      }
      y -= line.height;
      lineIndex += 1;
    }
    tryAdvanceY(
      block.spaceAfter,
      followingInkReserve(blocks, i, y, layout.bottom),
    );
  }

  if (!hadText && !hadImage) {
    const empty = await PDFDocument.create();
    const only = empty.addPage([layout.width, layout.height]);
    const font = await empty.embedFont(StandardFonts.Helvetica);
    only.drawText(EMPTY_LINE, {
      x: layout.left,
      y: layout.height - layout.top - 14,
      size: 12,
      font,
      color: INK,
    });
    const written = await empty.save();
    return {
      ok: true,
      bytes: written.slice(),
      filename,
      pageCount: empty.getPageCount(),
    };
  }

  while (pageInk.length > 1 && pageInk[pageInk.length - 1] === false) {
    pdf.removePage(pageInk.length - 1);
    pageInk.pop();
  }
  if (pdf.getPageCount() === 0) newPage();
  const written = await pdf.save();
  return extra
    ? {
        ok: true,
        bytes: written.slice(),
        filename,
        pageCount: pdf.getPageCount(),
        extra,
      }
    : {
        ok: true,
        bytes: written.slice(),
        filename,
        pageCount: pdf.getPageCount(),
      };
}
