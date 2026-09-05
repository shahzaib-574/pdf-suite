import { get, set, setMany, delMany } from "idb-keyval";
import { toolById } from "../lib/catalog";
import type { RecentItem, ToolId } from "../lib/types";

const LEGACY_KEY = "pdf.recents";
const KEY = "pdf.library.v2";
const byteKey = (id: string) => `pdf.file.${id}`;
const MAX_ITEMS = 200;
const MAX_TOTAL_BYTES = 512 * 1024 * 1024;
type Metadata = Omit<RecentItem, "bytes">;
let migration: Promise<void> | undefined;
let operations: Promise<unknown> = Promise.resolve();

function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = operations.then(fn, fn);
  operations = next.catch(() => undefined);
  return next;
}

async function ready(): Promise<void> {
  migration ??= (async () => {
    if ((await get(KEY)) !== undefined) return;
    const old = await get<RecentItem[]>(LEGACY_KEY);
    const rows: Metadata[] = [];
    const entries: [IDBValidKey, unknown][] = [];
    for (const item of Array.isArray(old) ? old : []) {
      if (!item || typeof item.id !== "string" || !toolById(item.tool))
        continue;
      const bytes =
        item.bytes instanceof Uint8Array ? item.bytes : new Uint8Array();
      const { bytes: _bytes, ...meta } = item;
      rows.push({
        ...meta,
        mime:
          item.mime ||
          (item.name.endsWith(".docx")
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "application/pdf"),
        stored: bytes.length > 0,
      });
      if (bytes.length) entries.push([byteKey(item.id), bytes]);
    }
    entries.push([KEY, rows], [LEGACY_KEY, []]);
    await setMany(entries);
  })().catch((error) => {
    migration = undefined;
    throw error;
  });
  await migration;
}

export async function listRecents(): Promise<RecentItem[]> {
  await ready();
  const rows = (await get<Metadata[]>(KEY)) ?? [];
  return rows
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((row) => ({ ...row, bytes: new Uint8Array() }));
}

export async function saveRecent(input: {
  name: string;
  mime?: string;
  tool: ToolId;
  bytes: Uint8Array;
}): Promise<RecentItem> {
  return serialize(async () => {
    await ready();
    const rows = (await get<Metadata[]>(KEY)) ?? [];
    const total = rows.reduce(
      (sum, row) => sum + (row.stored ? row.size : 0),
      0,
    );
    if (
      rows.length >= MAX_ITEMS ||
      total + input.bytes.length > MAX_TOTAL_BYTES
    ) {
      throw new Error(
        "Your local library is full. Save this result to your device, then remove files from Recents to make space.",
      );
    }
    const meta: Metadata = {
      id: crypto.randomUUID(),
      name: input.name,
      mime: input.mime ?? "application/pdf",
      tool: input.tool,
      createdAt: Date.now(),
      size: input.bytes.length,
      stored: true,
    };
    await setMany([
      [byteKey(meta.id), input.bytes],
      [KEY, [meta, ...rows]],
    ]);
    return { ...meta, bytes: input.bytes };
  });
}

export async function getRecent(id: string): Promise<RecentItem | undefined> {
  await ready();
  const row = ((await get<Metadata[]>(KEY)) ?? []).find(
    (item) => item.id === id,
  );
  if (!row) return undefined;
  return {
    ...row,
    bytes: (await get<Uint8Array>(byteKey(id))) ?? new Uint8Array(),
  };
}

export async function renameRecent(id: string, name: string): Promise<void> {
  await serialize(async () => {
    await ready();
    const rows = (await get<Metadata[]>(KEY)) ?? [];
    await set(
      KEY,
      rows.map((row) => (row.id === id ? { ...row, name } : row)),
    );
  });
}

export async function deleteRecent(id: string): Promise<void> {
  await serialize(async () => {
    await ready();
    const rows = (await get<Metadata[]>(KEY)) ?? [];
    await set(
      KEY,
      rows.filter((row) => row.id !== id),
    );
    await delMany([byteKey(id)]);
  });
}

export async function clearRecents(): Promise<void> {
  await serialize(async () => {
    await ready();
    const rows = (await get<Metadata[]>(KEY)) ?? [];
    await set(KEY, []);
    await delMany(rows.map((row) => byteKey(row.id)));
  });
}
