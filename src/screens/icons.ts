import { createLucideIcon, type LucideIcon } from 'lucide-react';
import type { ToolId } from '../lib/types';

// One 24px grid, simple silhouettes and consistent stroke weight for every tool.
export const TOOL_ICONS: Record<ToolId, LucideIcon> = {
  'merge': createLucideIcon('Tool-merge', [
    ['path', { d: 'M8 3h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z', key: '0' }],
    ['path', { d: 'M3 8v11a2 2 0 0 0 2 2h11', key: '1' }],
  ]),
  'split': createLucideIcon('Tool-split', [
    ['path', { d: 'M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4', key: '0' }],
    ['path', { d: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4', key: '1' }],
    ['path', { d: 'M12 5v3m0 3v2m0 3v3', key: '2' }],
  ]),
  'images': createLucideIcon('Tool-images', [
    ['path', { d: 'M5 3h10l4 4v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z', key: '0' }],
    ['path', { d: 'M15 3v5h4', key: '1' }],
    ['path', { d: 'M6 17l4-5 5 5m-1-2 2-2', key: '2' }],
  ]),
  'pdf-images': createLucideIcon('Tool-pdf-images', [
    ['path', { d: 'M11 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6', key: '0' }],
    ['path', { d: 'M6 17l4-5 5 5', key: '1' }],
    ['path', { d: 'M15 3h6v6m0-6-7 7', key: '2' }],
  ]),
  'compress': createLucideIcon('Tool-compress', [
    ['path', { d: 'M3 3l6 6m0-5v5H4', key: '0' }],
    ['path', { d: 'M21 21l-6-6m0 5v-5h5', key: '1' }],
  ]),
  'scan': createLucideIcon('Tool-scan', [
    ['path', { d: 'M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3', key: '0' }],
    ['path', { d: 'M7 12h10', key: '1' }],
  ]),
  'organize': createLucideIcon('Tool-organize', [
    ['path', { d: 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z', key: '0' }],
  ]),
  'watermark': createLucideIcon('Tool-watermark', [
    ['path', { d: 'M12 3c-2 3-7 8-7 12a7 7 0 0 0 14 0c0-4-5-9-7-12Z', key: '0' }],
  ]),
  'numbers': createLucideIcon('Tool-numbers', [
    ['path', { d: 'M9 3 7 21M17 3l-2 18M4 9h17M3 15h17', key: '0' }],
  ]),
  'protect': createLucideIcon('Tool-protect', [
    ['path', { d: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z', key: '0' }],
    ['path', { d: 'M12 10v4', key: '1' }],
  ]),
  'view': createLucideIcon('Tool-view', [
    ['path', { d: 'M12 5C9 3 5 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-2-1-6-1-9 1Zm0 0v15', key: '0' }],
  ]),
  'docx-pdf': createLucideIcon('Tool-docx-pdf', [
    ['path', { d: 'M14 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14', key: '0' }],
    ['path', { d: 'M17 4v11m-4-4 4 4 4-4', key: '1' }],
  ]),
  'pdf-docx': createLucideIcon('Tool-pdf-docx', [
    ['path', { d: 'M13 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14', key: '0' }],
    ['path', { d: 'M16 5l3-3 3 3-10 10-4 1 1-4ZM15 6l3 3', key: '1' }],
  ]),
};
