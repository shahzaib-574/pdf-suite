import assert from 'node:assert/strict';
import { createInlineBannerController } from '../src/ads/inlineBannerController.ts';
import type { BannerState, Geometry, ToolsBannerPlugin } from '../src/ads/inlineBanner.ts';
import { shouldShowToolsBanner } from '../src/ads/policy.ts';

class Bridge implements ToolsBannerPlugin {
  next=1; prepares=0; destroys=0; hidden=0; listeners=new Set<(s:BannerState)=>void>(); unavailable=false; rejectCleanup=false; ack=true;
  async getCapabilities(){return {protocol:1 as const,supported:!this.unavailable,mode:this.unavailable?'disabled' as const:'android-debug' as const,canRequest:!this.unavailable,nextGeneration:this.next++};}
  async prepare(){this.prepares++;}
  async updateGeometry(g:Geometry){return {accepted:this.ack,sequence:g.sequence};}
  async hide(){this.hidden++;}
  async destroy(){this.destroys++;if(this.rejectCleanup)throw new Error('cleanup');}
  async addListener(_:'stateChanged',callback:(s:BannerState)=>void){this.listeners.add(callback);return {remove:async()=>{this.listeners.delete(callback);}};}
  emit(generation:number,status:BannerState['status'],reason?:string,sequence?:number){for(const cb of this.listeners)cb({generation,status,reason,sequence,widthPx:320,heightPx:80,widthCss:319.1,heightCss:80});}
}
const enter={widthCss:320,layoutWidth:412,eligible:true};
function geometry(generation:number,sequence:number):Geometry {return {generation,sequence,slot:{x:10,y:20,width:320,height:105},creative:{x:10.45,y:45,width:319.1,height:80},scrollX:0,scrollY:0,layoutWidth:412,layoutHeight:915,visual:{offsetLeft:0,offsetTop:0,width:412,height:915,scale:1},occlusions:[],reservedHeight:105,eligible:true};}

{ const b=new Bridge();b.unavailable=true;let state:BannerState|undefined;const c=createInlineBannerController(b,()=>0,s=>state=s);await c.enter(enter);assert.equal(b.prepares,0);assert.equal(state?.heightCss,0);await c.dispose(); }
{ const b=new Bridge();let state:BannerState|undefined;const c=createInlineBannerController(b,()=>0,s=>state=s);await c.enter(enter);b.emit(1,'measured');for(let i=1;i<=100;i++)await c.update(geometry(1,i));assert.equal(b.prepares,1);assert.notEqual(state?.status,'visible','mapping ack alone is not actual visibility');b.emit(1,'visible',undefined,100);assert.equal(state?.status,'visible');b.emit(1,'hidden','offscreen',100);assert.equal(state?.heightCss,80);await c.leave();b.emit(1,'measured');assert.equal(state?.heightCss,0);assert.equal(b.listeners.size,0); }
{ const b=new Bridge();let now=0;const c=createInlineBannerController(b,()=>now,()=>{});await c.enter(enter);b.emit(1,'failed','ad-load-3');await c.leave();now=59999;await c.enter(enter);assert.equal(b.prepares,1);now=60000;await c.enter(enter);assert.equal(b.prepares,2);await c.dispose(); }
{ const b=new Bridge();let state:BannerState|undefined;const c=createInlineBannerController(b,()=>0,s=>state=s);await c.enter(enter);b.emit(1,'measured');await c.update(geometry(1,1));await c.enter({...enter,widthCss:280});assert.equal(b.prepares,2);await c.enter({...enter,widthCss:280});assert.equal(b.prepares,2);b.emit(1,'visible',undefined,99);assert.notEqual(state?.status,'visible');await c.dispose();assert.equal(b.listeners.size,0); }
{ const b=new Bridge();const c=createInlineBannerController(b,()=>0,()=>{});await c.enter(enter);b.rejectCleanup=true;await assert.rejects(c.leave(),/cleanup/);await c.enter(enter);assert.equal(b.prepares,1,'failed native cleanup disables owner');await assert.rejects(c.dispose(),/cleanup/); }
{ const b=new Bridge();const a=createInlineBannerController(b,()=>0,()=>{}),c=createInlineBannerController(b,()=>0,()=>{});await a.enter(enter);await a.dispose();await c.enter(enter);assert.equal(b.next,3,'native generations allocated across controller lifetime');await c.dispose(); }
{ const b=new Bridge();let state:BannerState|undefined;const c=createInlineBannerController(b,()=>0,s=>state=s);await c.enter(enter);b.emit(1,'measured');await c.update(geometry(1,1));b.emit(1,'visible',undefined,1);await c.update(geometry(1,2));b.emit(1,'hidden','offscreen',2);b.emit(1,'visible',undefined,1);assert.equal(state?.status,'hidden','old same-generation visibility must not undo newer hidden state');await c.dispose(); }
for(const name of ['recents','settings','viewer','result'] as const)assert.equal(shouldShowToolsBanner({name},false,false),false);
assert.equal(shouldShowToolsBanner({name:'tool',id:'merge'},false,false),false);
assert.equal(shouldShowToolsBanner({name:'home'},false,false),true);
assert.equal(shouldShowToolsBanner({name:'home'},true,false),false);
assert.equal(shouldShowToolsBanner({name:'home'},false,true),false);
console.log('INLINE_BANNER_SELFCHECK_OK policy capability generation visibility nofill cleanup scroll-width');
