import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage({viewport:{width:412,height:915}});
  await page.goto('http://127.0.0.1:5173/#/tool/scan');
  const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=800;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,600,800);ctx.fillStyle='#222';ctx.font='30px Arial';ctx.fillText('Adjust any edge',100,120);return c.toDataURL().split(',')[1];});
  await page.locator('.scan-cam input[type=file]').setInputFiles({name:'edges.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')});
  await page.getByRole('heading',{name:'Crop and Edit',exact:true}).waitFor();
  assert.equal(await page.locator('.ps-scan-edge').count(),4);
  assert.equal(await page.locator('.ps-scan-corner').count(),4);
  const points=()=>page.locator('.ps-scan-editor__image polygon').evaluate(el=>el.getAttribute('points').split(' ').map(pair=>pair.split(',').map(Number)));
  for(const [side,key,axis,a,b] of [['Top','ArrowDown',1,0,1],['Right','ArrowLeft',0,1,2],['Bottom','ArrowUp',1,2,3],['Left','ArrowRight',0,3,0]]) {
    const before=await points();await page.getByRole('button',{name:`${side} edge: drag or use arrow keys to adjust`,exact:true}).press(key);
    const after=await points();const shift=after[a][axis]-before[a][axis];assert.ok(Math.abs(shift)>0);
    assert.ok(Math.abs(after[b][axis]-before[b][axis]-shift)<.0001);
    for(let i=0;i<4;i++)if(i!==a&&i!==b)assert.deepEqual(after[i],before[i]);
  }
  const drag=async(side,dx,dy)=>{const handle=page.getByRole('button',{name:`${side} edge: drag or use arrow keys to adjust`,exact:true});const box=await handle.boundingBox();assert.ok(box.width>=44&&box.height>=44);const x=box.x+box.width/2,y=box.y+box.height/2;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:6});await page.mouse.up();};
  const before=await points();await drag('Top',0,40);const after=await points();assert.ok(after[0][1]>before[0][1]);assert.ok(Math.abs((after[0][1]-before[0][1])-(after[1][1]-before[1][1]))<.001);
  await page.getByRole('button',{name:'Rotate right',exact:true}).click();
  await page.waitForTimeout(350);
  const rotated=await points();await drag('Right',-30,0);assert.ok((await points())[0][1]>rotated[0][1]);
  const validity=await page.evaluate(async()=>{const {moveScanEdge,validCorners}=await import('/src/pdf/scanGeometry.ts');const points=[{x:.1,y:.1},{x:.9,y:.2},{x:.8,y:.9},{x:.2,y:.8}];return [-100,100].every(delta=>[0,1,2,3].every(edge=>{const result=moveScanEdge(points,edge,delta);return validCorners(result)&&result.every(p=>p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1);}));});
  assert.ok(validity,'Edges must remain inside the image without crossing');
  await mkdir('tmp/browser-qa',{recursive:true});await page.screenshot({path:'tmp/browser-qa/scan-edge-handles.png',animations:'disabled'});
  await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByRole('textbox',{name:'PDF name'}).waitFor();
  console.log('PASS four midpoint handles, paired endpoints, opposite edges unchanged, pointer drag, rotated drag, crop bounds and Next');
} finally {await browser.close();}
