import {chromium} from 'playwright-core';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import JSZip from 'jszip';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5173');
 const image=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=40;canvas.height=40;const ctx=canvas.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,40,40);return canvas.toDataURL().split(',')[1];});
 const pdf=await PDFDocument.create();const normal=await pdf.embedFont(StandardFonts.TimesRoman),bold=await pdf.embedFont(StandardFonts.TimesRomanBold),italic=await pdf.embedFont(StandardFonts.TimesRomanItalic);
 const sheet=pdf.addPage([600,800]);
 sheet.drawText('Conversion fidelity fixture',{x:40,y:760,font:bold,size:18});
 for(const x of [40,260,450])sheet.drawLine({start:{x,y:560},end:{x,y:720},thickness:.5,color:rgb(0,0,0)});
 for(const y of [720,680,600,560])sheet.drawLine({start:{x:40,y},end:{x:450,y},thickness:.5,color:rgb(0,0,0)});
 for(const [text,x,y,font,size] of [['Item',50,700,bold,14],['Amount',275,700,bold,14],['First line',50,650,italic,12],['Second line',50,630,normal,12],['125.00',275,650,normal,12],['900.00',275,575,normal,12]])sheet.drawText(text,{x,y,font,size});
 sheet.drawImage(await pdf.embedPng(Buffer.from(image,'base64')),{x:40,y:440,width:40,height:40});
 const source=await pdf.save();
 const result=await page.evaluate(async bytes=>{const {engine}=await import('/src/pdf/index.ts');const result=await engine.pdfToDocx({name:'fidelity.pdf',mime:'application/pdf',bytes:new Uint8Array(bytes)});if(!result.ok)throw new Error(result.message);return {bytes:[...result.bytes],report:result.extra.pdfToDocx};},[...source]);
 const zip=await JSZip.loadAsync(new Uint8Array(result.bytes));const xml=await zip.file('word/document.xml').async('string');
 assert.ok(xml.includes('First line'));assert.ok(xml.includes('Second line'));assert.ok(xml.includes('<w:i/>'));assert.ok(xml.includes('<w:sz w:val="28"/>'));
 assert.ok(xml.includes('<w:trHeight w:val="1600" w:hRule="atLeast"/>'),'Source row geometry must survive PDF extraction');
 assert.equal(result.report.tables,1);assert.equal(result.report.imageOnlyPages,0);assert.ok(Object.keys(zip.files).some(path=>path.startsWith('word/media/')&&!zip.files[path].dir));
 await mkdir('tmp/pdf-word-fidelity',{recursive:true});await writeFile('tmp/pdf-word-fidelity/source.pdf',source);await writeFile('tmp/pdf-word-fidelity/converted.docx',new Uint8Array(result.bytes));
 console.log('PASS actual PDF → editable DOCX: styled table, multiline row geometry, header size, italics and embedded image');
}finally{await browser.close();}

