import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage({viewport:{width:412,height:915}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:5173/#/tool/scan');
  const data=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=2600;canvas.height=1900;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#303030';ctx.fillRect(0,0,2600,1900);ctx.fillStyle='#fafafa';ctx.fillRect(300,180,1900,1500);ctx.fillStyle='#222';ctx.font='64px Arial';for(let y=320;y<1550;y+=110)ctx.fillText('Quality test document',430,y);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const payload=[1,2].map(i=>({name:`paper-${i}.png`,mimeType:'image/png',buffer:Buffer.from(data,'base64')}));
  await page.locator('.scan-cam input[type=file]').setInputFiles(payload);
  await page.getByRole('heading',{name:'Crop and Edit',exact:true}).waitFor();
  async function revealPageActions(){
    if(await page.getByRole('button',{name:'Auto crop',exact:true}).count())return;
    const box=await page.locator('.scan-edit__slide[aria-hidden="false"] img').boundingBox();
    await page.mouse.click(box.x+box.width*0.5,box.y+box.height*0.4);
    await page.getByRole('button',{name:'Auto crop',exact:true}).waitFor();
  }
  await revealPageActions();
  await page.getByRole('button',{name:'Auto crop',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.ps-scan-editor__image polygon')?.getAttribute('points')!=='0,0 100,0 100,100 0,100');
  await page.getByRole('radio',{name:'Black and white',exact:true}).click();
  await page.getByRole('button',{name:'Rotate right',exact:true}).click();
  await page.getByRole('button',{name:'Move later',exact:true}).click();
  await page.waitForFunction(async()=>{
    const {loadScanDraft}=await import('/src/store/scanDraft.ts');const draft=await loadScanDraft();return draft?.files[1]?.name==='paper-1.png'&&draft?.edits[1]?.mode==='bw'&&draft.edits[1].rotation===90;
  });
  await page.reload();
  await page.getByRole('heading',{name:'Crop and Edit',exact:true}).waitFor();
  await page.getByRole('button',{name:'Edit page 2',exact:true}).click();
  assert.equal(await page.locator('.scan-edit__filters [aria-checked="true"]').getAttribute('data-mode'),'bw');
  assert.equal(await page.locator('.ps-scan-editor__image').nth(1).evaluate(el=>el.style.transform),'rotate(90deg)');
  await mkdir('tmp/browser-qa',{recursive:true});
  for(const width of [320,412,1000]) {
    await page.setViewportSize({width,height:915});
    await page.waitForFunction(()=>Math.abs(document.querySelector('.scan-edit__slide[aria-hidden="false"]').getBoundingClientRect().left-document.querySelector('.scan-edit__carousel').getBoundingClientRect().left)<2);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const toolbar=await page.locator('.scan-edit__toolbar').boundingBox();assert.ok(toolbar.y+toolbar.height<=915);
    await page.screenshot({path:`tmp/browser-qa/scan-quality-${width}.png`,animations:'disabled'});
  }
  await page.setViewportSize({width:412,height:915});
  await revealPageActions();
  await page.getByRole('button',{name:'Retake',exact:true}).click();
  await page.getByRole('button',{name:'Close camera',exact:true}).click();
  assert.equal(await page.locator('.scan-edit__slide img').count(),2,'Cancelling retake must keep the original');
  await revealPageActions();
  await page.getByRole('button',{name:'Retake',exact:true}).click();
  await page.locator('.scan-cam input[type=file]').setInputFiles({...payload[0],name:'retaken.png'});
  await page.getByRole('heading',{name:'Crop and Edit',exact:true}).waitFor();
  await page.getByRole('button',{name:'Edit page 2',exact:true}).click();
  assert.equal(await page.locator('.scan-edit__filters [aria-checked="true"]').getAttribute('data-mode'),'color');
  await page.getByRole('button',{name:'Delete page',exact:true}).click();
  assert.equal(await page.locator('.scan-edit__slide img').count(),1);
  await page.getByRole('button',{name:'Rotate right',exact:true}).click();
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await page.getByRole('textbox',{name:'PDF name'}).fill('Recovered scan');
  await page.waitForFunction(async()=>{const {loadScanDraft}=await import('/src/store/scanDraft.ts');return (await loadScanDraft())?.name==='Recovered scan';});
  const size=await page.evaluate(async()=>{
    const {loadScanDraft}=await import('/src/store/scanDraft.ts');const draft=await loadScanDraft();const file=draft.files[0];const bitmap=await createImageBitmap(new Blob([file.bytes],{type:file.mime}));const size=[bitmap.width,bitmap.height,file.mime,!!file.scanSource];bitmap.close();return size;
  });
  assert.deepEqual(size,[1900,2600,'image/png',true],'Rotation must retain source resolution and original');
  await page.reload();await page.getByRole('textbox',{name:'PDF name'}).waitFor();assert.equal(await page.getByRole('textbox',{name:'PDF name'}).inputValue(),'Recovered scan');
  await page.evaluate(()=>{location.hash='/';});
  await page.getByRole('button',{name:/Resume scan/}).waitFor();
  await mkdir('tmp/browser-qa',{recursive:true});await page.screenshot({path:'tmp/browser-qa/product-home-mobile.png'});
  await page.getByRole('button',{name:/Resume scan/}).click();
  await page.getByRole('textbox',{name:'PDF name'}).waitFor();
  await page.evaluate(async()=>{const {clearScanDraft}=await import('/src/store/scanDraft.ts');await clearScanDraft();});
  assert.deepEqual(errors,[]);
  console.log('PASS automatic crop, cleanup drafts, reorder, reload, cancel/complete retake, delete, lossless full-resolution rotation, save-step recovery and home resume');
} finally {await browser.close();}
