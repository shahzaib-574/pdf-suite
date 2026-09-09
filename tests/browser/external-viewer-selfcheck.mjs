import {chromium} from 'playwright-core';
import {PDFDocument} from 'pdf-lib';
import assert from 'node:assert/strict';
const pdf=await PDFDocument.create();pdf.addPage().drawText('External PDF loading test',{x:40,y:600});const bytes=[...await pdf.save()];
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:412,height:915}});
 page.setDefaultTimeout(30000);
 page.on('pageerror',error=>console.error('Browser error:',error.message));
 // Reproduce older Android WebViews in both the page and PDF worker, even when
 // this regression test runs in a recently updated desktop Chrome.
 const olderWebView = `delete Uint8Array.prototype.toHex;
 delete Uint8Array.prototype.toBase64; delete Uint8Array.fromHex;
 delete Uint8Array.fromBase64; delete Map.prototype.getOrInsertComputed;`;
 await page.addInitScript(olderWebView);
 await page.route('**/*pdf.worker*.mjs*',async route=>{
  // Vite's ?url module runs in the page and only exports the worker asset URL.
  // Removing methods there would remove shims already installed in the page.
  if(route.request().resourceType()!=='script'||new URL(route.request().url()).searchParams.has('url'))return route.continue();
  const response=await route.fetch();
  await route.fulfill({response,body:olderWebView+'\n'+await response.text()});
 });
 await page.route('**/src/store/incoming.ts*',route=>route.fulfill({contentType:'text/javascript',body:`
 export function subscribeIncoming(files,error,start){window.externalTest={files,error,start};return()=>{window.externalTest=null;};}
 export function pickGalleryImages(){return Promise.resolve(null);}
 export function androidGalleryPickerAvailable(){return false;}
 export function fileArrayToFileList(files){const d=new DataTransfer();files.forEach(f=>d.items.add(f));return d.files;}
 `}));
 await page.goto('http://localhost:5173');await page.waitForFunction(()=>window.externalTest);
 await page.evaluate(()=>window.externalTest.start());
 await page.getByText('Loading shared PDF…',{exact:true}).waitFor();assert.equal(new URL(page.url()).hash,'#/viewer');
 assert.equal(await page.locator('.ps-reader-page').count(),0,'Viewer must open before bytes arrive');
 await page.evaluate(bytes=>window.externalTest.files([{name:'External.pdf',mime:'application/pdf',bytes:new Uint8Array(bytes)}]),bytes);
 await page.waitForFunction(()=>document.querySelector('.ps-reader-page__surface img')?.naturalWidth>0).catch(async error=>{
  console.error(await page.locator('body').innerText());throw error;
 });
 await page.waitForFunction(async()=>{const {listRecents}=await import('/src/store/recents.ts');return (await listRecents()).some(item=>item.name==='External.pdf'&&item.stored);});
 await page.evaluate(()=>window.externalTest.start());await page.getByText('Loading shared PDF…',{exact:true}).waitFor();
 await page.evaluate(()=>window.externalTest.error('Shared file is unavailable.'));
 await page.getByText('Shared file is unavailable.',{exact:true}).waitFor();assert.equal(new URL(page.url()).hash,'#/viewer');
 await page.evaluate(()=>window.externalTest.start());await page.getByText('Loading shared PDF…',{exact:true}).waitFor();
 await page.evaluate(()=>{location.hash='/';});await page.waitForFunction(()=>location.hash==='#/');
 await page.evaluate(bytes=>window.externalTest.files([{name:'Later.pdf',mime:'application/pdf',bytes:new Uint8Array(bytes)}]),bytes);
 assert.equal(new URL(page.url()).hash,'#/','Completing an import must not pull the user back into the reader');
 await page.waitForFunction(async()=>{const {listRecents}=await import('/src/store/recents.ts');const names=(await listRecents()).map(item=>item.name);return names.includes('External.pdf')&&names.includes('Later.pdf');});
 console.log('PASS early viewer, delayed bytes, replacement PDF, reader error, and navigation away during import');
}finally{await browser.close();}
