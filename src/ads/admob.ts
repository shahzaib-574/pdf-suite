import { Capacitor } from '@capacitor/core';
import {
  AdMob,
  AdmobConsentDebugGeography,
  AdmobConsentStatus,
  BannerAdPluginEvents,
  BannerAdPosition,
  BannerAdSize,
  MaxAdContentRating,
  type AdmobConsentInfo,
  type AdmobConsentRequestOptions,
} from '@capacitor-community/admob';
import { parseDebugTestDeviceIds } from './policy';

declare const __REAM_AD_CONFIG__: Readonly<{
  bannerId: string;
  testMode: boolean;
  liveAdsEnabled: boolean;
}>;

const debugMode = __REAM_AD_CONFIG__.testMode;
const bannerId = __REAM_AD_CONFIG__.bannerId;

let consentInitialization: Promise<boolean> | null = null;
let sdkInitialized = false;
let canRequestAds = false;
let desiredVisible = false;
let privacyOptionsRequired = false;
let listenersInstalled: Promise<void> | null = null;
let nativeOperations: Promise<void> = Promise.resolve();
let intentRevision = 0;
let bannerCreated = false;
let bannerLoaded = false;
let bannerWidth = 0;
let bannerHeight = 0;

function isAndroidNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

function setAdSpace(height = 0): void {
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 0;
  document.documentElement.style.setProperty(
    '--native-ad-height',
    `${safeHeight}px`,
  );
  document.documentElement.classList.toggle('has-native-ad', safeHeight > 0);
}

function resetBannerMeasurements(): void {
  bannerLoaded = false;
  bannerWidth = 0;
  bannerHeight = 0;
  setAdSpace(0);
}

function publishPrivacyState(required: boolean): void {
  privacyOptionsRequired = required;
  window.dispatchEvent(
    new CustomEvent<boolean>('ream:ad-privacy-state', { detail: required }),
  );
}

function applyConsentState(consent: AdmobConsentInfo): void {
  canRequestAds = consent.canRequestAds;
  publishPrivacyState(
    consent.privacyOptionsRequirementStatus === 'REQUIRED',
  );
}

function consentOptions(): AdmobConsentRequestOptions {
  const debugGeography = (() => {
    switch (import.meta.env.VITE_UMP_DEBUG_GEOGRAPHY?.trim().toUpperCase()) {
      case 'EEA':
        return AdmobConsentDebugGeography.EEA;
      case 'US':
        return AdmobConsentDebugGeography.US;
      case 'OTHER':
        return AdmobConsentDebugGeography.OTHER;
      default:
        return undefined;
    }
  })();
  const testDeviceIdentifiers = parseDebugTestDeviceIds(
    import.meta.env.VITE_UMP_TEST_DEVICE_IDS,
  );
  // Play's declared 13+ audience can still be under the local age of consent.
  // Without an age gate, treat every request conservatively as under-age.
  const options: AdmobConsentRequestOptions = {
    tagForUnderAgeOfConsent: true,
  };
  if (debugGeography !== undefined) options.debugGeography = debugGeography;
  if (testDeviceIdentifiers.length > 0) {
    options.testDeviceIdentifiers = testDeviceIdentifiers;
  }
  return options;
}

function serialize(operation: () => Promise<void>): Promise<void> {
  const result = nativeOperations.then(operation, operation);
  nativeOperations = result.catch(() => undefined);
  return result;
}

function updateMeasuredSpace(): void {
  setAdSpace(
    desiredVisible && bannerCreated && bannerLoaded && bannerWidth > 0
      ? bannerHeight
      : 0,
  );
}

async function installListeners(): Promise<void> {
  if (listenersInstalled) return listenersInstalled;
  listenersInstalled = (async () => {
    await AdMob.addListener(BannerAdPluginEvents.Loaded, () => {
      if (!bannerCreated || !desiredVisible) return;
      bannerLoaded = true;
      updateMeasuredSpace();
    });
    await AdMob.addListener(
      BannerAdPluginEvents.SizeChanged,
      ({ width, height }) => {
        if (!bannerCreated || !desiredVisible) return;
        bannerWidth = width;
        bannerHeight = height;
        updateMeasuredSpace();
      },
    );
    await AdMob.addListener(BannerAdPluginEvents.FailedToLoad, () => {
      bannerCreated = false;
      resetBannerMeasurements();
      void serialize(async () => {
        try {
          await AdMob.removeBanner();
        } catch {
          // Tool use remains available; the next visibility transition retries cleanup.
        }
      });
    });
  })().catch((error) => {
    listenersInstalled = null;
    throw error;
  });
  return listenersInstalled;
}

