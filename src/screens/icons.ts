import type { LucideIcon } from 'lucide-react';
import {
  Camera,
  Combine,
  Eye,
  FileType,
  Hash,
  ImageDown,
  Images,
  ListOrdered,
  Lock,
  Minimize2,
  Scissors,
  Stamp,
} from 'lucide-react';
import type { ToolId } from '../lib/types';

export const TOOL_ICONS: Record<ToolId, LucideIcon> = {
  merge: Combine,
  split: Scissors,
  images: Images,
  'pdf-images': ImageDown,
  compress: Minimize2,
  scan: Camera,
  organize: ListOrdered,
  watermark: Stamp,
  numbers: Hash,
  protect: Lock,
  view: Eye,
  'docx-pdf': FileType,
};
