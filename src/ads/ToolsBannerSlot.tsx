import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { initializeMobileAds, markBannerCleanupFailed, registerBannerTeardown } from './admob';
import { nativeToolsBanner, type BannerState, type Geometry, type RectCss } from './inlineBanner';
import { createInlineBannerController, type InlineBannerController } from './inlineBannerController';

export type InlineBannerControllerFactory = (onState:(state:BannerState)=>void)=>InlineBannerController;
export type ToolsBannerSlotViewProps = {eligible:boolean;createController:InlineBannerControllerFactory};
const rect = (element:Element):RectCss => {
  const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};
};

/** Shared real slot: the isolated fixture exercises these same observers and DOM measurements. */
export function ToolsBannerSlotView({eligible,createController}:ToolsBannerSlotViewProps):React.JSX.Element {
  const slot=useRef<HTMLDivElement>(null),creative=useRef<HTMLDivElement>(null);
  const controller=useRef<InlineBannerController|undefined>(undefined);
  const stateRef=useRef<BannerState|undefined>(undefined),scheduleRef=useRef<()=>void>(()=>{});
  const [state,setState]=useState<BannerState|undefined>();
  useLayoutEffect(()=>{scheduleRef.current();}); // Position-only changes after any committed render.
  useEffect(()=>{
    let active=true,frame=0,sequence=0;
    const owner=createController(next=>{if(active){
      const previous=stateRef.current;stateRef.current=next;
      // Visibility acknowledgments do not create a geometry/render feedback loop.
      if(!previous||previous.generation!==next.generation||previous.status!==next.status||previous.widthCss!==next.widthCss||previous.heightCss!==next.heightCss||previous.reason!==next.reason)setState(next);
      if(next.status==='measured')schedule();
    }});
    controller.current=owner;
    const unregister=registerBannerTeardown(()=>owner.leave().catch(error=>{markBannerCleanupFailed();throw error;}));
    async function sample(){
      frame=0;if(!active||!slot.current)return;
      if(!eligible||document.visibilityState!=='visible') {await owner.leave().catch(markBannerCleanupFailed);return;}
      await owner.enter({widthCss:rect(slot.current).width,layoutWidth:window.innerWidth,eligible:true});
      if(!active)return;
      const measured=stateRef.current;
      if(!measured||measured.heightCss<=0||!creative.current)return;
      const s=rect(slot.current),c=rect(creative.current),v=window.visualViewport;
      const occlusions=[...document.querySelectorAll('.shell__nav,.ps-incoming,[aria-modal="true"],dialog[open]')].map(rect).filter(r=>r.width>0&&r.height>0);
      const geometry:Geometry={generation:measured.generation,sequence:++sequence,slot:s,creative:c,reservedHeight:s.height,scrollX:window.scrollX,scrollY:window.scrollY,layoutWidth:window.innerWidth,layoutHeight:window.innerHeight,visual:{offsetLeft:v?.offsetLeft??0,offsetTop:v?.offsetTop??0,width:v?.width??window.innerWidth,height:v?.height??window.innerHeight,scale:v?.scale??1},occlusions,eligible:true};
      await owner.update(geometry);
    }
    function schedule(){if(active&&!frame)frame=requestAnimationFrame(()=>{void sample().catch(markBannerCleanupFailed);});}
    scheduleRef.current=schedule;
    // Ancestor/recent row resizing may move the slot without changing its own dimensions.
    const resize=new ResizeObserver(schedule);
    if(slot.current){resize.observe(slot.current);for(let p=slot.current.parentElement;p;p=p.parentElement){resize.observe(p);for(const child of p.children)resize.observe(child);}}
    const mutation=new MutationObserver(schedule);
    const layout=slot.current?.parentElement;
    if(layout)mutation.observe(layout,{childList:true,subtree:true,characterData:true});
    document.addEventListener('scroll',schedule,{capture:true,passive:true});
    document.addEventListener('visibilitychange',schedule);
    document.addEventListener('ream-library-changed',schedule);
    document.fonts?.addEventListener('loadingdone',schedule);
    window.addEventListener('resize',schedule);window.addEventListener('pagehide',retire);
    window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);
    function retire(){void owner.leave().catch(markBannerCleanupFailed);}
    schedule();
    return ()=>{
      active=false;cancelAnimationFrame(frame);resize.disconnect();mutation.disconnect();unregister();scheduleRef.current=()=>{};
      document.removeEventListener('scroll',schedule,true);document.removeEventListener('visibilitychange',schedule);document.removeEventListener('ream-library-changed',schedule);document.fonts?.removeEventListener('loadingdone',schedule);
      window.removeEventListener('resize',schedule);window.removeEventListener('pagehide',retire);window.visualViewport?.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('scroll',schedule);
      controller.current=undefined;stateRef.current=undefined;void owner.dispose().catch(markBannerCleanupFailed);
    };
  },[eligible,createController]);
  const loaded=eligible&&state&&state.heightCss>0&&state.widthCss>0&&['measured','visible','hidden'].includes(state.status);
  return <div ref={slot} data-tools-banner-slot data-visible={loaded&&state.status==='visible'?'true':'false'} className={loaded?'tools-banner-slot is-loaded':'tools-banner-slot'}>
    {loaded?<><span className="tools-banner-label">Advertisement</span><div ref={creative} data-tools-banner-creative aria-hidden="true" style={{width:state.widthCss,height:state.heightCss}}/></>:null}
  </div>;
}

const nativeFactory:InlineBannerControllerFactory=onState=>createInlineBannerController(nativeToolsBanner,()=>performance.now(),onState);
/** Non-injectable product boundary: no fixture/global/query bypass can grant native eligibility. */
export function ToolsBannerSlot({eligible}:{eligible:boolean}):React.JSX.Element|null {
  const native=Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android';
  const [ready,setReady]=useState(false);
  useEffect(()=>{let active=true;if(native&&eligible)void initializeMobileAds().then(value=>{if(active)setReady(value);});return()=>{active=false;};},[eligible,native]);
  if(!native){
    if(import.meta.env.DEV&&import.meta.env.VITE_REAM_INLINE_AD_PREVIEW==='true'&&eligible)return <div data-tools-banner-preview className="tools-banner-preview">Development ad placeholder — not a real ad</div>;
    return null;
  }
  return ready?<ToolsBannerSlotView eligible={eligible} createController={nativeFactory}/>:null;
}
