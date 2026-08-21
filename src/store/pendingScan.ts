import type { PickedFile } from '../lib/types';

let pendingScan: PickedFile[] = [];
let pendingScanError: string | null = null;

export function stagePendingScan(files: PickedFile[]): void {
  pendingScan = files;
  pendingScanError = null;
}

export function stagePendingScanError(message: string): void {
  pendingScan = [];
  pendingScanError = message;
}

export function takePendingScan(): PickedFile[] {
  const files = pendingScan;
  pendingScan = [];
  return files;
}

export function takePendingScanError(): string | null {
  const message = pendingScanError;
  pendingScanError = null;
  return message;
}
