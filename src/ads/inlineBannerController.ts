import type { PluginListenerHandle } from '@capacitor/core';
import type { BannerState, EnterOptions, Geometry, ToolsBannerPlugin } from './inlineBanner';

export interface InlineBannerController {
  enter(options:EnterOptions):Promise<void>;
  update(geometry:Geometry):Promise<void>;
  leave():Promise<void>;
  dispose():Promise<void>;
}
const empty = (generation:number,status:BannerState['status'],reason?:string):BannerState => ({generation,status,reason,widthPx:0,heightPx:0,widthCss:0,heightCss:0});

/** Pure owner: generations are allocated by native capabilities, never reset by a JS remount. */
export function createInlineBannerController(bridge:ToolsBannerPlugin,clock:()=>number,onState:(state:BannerState)=>void):InlineBannerController {
  let revision=0,generation=0,width=0,desired=false,preparing=false,disposed=false,cleanupFailed=false;
  let measured=false,acceptedSequence=0,sentSequence=0,visibilitySequence=0,retryAfter=0;
  let listener:PluginListenerHandle|undefined,pendingVisible:BannerState|undefined;
  let retirement:Promise<void>|undefined,entering:Promise<void>|undefined;
  const publish=(state:BannerState)=>onState(state);
  const current=(lease:number,owner:number)=>!disposed&&desired&&revision===lease&&generation===owner;
  const retire=async()=>{
    ++revision;desired=false;preparing=false;measured=false;pendingVisible=undefined;acceptedSequence=0;sentSequence=0;visibilitySequence=0;
    const owned=generation;generation=0;const handle=listener;listener=undefined;
    publish(empty(owned,'destroyed'));
    if(owned>0){try{await bridge.hide({generation:owned});}catch{cleanupFailed=true;}try{await bridge.destroy({generation:owned});}catch{cleanupFailed=true;}}
    try{await handle?.remove();}catch{cleanupFailed=true;}
    if(cleanupFailed)throw new Error('Native banner cleanup incomplete');
  };
  const leave=()=>{if(retirement)return retirement;retirement=retire().finally(()=>{retirement=undefined;});return retirement;};
  const start=async(options:EnterOptions)=>{
    if(disposed||cleanupFailed||!options.eligible||!Number.isFinite(options.widthCss)||options.widthCss<=0||!Number.isFinite(options.layoutWidth)||options.layoutWidth<=0)return;
    if(clock()<retryAfter){publish(empty(0,'failed','retry-backoff'));return;}
    if(desired&&width===options.widthCss)return;
    if(desired||generation>0)await leave();
    const lease=++revision;desired=true;preparing=true;width=options.widthCss;
    try{
      const cap=await bridge.getCapabilities();
      if(disposed||revision!==lease||!desired)return;
      if(cap.protocol!==1||!cap.supported||cap.mode==='disabled'||!cap.canRequest||!Number.isSafeInteger(cap.nextGeneration)||(cap.nextGeneration??0)<=0){desired=false;publish(empty(0,'failed','capability-disabled'));return;}
      const owner=cap.nextGeneration!;generation=owner;measured=false;acceptedSequence=0;sentSequence=0;visibilitySequence=0;
      const handle=await bridge.addListener('stateChanged',event=>{
        if(!current(lease,owner)||event.generation!==owner)return;
        if(event.status==='failed'||event.status==='destroyed'){
          measured=false;pendingVisible=undefined;publish(empty(owner,event.status,event.reason));
          if(event.status==='failed')retryAfter=clock()+60000;
          return;
        }
        if(event.status==='measured'){
          if(!Number.isFinite(event.heightCss)||!Number.isFinite(event.widthCss)||event.heightCss<=0||event.widthCss<=0){measured=false;pendingVisible=undefined;acceptedSequence=0;publish(empty(owner,'failed','invalid-measurement'));return;}
          measured=true;acceptedSequence=0;visibilitySequence=sentSequence+1;pendingVisible=undefined;publish(event);return;
        }
        if(event.status==='visible'){
          if(!measured||!Number.isSafeInteger(event.sequence)||(event.sequence??0)<=0||(event.sequence??0)!==sentSequence||(event.sequence??0)<acceptedSequence||(event.sequence??0)<visibilitySequence)return;
          visibilitySequence=event.sequence!;
          if((event.sequence??0)>acceptedSequence){pendingVisible=event;return;}
          publish(event);return;
        }
        if(event.status==='hidden'){
          if((event.sequence??0)>0&&(event.sequence??0)<visibilitySequence)return;
          visibilitySequence=Math.max(visibilitySequence,(event.sequence??0)>0?event.sequence!:sentSequence+1);
          if(!(event.sequence??0))acceptedSequence=0;
          pendingVisible=undefined;
          if(measured)publish(event);
          return;
        }
        publish(empty(owner,'loading'));
      });
      if(!current(lease,owner)){await handle.remove();return;}
      listener=handle;publish(empty(owner,'loading'));
      await bridge.prepare({...options,generation:owner});
    }catch{
      if(revision===lease){publish(empty(generation,'failed','prepare-unavailable'));await leave();}
    }finally{if(revision===lease)preparing=false;}
  };
  const enter=(options:EnterOptions):Promise<void>=>{
    if(entering)return entering.then(()=>start(options));
    const pending=start(options);entering=pending;
    void pending.finally(()=>{if(entering===pending)entering=undefined;}).catch(()=>{});
    return pending;
  };
  const update=async(geometry:Geometry)=>{
    if(disposed||cleanupFailed||preparing||!desired||!measured||geometry.generation!==generation||geometry.sequence<=sentSequence)return;
    const lease=revision,owned=generation;sentSequence=geometry.sequence;
    try{
      const ack=await bridge.updateGeometry(geometry);
      if(!current(lease,owned))return;
      if(geometry.sequence!==sentSequence)return;
      if(!ack.accepted||ack.sequence!==geometry.sequence){pendingVisible=undefined;await bridge.hide({generation:owned});return;}
      acceptedSequence=Math.max(acceptedSequence,ack.sequence);
      if(pendingVisible&&(pendingVisible.sequence??0)<=acceptedSequence){const event=pendingVisible;pendingVisible=undefined;publish(event);}
    }catch{if(current(lease,owned)){try{await bridge.hide({generation:owned});}catch{cleanupFailed=true;}publish(empty(owned,'failed','geometry-unavailable'));}}
  };
  return {enter,update,leave,dispose:async()=>{disposed=true;await leave();}};
}
