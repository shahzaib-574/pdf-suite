import {chromium} from 'playwright-core';
import JSZip from 'jszip';
import assert from 'node:assert/strict';
const zip=new JSZip();
zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Research reference</w:t><w:footnoteReference w:id="1"/></w:r></w:p><w:p><w:r><w:t>End reference</w:t><w:endnoteReference w:id="2"/></w:r></w:p></w:body></w:document>');
zip.file('word/footnotes.xml','<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:footnote w:id="1"><w:p><w:r><w:t>Footnote source retained</w:t></w:r></w:p></w:footnote></w:footnotes>');
zip.file('word/endnotes.xml','<w:endnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:endnote w:id="2"><w:p><w:r><w:t>Endnote source retained</w:t></w:r></w:p></w:endnote></w:endnotes>');
zip.file('word/header1.xml','<w:hdr/>');
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5173');
 const result=await page.evaluate(async bytes=>{
   const {docxToPdf,inspectDocx}=await import('/src/pdf/docxToPdf.ts');
   const {engine}=await import('/src/pdf/index.ts');
   const file={name:'notes.docx',mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',bytes:new Uint8Array(bytes)};
   const warnings=await inspectDocx(file);const result=await docxToPdf(file);if(!result.ok)throw new Error(result.message);
   let done;const indexed=new Promise(resolve=>{done=resolve;});
   const session=await engine.openViewer({...file,name:'notes.pdf',mime:'application/pdf',bytes:result.bytes},(current,total)=>{if(current===total)done();});
   await indexed;const text=session.document.pages.map(page=>page.text).join(' ');await session.destroy();
   const {clusterLines}=await import('/src/pdf/textLayout.ts');
   const rtl=clusterLines([{str:'پاکستان',x:140,y:500,width:80,size:14,direction:'rtl'},{str:'زندہ',x:95,y:500,width:40,size:14,direction:'rtl'},{str:'باد',x:60,y:500,width:30,size:14,direction:'rtl'}])[0];
   return {text,warnings,report:result.extra?.wordToPdf,rtl:rtl.text};
 },[...await zip.generateAsync({type:'uint8array'})]);
 for(const text of ['[F1]','[E2]','Footnote source retained','Endnote source retained'])assert.ok(result.text.includes(text),text);
 assert.ok(result.warnings.some(w=>w.includes('Headers and footers')));assert.ok(result.report.warnings.some(w=>w.includes('numbered notes')));
 assert.equal(result.rtl,'پاکستان زندہ باد');
 console.log('PASS notes preserved, compatibility warnings, RTL logical word order');
 for(const language of ['urd+eng','ara+eng']) {
   const output=await page.evaluate(async language=>{
     const {createOcrSession}=await import('/src/pdf/ocr.ts');
     const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=650;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1200,650);ctx.fillStyle='black';ctx.font='52px Arial';ctx.direction='rtl';ctx.textAlign='right';for(let y=100;y<620;y+=90)ctx.fillText(language==='urd+eng'?'پاکستان ایک خوبصورت ملک ہے':'اللغة العربية لغة جميلة',1120,y);
     const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
     const session=await createOcrSession(undefined,language);
     try {const result=await session.recognize(blob,1,650);return {text:result.text,confidence:result.confidence};}finally{await session.terminate();}
   },language);
   assert.match(output.text,/[\u0600-\u06ff]/);
   console.log(`${language}: recognized Arabic-script text; confidence ${output.confidence}`);
 }
} finally {await browser.close();}
