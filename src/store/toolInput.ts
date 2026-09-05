import { getRecent } from "./recents";
import type { PickedFile, ToolId } from "../lib/types";
let pending: { tool: ToolId; files: PickedFile[] } | null = null;
export function queueToolFiles(tool: ToolId, files: PickedFile[]) {
  pending = { tool, files };
}
export function takeToolFiles(tool: ToolId): PickedFile[] {
  if (!pending || pending.tool !== tool) return [];
  const files = pending.files;
  pending = null;
  return files;
}
export async function recentFile(id: string): Promise<PickedFile> {
  const file = await getRecent(id);
  if (!file?.bytes.length)
    throw new Error(
      "This older entry has no local copy. Choose the original file again.",
    );
  return file;
}
