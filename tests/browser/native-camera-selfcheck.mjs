import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({channel:'chrome', headless:true});
const base = process.env.REAM_TEST_URL || 'http://localhost:5180';
try {
  const page = await browser.newPage();
  await page.goto(base);
  const result = await page.evaluate(async () => {
    const { engine } = await import('/src/pdf/index.ts');
    const { jpegOrientation } = await import('/src/pdf/jpegOrientation.ts');
    const { applyScanEdit } = await import('/src/pdf/scanProcess.ts');
    const pdfjs = await import('/node_modules/pdfjs-dist/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.mjs';
    const canvas = new OffscreenCanvas(120,80), ctx = canvas.getContext('2d');
    for (const [color,x,y] of [['#ff0000',0,0],['#00ff00',60,0],['#0000ff',0,40],['#ffff00',60,40]]) {ctx.fillStyle=color;ctx.fillRect(x,y,60,40);}
    const original = new Uint8Array(await (await canvas.convertToBlob({type:'image/jpeg',quality:1})).arrayBuffer());
    const samples = [];
    for (let orientation = 1; orientation <= 8; orientation++) {
      const exif = new Uint8Array([255,225,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,orientation,0,0,0,0,0,0,0]);
      const jpeg = new Uint8Array(original.length + exif.length); jpeg.set(original.subarray(0,2));jpeg.set(exif,2);jpeg.set(original.subarray(2),2+exif.length);
      if (jpegOrientation(jpeg) !== orientation) throw new Error('EXIF orientation parsing failed');
      const converted = await engine.imagesToPdf([{name:'native.jpg',mime:'image/jpeg',bytes:jpeg}],{size:'original',margin:0,landscape:false});
      if (!converted.ok) throw new Error(converted.message);
      const loading = pdfjs.getDocument({data:converted.bytes.slice()}); const document = await loading.promise;
      const pdfPage = await document.getPage(1), viewport = pdfPage.getViewport({scale:2});
      const output = new OffscreenCanvas(Math.round(viewport.width),Math.round(viewport.height));
      await pdfPage.render({canvas:output,viewport}).promise;
      const bitmap = await createImageBitmap(new Blob([jpeg],{type:'image/jpeg'}));
      const reference = new OffscreenCanvas(bitmap.width,bitmap.height); reference.getContext('2d').drawImage(bitmap,0,0); bitmap.close();
      for (const [u,v] of [[.25,.25],[.75,.25],[.25,.75],[.75,.75]]) {
        const actual=output.getContext('2d').getImageData(Math.floor(u*output.width),Math.floor(v*output.height),1,1).data;
        const expected=reference.getContext('2d').getImageData(Math.floor(u*reference.width),Math.floor(v*reference.height),1,1).data;
        if ([0,1,2].some(c=>Math.abs(actual[c]-expected[c])>12)) throw new Error(`PDF color/orientation differs from camera display: EXIF ${orientation}`);
      }
      if (Math.abs(output.width/output.height-reference.width/reference.height)>.01) throw new Error('Wrong page orientation');
      samples.push(orientation); await loading.destroy();
    }
    // Native photos above the old 3200px cap must retain detail through editing.
    const large = new OffscreenCanvas(4000,1000); const context=large.getContext('2d');context.fillStyle='#27a6db';context.fillRect(0,0,4000,1000);
    const bytes=await (await large.convertToBlob({type:'image/png'})).arrayBuffer();
    const edited=await applyScanEdit(bytes,'image/png',{corners:[{x:.02,y:.02},{x:.98,y:.02},{x:.98,y:.98},{x:.02,y:.98}],mode:'color',rotate:0});
    const bitmap=await createImageBitmap(new Blob([edited],{type:'image/png'})); const dimensions=[bitmap.width,bitmap.height];bitmap.close();
    if(dimensions[0]<3800)throw new Error('Native detail was downsampled');
    // Malformed EXIF must safely default, never read outside the JPEG segment.
    for(let length=0;length<40;length++) jpegOrientation(new Uint8Array([255,216,255,225,0,34,...new Array(length).fill(0)]));
    return {orientations:samples,editedDimensions:dimensions};
  });
  assert.equal(result.orientations.length,8); console.log('PASS full-resolution crop, all eight EXIF orientations and PDF color alignment:',result);

  const native = await browser.newPage({viewport:{width:412,height:915}});
  await native.route('**/src/store/documentCamera.ts*', route => route.fulfill({contentType:'text/javascript',body:`
    export function nativeDocumentCameraAvailable(){return true;}
    let pending;
    export function captureNativeDocument(){return pending??=new Promise(resolve=>{window.resolveCamera=resolve;});}
  `}));
  await native.goto(base + '/#/tool/scan');
  await native.waitForFunction(()=>window.resolveCamera);
  await native.evaluate(async()=>{
    const c=new OffscreenCanvas(400,600);c.getContext('2d').fillRect(0,0,400,600);
    window.resolveCamera({name:'Native.jpg',mime:'image/png',bytes:new Uint8Array(await (await c.convertToBlob()).arrayBuffer()),scanCorners:[{x:.1,y:.1},{x:.9,y:.1},{x:.9,y:.9},{x:.1,y:.9}]});
  });
  await native.getByRole('button',{name:'Next',exact:true}).waitFor();
  const polygon = await native.locator('.ps-scan-editor__image svg polygon').first().getAttribute('points');
  assert.equal(polygon,'10,10 90,10 90,90 10,90');
  await native.getByRole('button',{name:'Next',exact:true}).click();
  await native.getByRole('textbox',{name:'PDF name'}).waitFor();
  console.log('PASS native-camera bridge result enters crop review with detected corners and completes to PDF preview.');
  const denied = await browser.newPage();
  await denied.route('**/src/store/documentCamera.ts*', route => route.fulfill({contentType:'text/javascript',body:`
    export function nativeDocumentCameraAvailable(){return true;}
    export async function captureNativeDocument(){throw new Error('Camera permission was denied.');}
  `}));
  await denied.goto(base + '/#/tool/scan');
  await denied.getByRole('alert').filter({hasText:'Camera permission was denied.'}).waitFor();
  assert.ok(await denied.getByRole('button',{name:'Choose from gallery',exact:true}).isEnabled());
  await denied.getByRole('button',{name:'Back to scan',exact:true}).click();
  await denied.waitForURL('**/#/');
  console.log('PASS permission denial leaves gallery/retry available and returns safely to home.');
} finally {await browser.close();}
