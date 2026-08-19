import type { JobOk, ToolId } from '../lib/types';

export const lastJob: { result: JobOk | null; tool: ToolId | null } = {
  result: null,
  tool: null,
};

export let currentViewerBytes: Uint8Array | null = null;
export let currentViewerName = 'document.pdf';

export function setLastJob(result: JobOk | null, tool: ToolId | null): void {
  lastJob.result = result;
  lastJob.tool = tool;
}

export function setCurrentViewer(
  bytes: Uint8Array | null,
  name = 'document.pdf',
): void {
  currentViewerBytes = bytes;
  currentViewerName = name;
}
