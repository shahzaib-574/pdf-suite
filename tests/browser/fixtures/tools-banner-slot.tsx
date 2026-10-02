import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ToolsBannerSlotView } from '../../../src/ads/ToolsBannerSlot';
import { createInlineBannerController } from '../../../src/ads/inlineBannerController';
import type { BannerState, Geometry, ToolsBannerPlugin } from '../../../src/ads/inlineBanner';
import '../../../src/index.css';
import '../../../src/screens/screens.css';

class FixtureBridge implements ToolsBannerPlugin {
  prepareCalls=0; destroyCalls=0; next=1; generation=0; ack=true; geometry:Geometry[]=[];
  listeners=new Set<(s:BannerState)=>void>(); slow=false; pending:(()=>void)[]=[];
  async getCapabilities(){return {protocol:1 as const,supported:true,mode:'android-debug' as const,canRequest:true,nextGeneration:this.next++};}
  async prepare(o:{generation:number}){this.generation=o.generation;this.prepareCalls++;}
  async hide(){this.emit('hidden');}
  async destroy(){this.destroyCalls++;}
  async updateGeometry(g:Geometry){this.geometry.push(g);if(this.slow)await new Promise<void>(resolve=>this.pending.push(resolve));if(this.ack)this.emit('visible',g.sequence);return {accepted:this.ack,sequence:g.sequence};}
  async addListener(_:'stateChanged',fn:(s:BannerState)=>void){this.listeners.add(fn);return {remove:async()=>{this.listeners.delete(fn);}};}
  height=80;
  emit(status:BannerState['status'],sequence?:number,generation=this.generation,reason?:string){for(const fn of this.listeners)fn({generation,status,sequence,reason,widthPx:300,heightPx:this.height,widthCss:300,heightCss:this.height});}
}
let root:Root|undefined,bridge=new FixtureBridge(),eligible=true,strict=false;
let states:BannerState[]=[];
const factory=(onState:(s:BannerState)=>void)=>createInlineBannerController(bridge,()=>0,s=>{states.push(s);onState(s);});
function render(){const node=<div className="ps-home" style={{width:360,margin:20}}><p>Fixture — mocked bridge, not a real ad</p><div id="position-shift"/><ToolsBannerSlotView eligible={eligible} createController={factory}/><button>Underlying tool</button><div style={{height:1500}}/></div>;root?.render(strict?<StrictMode>{node}</StrictMode>:node);}
export function shiftPosition(){document.getElementById('position-shift')!.style.height='60px';}
export function resizeFixture(){document.getElementById('position-shift')!.parentElement!.style.width='320px';}
export async function seedHomeRecents(){const {saveRecent}=await import('../../../src/store/recents');for(let i=1;i<=3;i++)await saveRecent({name:`Local placement sample ${i}.txt`,mime:'text/plain',tool:'view',bytes:new TextEncoder().encode('Local mock placement test')});window.dispatchEvent(new Event('ream-library-changed'));}
export function mountFixture(options:{eligible:boolean;strictMode:boolean}){root?.unmount();bridge=new FixtureBridge();states=[];eligible=options.eligible;strict=options.strictMode;root=createRoot(document.getElementById('fixture')!);render();}
export function setEligible(value:boolean){eligible=value;render();}
export function emitMeasured(heightCss:number){bridge.height=heightCss;bridge.emit('measured');}
export function emitFailure(reason:string){bridge.emit('failed',undefined,bridge.generation,reason);}
export function emitRetired(){bridge.emit('measured',undefined,bridge.generation-1);}
export function setAckEnabled(value:boolean){bridge.ack=value;}
export function setSlowAck(value:boolean){bridge.slow=value;}
export function resolveAcksReverse(){for(const resolve of bridge.pending.splice(0).reverse())resolve();}
export function readTrace(){return {prepareCalls:bridge.prepareCalls,geometry:bridge.geometry,destroyCalls:bridge.destroyCalls,listeners:bridge.listeners.size,states,generation:bridge.generation};}
export function unmountFixture(){root?.unmount();root=undefined;}
