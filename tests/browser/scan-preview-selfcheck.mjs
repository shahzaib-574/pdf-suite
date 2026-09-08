import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage({viewport:{width:412,height:915}});
  await page.goto('http://127.0.0.1:5173/#/tool/scan');
  const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=800;const ctx=c.getContext('2d');ctx.fillStyle='#d02040';ctx.fillRect(0,0,600,800);return c.toDataURL().split(',')[1];});
  await page.locator('.scan-cam input[type=file]').setInputFiles({name:'color.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')});
  await page.getByRole('heading',{name:'Crop and Edit',exact:true}).waitFor();
  const image=page.locator('.scan-edit__slide img').first();
  const pixel=()=>image.evaluate(async img=>{await img.decode();const c=document.createElement('canvas');c.width=1;c.height=1;const ctx=c.getContext('2d');ctx.drawImage(img,0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];});
  const original=await pixel();
  const cleanup={color:'Original color',gray:'Grayscale',bw:'Black and white'};
  async function chooseCleanup(mode){
    await page.getByRole('radio',{name:cleanup[mode],exact:true}).click();
  }
  for(const reload of [false,true]) {
    if(reload){await page.reload();await page.getByRole('heading',{name:'Crop and Edit',exact:true}).waitFor();}
    for(const mode of ['gray','bw','gray']) {
      const before=await image.getAttribute('src');
      await chooseCleanup(mode);
      await page.waitForFunction(before=>{const img=document.querySelector('.scan-edit__slide img');return img.src!==before&&img.complete&&img.naturalWidth>0;},before);
      const cleaned=await pixel();assert.equal(cleaned[0],cleaned[1]);assert.equal(cleaned[1],cleaned[2]);
      await chooseCleanup('color');
      assert.deepEqual(await pixel(),original,'Original color must be readable and unchanged');
      assert.equal(await image.evaluate(async img=>(await fetch(img.src)).ok),true,'Original URL must remain live');
    }
    await chooseCleanup('gray');
    await chooseCleanup('bw');
    await chooseCleanup('color');
    assert.deepEqual(await pixel(),original);
  }
  console.log('PASS grayscale/BW → original, rapid switches and draft reload preserve the original color preview');
} finally {await browser.close();}
