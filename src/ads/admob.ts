import { Capacitor } from '@capacitor/core';
import {
  AdMob,
  AdmobConsentStatus,
  BannerAdPluginEvents,
  BannerAdPosition,
  BannerAdSize,
  MaxAdContentRating,
} from '@capacitor-community/admob';

const GOOGLE_TEST_BANNER_ID = 'ca-app-pub-3940256099942544/9214589741';
const productionBannerId = import.meta.env.VITE_ADMOB_BANNER_ID?.trim() ?? '';
const testMode = import.meta.env.VITE_ADMOB_TEST_MODE === 'true';
const bannerId = testMode ? GOOGLE_TEST_BANNER_ID : productionBannerId;

let initialization: Promise<boolean> | null = null;
let ready = false;
let desiredBanner = false;
let bannerCreated = false;
let privacyOptionsRequired = false;

function isAndroidNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

function setAdSpace(visible: boolean): void {
  document.documentElement.classList.toggle('has-native-ad', visible);
}

function publishPrivacyState(required: boolean): void {
  privacyOptionsRequired = required;
  window.dispatchEvent(
    new CustomEvent<boolean>('ream:ad-privacy-state', { detail: required }),
  );
}

async function showDesiredBanner(): Promise<void> {
  if (!ready || !desiredBanner || !bannerId) return;
  if (bannerCreated) {
    await AdMob.resumeBanner();
    return;
  }
  bannerCreated = true;
  try {
    await AdMob.showBanner({
      adId: bannerId,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 84,
      isTesting: testMode,
    });
  } catch {
    bannerCreated = false;
    setAdSpace(false);
  }
}

export function initializeMobileAds(): Promise<boolean> {
  if (!isAndroidNative() || !bannerId) return Promise.resolve(false);
  if (initialization) return initialization;

  initialization = (async () => {
    await AdMob.addListener(BannerAdPluginEvents.Loaded, () => setAdSpace(true));
    await AdMob.addListener(BannerAdPluginEvents.FailedToLoad, () => {
      bannerCreated = false;
      setAdSpace(false);
    });

    let consent = await AdMob.requestConsentInfo();
    publishPrivacyState(
      consent.privacyOptionsRequirementStatus === 'REQUIRED',
    );

    if (
      consent.status === AdmobConsentStatus.REQUIRED &&
      consent.isConsentFormAvailable
    ) {
      consent = await AdMob.showConsentForm();
      publishPrivacyState(
        consent.privacyOptionsRequirementStatus === 'REQUIRED',
      );
    }

    if (!consent.canRequestAds) return false;

    await AdMob.initialize({
      initializeForTesting: testMode,
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
      maxAdContentRating: MaxAdContentRating.ParentalGuidance,
    });
    ready = true;
    await showDesiredBanner();
    return true;
  })().catch(() => {
    ready = false;
    setAdSpace(false);
    return false;
  });

  return initialization;
}

export async function setDiscoveryBannerVisible(visible: boolean): Promise<void> {
  desiredBanner = visible;
  if (!isAndroidNative()) return;
  if (!visible) {
    setAdSpace(false);
    if (bannerCreated) await AdMob.hideBanner().catch(() => undefined);
    return;
  }
  await initializeMobileAds();
  await showDesiredBanner();
}

export function isAdPrivacyOptionsRequired(): boolean {
  return isAndroidNative() && privacyOptionsRequired;
}

export async function showAdPrivacyOptions(): Promise<void> {
  if (!isAndroidNative() || !privacyOptionsRequired) return;
  await AdMob.showPrivacyOptionsForm();
}