async function initializeSdk(): Promise<void> {
  if (sdkInitialized) return;
  await AdMob.initialize({
    maxAdContentRating: MaxAdContentRating.General,
    tagForUnderAgeOfConsent: true,
    ...(debugMode
      ? {
          initializeForTesting: true,
          testingDevices: parseDebugTestDeviceIds(
            import.meta.env.VITE_UMP_TEST_DEVICE_IDS,
          ),
        }
      : { initializeForTesting: false }),
  });
  sdkInitialized = true;
}

async function refreshConsent(): Promise<boolean> {
  let consent = await AdMob.requestConsentInfo(consentOptions());
  applyConsentState(consent);
  if (
    consent.status === AdmobConsentStatus.REQUIRED &&
    consent.isConsentFormAvailable
  ) {
    consent = await AdMob.showConsentForm();
    applyConsentState(consent);
  }
  if (!consent.canRequestAds) return false;
  await initializeSdk();
  return true;
}

/** Requests fresh UMP information once per app process. Errors leave tools usable. */
export function initializeMobileAds(): Promise<boolean> {
  if (!isAndroidNative() || !__REAM_AD_CONFIG__.liveAdsEnabled || !bannerId) {
    return Promise.resolve(false);
  }
  if (consentInitialization) return consentInitialization;
  consentInitialization = (async () => {
    await installListeners();
    return refreshConsent();
  })().catch(() => {
    canRequestAds = false;
    resetBannerMeasurements();
    return false;
  });
  return consentInitialization;
}

async function removeNativeBanner(): Promise<void> {
  resetBannerMeasurements();
  try {
    await AdMob.removeBanner();
  } catch {
    // A missing/failed native view is already equivalent to hidden for layout.
  } finally {
    bannerCreated = false;
  }
}

export async function setDiscoveryBannerVisible(visible: boolean): Promise<void> {
  desiredVisible = visible;
  const revision = ++intentRevision;
  if (!isAndroidNative()) return;

  if (!visible) {
    resetBannerMeasurements();
    await serialize(async () => {
      if (revision !== intentRevision || desiredVisible) return;
      await removeNativeBanner();
    });
    return;
  }

  const initialized = await initializeMobileAds();
  if (!initialized || !canRequestAds || revision !== intentRevision || !desiredVisible) {
    return;
  }

  await serialize(async () => {
    if (revision !== intentRevision || !desiredVisible || !canRequestAds) return;
    if (bannerCreated) await removeNativeBanner();
    if (revision !== intentRevision || !desiredVisible) return;
    resetBannerMeasurements();
    bannerCreated = true;
    try {
      await AdMob.showBanner({
        adId: bannerId,
        adSize: BannerAdSize.ADAPTIVE_BANNER,
        position: BannerAdPosition.BOTTOM_CENTER,
        margin: 0,
        isTesting: debugMode,
      });
    } catch {
      bannerCreated = false;
      resetBannerMeasurements();
    }
  });
}

export function isAdPrivacyOptionsRequired(): boolean {
  return isAndroidNative() && privacyOptionsRequired;
}

export function subscribeAdPrivacyState(
  listener: (required: boolean) => void,
): () => void {
  const handler = (event: Event) => {
    listener((event as CustomEvent<boolean>).detail === true);
  };
  window.addEventListener('ream:ad-privacy-state', handler);
  listener(isAdPrivacyOptionsRequired());
  return () => window.removeEventListener('ream:ad-privacy-state', handler);
}

export async function showAdPrivacyOptions(): Promise<boolean> {
  if (!isAndroidNative() || !privacyOptionsRequired) return false;
  const revision = ++intentRevision;
  desiredVisible = false;
  await serialize(removeNativeBanner);
  try {
    await AdMob.showPrivacyOptionsForm();
    const allowed = await refreshConsent();
    return allowed;
  } catch {
    canRequestAds = false;
    resetBannerMeasurements();
    return false;
  } finally {
    // The Settings route never displays a banner. A later route transition
    // explicitly creates a fresh banner after any changed consent choice.
    if (revision === intentRevision) desiredVisible = false;
  }
}
