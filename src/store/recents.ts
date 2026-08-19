import { get, set, update } from 'idb-keyval';
import { toolById } from '../lib/catalog';
import type { RecentItem, ToolId } from '../lib/types';

const KEY = 'pdf.recents';
const MAX_ITEMS = 20;
const MAX_BYTES = 8 * 1024 * 1024;

function asBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array();
}

function isToolId(value: unknown): value is ToolId {
  return typeof value === 'string' && toolById(value) !== undefined;
}

function normalizeItem(raw: unknown): RecentItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const item = raw as Record<string, unknown>;
  if (typeof item.id !== 'string' || typeof item.name !== 'string') return null;
  if (!isToolId(item.tool)) return null;
  if (typeof item.createdAt !== 'number' || typeof item.size !== 'number') {
    return null;
  }
  return {
    id: item.id,
    name: item.name,
    tool: item.tool,
    createdAt: item.createdAt,
    bytes: asBytes(item.bytes),
    size: item.size,
  };
}

function readList(raw: unknown): RecentItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalizeItem)
    .filter((item): item is RecentItem => item !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function listRecents(): Promise<RecentItem[]> {
  try {
    return readList(await get<unknown>(KEY));
  } catch {
    return [];
  }
}

export async function saveRecent(input: {
  name: string;
  tool: ToolId;
  bytes: Uint8Array;
}): Promise<RecentItem> {
  const size = input.bytes.byteLength;
  const item: RecentItem = {
    id: crypto.randomUUID(),
    name: input.name,
    tool: input.tool,
    createdAt: Date.now(),
    bytes: size > MAX_BYTES ? new Uint8Array() : new Uint8Array(input.bytes),
    size,
  };
  await update<unknown>(KEY, (old) => {
    const prev = readList(old).filter((row) => row.id !== item.id);
    return [item, ...prev].slice(0, MAX_ITEMS);
  });
  return item;
}

export async function getRecent(id: string): Promise<RecentItem | undefined> {
  const items = await listRecents();
  return items.find((item) => item.id === id);
}

export async function deleteRecent(id: string): Promise<void> {
  await update<unknown>(KEY, (old) => readList(old).filter((item) => item.id !== id));
}

export async function clearRecents(): Promise<void> {
  await set(KEY, []);
}
