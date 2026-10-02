import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

export const TOOLS_BANNER_PROTOCOL = 1;
export type RectCss = { x: number; y: number; width: number; height: number };
export type Capabilities = {protocol:1; supported:boolean; mode:'android-debug'|'production'|'disabled'; canRequest:boolean; nextGeneration?:number; reason?:string};
export type PrepareOptions = {generation:number; widthCss:number; layoutWidth:number; eligible:boolean};
export type EnterOptions = Omit<PrepareOptions,'generation'>;
export type Geometry = {generation:number; sequence:number; slot:RectCss; creative:RectCss; scrollX:number; scrollY:number; layoutWidth:number; layoutHeight:number; visual:{offsetLeft:number; offsetTop:number; width:number; height:number; scale:number}; occlusions:RectCss[]; reservedHeight:number; eligible:boolean};
export type BannerState = {generation:number; sequence?:number; status:'loading'|'measured'|'visible'|'hidden'|'failed'|'destroyed'; widthPx:number; heightPx:number; widthCss:number; heightCss:number; reason?:string};
export interface ToolsBannerPlugin {
  getCapabilities():Promise<Capabilities>;
  prepare(options:PrepareOptions):Promise<void>;
  updateGeometry(geometry:Geometry):Promise<{accepted:boolean; sequence:number}>;
  hide(options:{generation:number}):Promise<void>;
  destroy(options:{generation:number}):Promise<void>;
  addListener(event:'stateChanged',listener:(event:BannerState)=>void):Promise<PluginListenerHandle>;
}
export const nativeToolsBanner = registerPlugin<ToolsBannerPlugin>('ToolsBanner');
