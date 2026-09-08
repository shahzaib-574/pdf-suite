import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:412,height:915},reducedMotion:'reduce'});
 let release;const gate=new Promise(resolve=>{release=resolve;});
 await page.route('**/src/main.tsx*',async route=>{await gate;await route.continue();});
 await page.goto('http://localhost:5173/',{waitUntil:'commit'});
 await page.getByRole('status',{name:'Opening Ream'}).waitFor();
 await page.waitForFunction(()=>document.querySelector('#app-boot img')?.naturalWidth>0);
 assert.equal(await page.locator('.app-boot-track').evaluate(el=>getComputedStyle(el,'::after').animationName),'none');
 await mkdir('tmp/browser-qa',{recursive:true});await page.screenshot({path:'tmp/browser-qa/ream-opening.png'});
 release();await page.locator('#app-boot').waitFor({state:'detached'});
 await page.getByRole('heading',{name:'All tools',exact:true}).waitFor();
 assert.equal(await page.locator('.shell__mark').evaluate(async img=>(await fetch(img.src)).ok),true);
 const merge=page.getByRole('button',{name:'Merge Combine PDFs into one file'});await merge.scrollIntoViewIfNeeded();
 assert.equal(await merge.locator('svg.lucide-tool-merge').count(),1);
 assert.equal(await page.locator('svg.lucide-tool-split').count(),1);
 await page.screenshot({path:'tmp/browser-qa/ream-tool-icons.png'});
 await merge.click();assert.equal(new URL(page.url()).hash,'#/tool/merge');
 console.log('PASS branded pre-bundle loader, reduced motion, immediate dismissal, new tool icons and merge navigation');
}finally{await browser.close();}
