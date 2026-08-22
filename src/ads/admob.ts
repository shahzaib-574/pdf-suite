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
let sdkInitialized = false;
let ready = false;
let desiredBanner = false;
let bannerCreated = false;
let bannerRemovalPending = false;
let privacyOptionsRequired = false;
let listeners: Promise<void> | null = null;
let bannerOperations: Promise<void> = Promise.resolve();

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

function serializeBannerOperation(operation: () => Promise<void>): Promise<void> {
  const result = bannerOperations.then(operation, operation);
  bannerOperations = result.catch(() => undefined);
  return result;
}

function showDesiredBanner(): Promise<void> {
  return serializeBannerOperation(async () => {
    if (
      !ready ||
      !desiredBanner ||
      !bannerId ||
      bannerRemovalPending
    ) {
      return;
    }
    if (bannerCreated) {
      try {
        await AdMob.resumeBanner();
        return;
      } catch {
        setAdSpace(false);
        try {
          await AdMob.removeBanner();
          bannerCreated = false;
        } catch {
          bannerRemovalPending = true;
          ready = false;
          initialization = null;
          return;
        }
      }
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
  });
}

async function ensureBannerListeners(): Promise<void> {
  if (listeners) return listeners;
  listeners = (async () => {
    await AdMob.addListener(BannerAdPluginEvents.SizeChanged, ({ width, height }) => {
      setAdSpace(
        width > 0 &&
          height > 0 &&
          ready &&
          desiredBanner &&
          bannerCreated &&
          !bannerRemovalPending,
      );
    });
    await AdMob.addListener(BannerAdPluginEvents.Loaded, () => {
      setAdSpace(
        ready && desiredBanner && bannerCreated && !bannerRemovalPending,
      );
    });
    await AdMob.addListener(BannerAdPluginEvents.FailedToLoad, () => {
      bannerCreated = false;
      setAdSpace(false);
    });
  })().catch((error) => {
    listeners = null;
    throw error;
  });
  return listeners;
}

function removeCurrentBanner(): Promise<void> {
  setAdSpace(false);
  return serializeBannerOperation(async () => {
    try {
      // The native plugin safely accepts removal when no AdView exists. Always
      // call it because JavaScript state can lag behind a native load callback.
      await AdMob.removeBanner();
      bannerCreated = false;
      bannerRemovalPending = false;
    } catch (error) {
      bannerRemovalPending = true;
      throw error;
    }
  });
}

async function ensureSdkInitialized(): Promise<void> {
  if (sdkInitialized) return;
  await AdMob.initialize({
    initializeForTesting: testMode,
    tagForChildDirectedTreatment: false,
    tagForUnderAgeOfConsent: false,
    maxAdContentRating: MaxAdContentRating.ParentalGuidance,
  });
  sdkInitialized = true;
}

export function initializeMobileAds(): Promise<boolean> {
  if (!isAndroidNative() || !bannerId) return Promise.resolve(false);
  if (initialization) return initialization;

  initialization = (async () => {
    if (bannerRemovalPending) await removeCurrentBanner();
    await ensureBannerListeners();

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

    if (!consent.canRequestAds) {
      initialization = null;
      return false;
    }

    await ensureSdkInitialized();
    ready = true;
    await showDesiredBanner();
    return true;
  })().catch(() => {
    initialization = null;
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
    await serializeBannerOperation(async () => {
      if (desiredBanner || !bannerCreated) return;
      try {
        await AdMob.hideBanner();
      } catch {
        try {
          await AdMob.removeBanner();
          bannerCreated = false;
          bannerRemovalPending = false;
        } catch {
          // If native visibility cannot be confirmed, block all later show or
          // resume calls until initializeMobileAds confirms a successful remove.
          bannerRemovalPending = true;
          ready = false;
          initialization = null;
        }
      }
    });
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

  // A changed choice must affect the next request immediately. Discard the
  // existing banner before refreshing consent. If the refresh fails, the app
  // remains ad-free until a later initialization succeeds.
  ready = false;
  initialization = null;
  await removeCurrentBanner();

  const consent = await AdMob.requestConsentInfo();
  publishPrivacyState(
    consent.privacyOptionsRequirementStatus === 'REQUIRED',
  );

  if (!consent.canRequestAds) {
    return;
  }

  await ensureSdkInitialized();
  ready = true;
  initialization = Promise.resolve(true);
  await showDesiredBanner();
}
