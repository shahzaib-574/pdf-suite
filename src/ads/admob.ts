import { Capacitor } from '@capacitor/core';
import { AdMob, AdmobConsentDebugGeography, AdmobConsentStatus, MaxAdContentRating, type AdmobConsentInfo, type AdmobConsentRequestOptions } from '@capacitor-community/admob';
import { parseDebugTestDeviceIds } from './policy';

declare const __REAM_AD_CONFIG__: Readonly<{bannerId:string; testMode:boolean; liveAdsEnabled:boolean}>;
const debugMode=__REAM_AD_CONFIG__.testMode;
let consentInitialization:Promise<boolean>|null=null;
let legacyCleanup:Promise<boolean>|null=null;
let sdkInitialized=false,privacyOptionsRequired=false,bannerCleanupFailed=false;
const teardowns=new Set<()=>Promise<void>>();
const isAndroidNative=()=>Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android';

export function markBannerCleanupFailed():void { bannerCleanupFailed=true; }
export function registerBannerTeardown(teardown:()=>Promise<void>):()=>void { teardowns.add(teardown);return ()=>{teardowns.delete(teardown);}; }
async function retireBanners():Promise<void> {
  const results=await Promise.allSettled([...teardowns].map(teardown=>teardown()));
  if(results.some(r=>r.status==='rejected'))markBannerCleanupFailed();
  if(bannerCleanupFailed)throw new Error('Native banner cleanup incomplete');
}
async function removeLegacyBanner():Promise<boolean> {
  if(legacyCleanup)return legacyCleanup;
  legacyCleanup=(async()=>{
    await AdMob.removeBanner();
    document.documentElement.style.removeProperty('--native-ad-height');
    document.documentElement.classList.remove('has-native-ad');
    return true;
  })().catch(()=>{markBannerCleanupFailed();return false;});
  return legacyCleanup;
}
function applyConsentState(consent:AdmobConsentInfo):void {
  privacyOptionsRequired=consent.privacyOptionsRequirementStatus==='REQUIRED';
  window.dispatchEvent(new CustomEvent<boolean>('ream:ad-privacy-state',{detail:privacyOptionsRequired}));
}
function consentOptions():AdmobConsentRequestOptions {
  const raw=debugMode?import.meta.env.VITE_UMP_DEBUG_GEOGRAPHY?.trim().toUpperCase():undefined;
  const geography=raw==='EEA'?AdmobConsentDebugGeography.EEA:raw==='US'?AdmobConsentDebugGeography.US:raw==='OTHER'?AdmobConsentDebugGeography.OTHER:undefined;
  const identifiers=debugMode?parseDebugTestDeviceIds(import.meta.env.VITE_UMP_TEST_DEVICE_IDS):[];
  const options:AdmobConsentRequestOptions={tagForUnderAgeOfConsent:true};
  if(geography!==undefined)options.debugGeography=geography;
  if(identifiers.length)options.testDeviceIdentifiers=identifiers;
  return options;
}
async function initializeSdk():Promise<void> {
  if(sdkInitialized)return;
  await AdMob.initialize({maxAdContentRating:MaxAdContentRating.General,tagForUnderAgeOfConsent:true,...(debugMode?{initializeForTesting:true,testingDevices:parseDebugTestDeviceIds(import.meta.env.VITE_UMP_TEST_DEVICE_IDS)}:{initializeForTesting:false})});
  sdkInitialized=true;
}
async function refreshConsent():Promise<boolean> {
  let consent=await AdMob.requestConsentInfo(consentOptions());applyConsentState(consent);
  if(consent.status===AdmobConsentStatus.REQUIRED&&consent.isConsentFormAvailable){await retireBanners();consent=await AdMob.showConsentForm();applyConsentState(consent);}
  if(!consent.canRequestAds||bannerCleanupFailed)return false;
  await initializeSdk();return true;
}
/** Shared initialization/UMP only; all banner views are owned by ToolsBanner, not this plugin. */
export function initializeMobileAds():Promise<boolean> {
  if(!isAndroidNative()||!__REAM_AD_CONFIG__.liveAdsEnabled||!__REAM_AD_CONFIG__.bannerId||bannerCleanupFailed)return Promise.resolve(false);
  if(consentInitialization)return consentInitialization;
  consentInitialization=(async()=>{if(!(await removeLegacyBanner()))return false;return refreshConsent();})().catch(()=>false);
  return consentInitialization;
}
export function isAdPrivacyOptionsRequired():boolean {return isAndroidNative()&&privacyOptionsRequired;}
export function subscribeAdPrivacyState(listener:(required:boolean)=>void):()=>void {
  const handler=(event:Event)=>listener((event as CustomEvent<boolean>).detail===true);
  window.addEventListener('ream:ad-privacy-state',handler);listener(isAdPrivacyOptionsRequired());
  return ()=>window.removeEventListener('ream:ad-privacy-state',handler);
}
export async function showAdPrivacyOptions():Promise<boolean> {
  if(!isAndroidNative()||!privacyOptionsRequired)return false;
  try{await retireBanners();await AdMob.showPrivacyOptionsForm();return await refreshConsent();}
  catch{return false;}
}
export async function retireMobileBanners():Promise<void> {await retireBanners();}
