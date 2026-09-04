import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  Camera,
  FileDigit,
  FileLock2,
  FilePenLine,
  FileStack,
  ImageDown,
  ImagePlus,
  NotebookText,
  Shrink,
  Split,
  SquareStack,
  Stamp,
} from 'lucide-react';
import type { ToolId } from '../lib/types';

export const TOOL_ICONS: Record<ToolId, LucideIcon> = {
  merge: FileStack,
  split: Split,
  images: ImagePlus,
  'pdf-images': ImageDown,
  compress: Shrink,
  scan: Camera,
  organize: SquareStack,
  watermark: Stamp,
  numbers: FileDigit,
  protect: FileLock2,
  view: BookOpen,
  'docx-pdf': NotebookText,
  'pdf-docx': FilePenLine,
};
