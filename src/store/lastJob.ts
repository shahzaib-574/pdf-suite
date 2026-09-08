import type { JobOk, ToolId, PickedFile } from '../lib/types';

export const lastJob: { result: JobOk | null; tool: ToolId | null } = {
  result: null,
  tool: null,
};

export let currentViewerBytes: Uint8Array | null = null;
export let currentViewerName = 'document.pdf';
export let pendingViewerImport: Promise<PickedFile> | null = null;
export function beginViewerImport() {
  let resolve!: (file:PickedFile)=>void;
  let reject!: (error:Error)=>void;
  currentViewerBytes=null;
  currentViewerName='Opening PDF';
  pendingViewerImport=new Promise<PickedFile>((yes,no)=>{resolve=yes;reject=no;});
  // Import can fail after the user has left the reader.
  void pendingViewerImport.catch(()=>undefined);
  return {resolve,reject};
}

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
  pendingViewerImport = null;
}
