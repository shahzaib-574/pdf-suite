import { validCorners, type Point } from './scanGeometry';

/** Conservative paper/background segmentation; uncertain results stay manual. */
export async function detectScanCorners(blob: Blob): Promise<Point[] | null> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) { bitmap.close(); return null; }
  ctx.drawImage(bitmap, 0, 0, w, h); bitmap.close();
  const pixels = ctx.getImageData(0, 0, w, h).data;
  const gray = new Uint8Array(w * h);
  const histogram = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) { const v = Math.round(pixels[i*4]!*.299 + pixels[i*4+1]!*.587 + pixels[i*4+2]!*.114); gray[i] = v; histogram[v]!++; }
  let sum = 0; for (let i=0;i<256;i++) sum += i * histogram[i]!;
  let count = 0, lowSum = 0, best = 0, threshold = 128;
  for (let i=0;i<255;i++) { count += histogram[i]!; lowSum += i*histogram[i]!; if (!count || count === gray.length) continue; const delta = lowSum/count - (sum-lowSum)/(gray.length-count); const score = count*(gray.length-count)*delta*delta; if(score > best) {best=score;threshold=i;} }
  if (!best) return null;
  const visited = new Uint8Array(gray.length), queue = new Int32Array(gray.length);
  let largest: number[] = [];
  for(let seed=0;seed<gray.length;seed++) {
    if(visited[seed] || gray[seed]! <= threshold) continue;
    let head=0, tail=1;queue[0]=seed;visited[seed]=1;
    while(head<tail) { const at=queue[head++]!, x=at%w; for(const next of [x>0?at-1:-1,x<w-1?at+1:-1,at-w,at+w]) {if(next<0||next>=gray.length||visited[next]||gray[next]!<=threshold)continue;visited[next]=1;queue[tail++]=next;} }
    if(tail>largest.length) largest=Array.from(queue.subarray(0,tail));
  }
  if(largest.length < w*h*.18 || largest.length > w*h*.94) return null;
  const extreme = (score: (x:number,y:number)=>number) => {let best=-Infinity, result={x:0,y:0};for(const at of largest){const x=at%w,y=Math.floor(at/w),s=score(x,y);if(s>best){best=s;result={x:x/(w-1),y:y/(h-1)};}}return result;};
  const points=[extreme((x,y)=>-x-y),extreme((x,y)=>x-y),extreme((x,y)=>x+y),extreme((x,y)=>y-x)];
  return validCorners(points) ? points : null;
}
