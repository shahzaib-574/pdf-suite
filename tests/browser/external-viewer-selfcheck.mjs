import {chromium} from 'playwright-core';
import {PDFDocument} from 'pdf-lib';
import assert from 'node:assert/strict';
const pdf=await PDFDocument.create();pdf.addPage().drawText('External PDF loading test',{x:40,y:600});const bytes=[...await pdf.save()];
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:412,height:915}});
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
 await page.waitForFunction(()=>document.querySelector('.ps-reader-page__surface img')?.naturalWidth>0);
 await page.evaluate(()=>window.externalTest.start());await page.getByText('Loading shared PDF…',{exact:true}).waitFor();
 await page.evaluate(()=>window.externalTest.error('Shared file is unavailable.'));
 await page.getByText('Shared file is unavailable.',{exact:true}).waitFor();assert.equal(new URL(page.url()).hash,'#/viewer');
 await page.evaluate(()=>window.externalTest.start());await page.getByText('Loading shared PDF…',{exact:true}).waitFor();
 await page.evaluate(()=>{location.hash='/';});await page.waitForFunction(()=>location.hash==='#/');
 await page.evaluate(bytes=>window.externalTest.files([{name:'Later.pdf',mime:'application/pdf',bytes:new Uint8Array(bytes)}]),bytes);
 assert.equal(new URL(page.url()).hash,'#/','Completing an import must not pull the user back into the reader');
 console.log('PASS early viewer, delayed bytes, replacement PDF, reader error, and navigation away during import');
}finally{await browser.close();}
