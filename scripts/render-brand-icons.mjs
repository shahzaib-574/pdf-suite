import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const svg=await readFile('public/ream-icon.svg','utf8');
const paths=[...svg.matchAll(/<path d="([^"]+)"/g)].map(match=>match[1]);
if(paths.length!==6)throw new Error('Unexpected logo path count');
const header='<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="768" android:viewportHeight="768"><group android:translateX="128" android:translateY="128">';
const bracket=`<path android:pathData="${paths[0]}" android:fillColor="#00000000" android:strokeColor="#FFFFFFFF" android:strokeWidth="22" android:strokeLineCap="round"/>`;
const body=`<path android:pathData="${paths[1]}" android:fillColor="#FFFFFFFF"/>`;
const vector=header+bracket+body+`<path android:pathData="${paths[2]}" android:fillColor="#FFD9CAFF"/>`+paths.slice(3).map(path=>`<path android:pathData="${path}" android:fillColor="#FF6333ED" android:fillType="evenOdd"/>`).join('')+'</group></vector>';
await writeFile('android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml',vector);
await writeFile('android/app/src/main/res/drawable/ic_launcher_monochrome.xml',header+bracket+body+'</group></vector>');
await writeFile('android/app/src/main/res/values/ic_launcher_background.xml','<?xml version="1.0" encoding="utf-8"?><resources><color name="ic_launcher_background">#6333ED</color></resources>');
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({deviceScaleFactor:1});
 for(const [density,size] of [['mdpi',48],['hdpi',72],['xhdpi',96],['xxhdpi',144],['xxxhdpi',192]]) {
  await page.setViewportSize({width:size,height:size});await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${svg}`);
  const png=await page.screenshot({omitBackground:true});
  for(const name of ['ic_launcher','ic_launcher_round'])await writeFile(`android/app/src/main/res/mipmap-${density}/${name}.png`,png);
 }
 for(const size of [192,512]) {
  await page.setViewportSize({width:size,height:size});await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${svg}`);
  await page.screenshot({path:`public/ream-icon-${size}.png`,omitBackground:true});
 }
}finally{await browser.close();}
console.log('Rendered Ream web and Android launcher icons');
