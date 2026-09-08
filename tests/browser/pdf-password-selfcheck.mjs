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
 console.log('PASS detection, wrong-password retry, whitespace-preserving unlock and conversion, cancel, and unprotected PDF');
}finally{await browser.close();}
