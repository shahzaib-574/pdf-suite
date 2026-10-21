import {chromium} from 'playwright-core';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import assert from 'node:assert/strict';
const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);pdf.addPage().drawText('Password protected conversion test',{x:40,y:650,size:16,font});const bytes=await pdf.save();
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:412,height:915}});await page.goto('http://localhost:5173/#/tool/pdf-docx');
 const protectedBytes=await page.evaluate(async bytes=>{const {protectPdf}=await import('/src/pdf/protectPdf.ts');return [...await protectPdf(new Uint8Array(bytes),' secret ')];},[...bytes]);
 const payload={name:'locked.pdf',mimeType:'application/pdf',buffer:Buffer.from(protectedBytes)};
 await page.locator('input[type=file]').setInputFiles(payload);
 await page.getByLabel('Document password',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Convert to Word',exact:true}).isDisabled(),true);
 await page.getByLabel('Document password',{exact:true}).fill('wrong');await page.getByRole('button',{name:'Unlock PDF',exact:true}).click();
 await page.getByText('That password was incorrect. Try again.',{exact:true}).waitFor();
 await page.getByLabel('Document password',{exact:true}).fill(' secret ');await page.getByRole('button',{name:'Unlock PDF',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('form[aria-label="Unlock PDF"]'));
 await page.getByRole('button',{name:'Convert to Word',exact:true}).click();
 await page.getByRole('button',{name:'Save Word file',exact:true}).waitFor();
 await page.goto('http://localhost:5173/#/tool/pdf-docx');await page.locator('input[type=file]').setInputFiles(payload);await page.getByLabel('Document password',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await page.getByLabel('Document password',{exact:true}).count(),0);
 await page.locator('input[type=file]').setInputFiles({name:'plain.pdf',mimeType:'application/pdf',buffer:Buffer.from(bytes)});
 await page.getByRole('button',{name:'Convert to Word',exact:true}).click();await page.getByRole('button',{name:'Save Word file',exact:true}).waitFor();
 // A PDF unlocked in the Viewer must stay usable in the pdf-lib tools it opens.
 const twoPages=await PDFDocument.create();twoPages.addPage();twoPages.addPage();
 const lockedTwo=await page.evaluate(async bytes=>{const {protectPdf}=await import('/src/pdf/protectPdf.ts');return [...await protectPdf(new Uint8Array(bytes),'viewer-pass')];},[...await twoPages.save()]);
 const openLockedInViewer=async()=>{
  await page.goto('http://localhost:5173/');
  await page.evaluate(async bytes=>{const {setCurrentViewer}=await import('/src/store/lastJob.ts');setCurrentViewer(new Uint8Array(bytes),'viewer-locked.pdf');location.hash='/viewer';},lockedTwo);
  await page.getByLabel('Document password',{exact:true}).fill('viewer-pass');await page.getByRole('button',{name:'Open PDF',exact:true}).click();
  await page.waitForSelector('.ps-reader-dock');
 };
 await openLockedInViewer();
 await page.locator('.ps-reader-dock').getByRole('button',{name:'Organize',exact:true}).click();
 await page.waitForSelector('.ps-organize-card');
 await page.locator('.ps-organize-number').first().waitFor();await page.getByRole('button',{name:'Organize',exact:true}).click();
 await page.waitForURL(/#\/result/);
 await openLockedInViewer();
 await page.locator('.ps-reader-dock').getByRole('button',{name:'Add',exact:true}).click();
 await page.locator('input[type=file]').first().setInputFiles({name:'plain.pdf',mimeType:'application/pdf',buffer:Buffer.from(bytes)});
 await page.getByRole('button',{name:'Merge PDFs',exact:true}).click();
 await page.waitForURL(/#\/result/);
 console.log('PASS detection, wrong-password retry, whitespace-preserving unlock and conversion, cancel, unprotected PDF, and viewer-unlocked organize/merge');
}finally{await browser.close();}
