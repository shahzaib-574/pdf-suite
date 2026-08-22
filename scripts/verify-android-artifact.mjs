import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import JSZip from 'jszip';

const DEFAULT_APK = 'android/app/build/outputs/apk/release/app-release.apk';

const EXPECTED = Object.freeze({
  applicationId: 'com.reampdf.mobile',
  versionCode: '1',
  versionName: '1.0.0',
  minSdk: '24',
  targetSdk: '36',
});

// This is the complete permission contract for the merged release manifest.
// INTERNET/ACCESS_NETWORK_STATE support the web shell and ads. AD_ID and the
// AdServices entries come from Google Mobile Ads; WAKE_LOCK/FOREGROUND_SERVICE
// come from its pinned WorkManager dependency. Dependency changes that alter
// this list must be reviewed explicitly before updating it here.
const MERGED_PERMISSION_ALLOWLIST = Object.freeze([
  'android.permission.ACCESS_ADSERVICES_AD_ID',
  'android.permission.ACCESS_ADSERVICES_ATTRIBUTION',
  'android.permission.ACCESS_ADSERVICES_TOPICS',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.INTERNET',
  'android.permission.WAKE_LOCK',
  'com.google.android.gms.permission.AD_ID',
]);

// High-impact permissions get a dedicated failure in addition to the exact
// allowlist check, so an accidental capability expansion is obvious in CI.
const SENSITIVE_PERMISSION_DENYLIST = Object.freeze([
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_MEDIA_LOCATION',
  'android.permission.ACTIVITY_RECOGNITION',
  'android.permission.ANSWER_PHONE_CALLS',
  'android.permission.BLUETOOTH_ADVERTISE',
  'android.permission.BLUETOOTH_CONNECT',
  'android.permission.BLUETOOTH_SCAN',
  'android.permission.BODY_SENSORS',
  'android.permission.BODY_SENSORS_BACKGROUND',
  'android.permission.CALL_PHONE',
  'android.permission.CAMERA',
  'android.permission.FOREGROUND_SERVICE_CAMERA',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION',
  'android.permission.FOREGROUND_SERVICE_MICROPHONE',
  'android.permission.GET_ACCOUNTS',
  'android.permission.MANAGE_EXTERNAL_STORAGE',
  'android.permission.NEARBY_WIFI_DEVICES',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.QUERY_ALL_PACKAGES',
  'android.permission.READ_CALENDAR',
  'android.permission.READ_CALL_LOG',
  'android.permission.READ_CONTACTS',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.READ_MEDIA_AUDIO',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
  'android.permission.READ_PHONE_NUMBERS',
  'android.permission.READ_PHONE_STATE',
  'android.permission.READ_SMS',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.RECEIVE_MMS',
  'android.permission.RECEIVE_SMS',
  'android.permission.RECEIVE_WAP_PUSH',
  'android.permission.RECORD_AUDIO',
  'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
  'android.permission.REQUEST_INSTALL_PACKAGES',
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.SEND_SMS',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.USE_EXACT_ALARM',
  'android.permission.WRITE_CALENDAR',
  'android.permission.WRITE_CALL_LOG',
  'android.permission.WRITE_CONTACTS',
  'android.permission.WRITE_EXTERNAL_STORAGE',
]);

// Google publishes sample ad units under these publisher IDs. Checking the
// publisher prefix catches every sample format (app, banner, interstitial,
// rewarded, native, and app-open) without chasing individual unit suffixes.
const GOOGLE_SAMPLE_ADMOB_PUBLISHERS = Object.freeze([
  'ca-app-pub-2934735714413707',
  'ca-app-pub-3940256099942544',
]);

function usage() {
  return `Usage: node scripts/verify-android-artifact.mjs [--require-production-ads] [APK_PATH]

Verifies the packaged release manifest and Capacitor web assets. APK_PATH
defaults to ${DEFAULT_APK}.

Options:
  --require-production-ads  Require real-shaped, non-sample AdMob IDs and the
                            confirmed adult-only release marker.
  --self-test  Exercise the parsers and policy checks without an Android SDK.
  --help       Show this help.`;
}

function addMismatch(violations, label, actual, expected) {
  if (actual !== expected) {
    violations.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function extractAndroidAttribute(xml, elementName, attributeName) {
  const elementPattern = new RegExp(`<${elementName}\\b[^>]*>`, 's');
  const element = xml.match(elementPattern)?.[0];
  if (!element) return undefined;

  const escapedName = attributeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const attributePattern = new RegExp(
    `\\bandroid:${escapedName}\\s*=\\s*["']([^"']+)["']`,
  );
  return element.match(attributePattern)?.[1];
}

function parsePermissionOutput(output) {
  const permissions = [];

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^[A-Za-z][A-Za-z0-9_.]+$/.test(line)) {
      permissions.push(line);
      continue;
    }

    // Accept aapt-style decoration if a future apkanalyzer version adds it,
    // while rejecting unrecognized output instead of silently weakening CI.
    const decorated = line.match(
      /(?:name\s*=\s*["'])?([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+)["']?/,
    )?.[1];
    if (!decorated || !decorated.includes('.permission.')) {
      throw new Error(`Unrecognized apkanalyzer permission output: ${JSON.stringify(line)}`);
    }
    permissions.push(decorated);
  }

  return [...new Set(permissions)].sort();
}

function checkPermissions(actualPermissions, violations) {
  const allowed = [...MERGED_PERMISSION_ALLOWLIST].sort();
  const actual = [...new Set(actualPermissions)].sort();
  const allowedSet = new Set(allowed);
  const actualSet = new Set(actual);
  const deniedSet = new Set(SENSITIVE_PERMISSION_DENYLIST);

  const sensitive = actual.filter((permission) => deniedSet.has(permission));
  const unexpected = actual.filter((permission) => !allowedSet.has(permission));
  const missing = allowed.filter((permission) => !actualSet.has(permission));

  if (sensitive.length > 0) {
    violations.push(`sensitive permissions are forbidden: ${sensitive.join(', ')}`);
  }
  if (unexpected.length > 0) {
    violations.push(`permissions outside the merged allowlist: ${unexpected.join(', ')}`);
  }
  if (missing.length > 0) {
    violations.push(`required merged permissions are missing: ${missing.join(', ')}`);
  }
}

function resolveApkAnalyzer() {
  if (process.env.REAM_APKANALYZER) return process.env.REAM_APKANALYZER;

  const executableName = process.platform === 'win32' ? 'apkanalyzer.bat' : 'apkanalyzer';
  const sdkRoots = [process.env.ANDROID_SDK_ROOT, process.env.ANDROID_HOME]
    .filter(Boolean)
    .map((sdkRoot) => path.resolve(sdkRoot));

  for (const sdkRoot of [...new Set(sdkRoots)]) {
    const commandLineTools = path.join(sdkRoot, 'cmdline-tools');
    if (existsSync(commandLineTools)) {
      const versions = readdirSync(commandLineTools, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((left, right) => {
          if (left === 'latest') return -1;
          if (right === 'latest') return 1;
          return right.localeCompare(left, undefined, { numeric: true });
        });

      for (const version of versions) {
        const candidate = path.join(commandLineTools, version, 'bin', executableName);
        if (existsSync(candidate)) return candidate;
      }
    }

    const legacyCandidate = path.join(sdkRoot, 'tools', 'bin', executableName);
    if (existsSync(legacyCandidate)) return legacyCandidate;
  }

  return executableName;
}

function runApkAnalyzer(analyzer, command, apkPath) {
  const result = spawnSync(analyzer, ['manifest', command, apkPath], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });

  if (result.error) {
    throw new Error(
      `Unable to run apkanalyzer (${analyzer}). Ensure Android SDK command-line tools are installed: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    const details = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(
      `apkanalyzer manifest ${command} failed with exit code ${result.status}${details ? `:\n${details}` : ''}`,
    );
  }

  return result.stdout.trim();
}

function readPackagedAdMobAppId(analyzer, apkPath) {
  const args = [
    'resources',
    'value',
    '--config',
    'default',
    '--name',
    'admob_app_id',
    '--type',
    'string',
    apkPath,
  ];
  const result = spawnSync(analyzer, args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) {
    throw new Error(`Unable to inspect packaged AdMob resources: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const details = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(
      `apkanalyzer resources value failed with exit code ${result.status}${details ? `:\n${details}` : ''}`,
    );
  }
  return result.stdout.trim().replace(/^['"]|['"]$/g, '');
}

async function checkWebBundle(apkPath, violations) {
  const apk = await JSZip.loadAsync(await readFile(apkPath));
  const webEntries = Object.values(apk.files)
    .filter((entry) => !entry.dir && entry.name.startsWith('assets/public/'))
    .sort((left, right) => left.name.localeCompare(right.name));

  if (webEntries.length === 0) {
    violations.push('packaged Capacitor web bundle assets/public/ is missing or empty');
    return { entryCount: 0, metadata: undefined };
  }

  const metadataEntry = apk.file('assets/public/release-metadata.json');
  let metadata;
  if (!metadataEntry) {
    violations.push('packaged production metadata assets/public/release-metadata.json is missing');
  } else {
    try {
      metadata = JSON.parse((await metadataEntry.async('nodebuffer')).toString('utf8'));
      addMismatch(violations, 'web metadata schema', metadata?.schemaVersion, 2);
      addMismatch(violations, 'web build mode', metadata?.mode, 'production');
      addMismatch(violations, 'web AdMob test mode', metadata?.admob?.testMode, false);
      addMismatch(
        violations,
        'web UMP debug geography',
        metadata?.admob?.umpDebugGeography,
        '',
      );
      addMismatch(
        violations,
        'web UMP test-device count',
        metadata?.admob?.umpTestDeviceCount,
        0,
      );
    } catch (error) {
      violations.push(`packaged production metadata is invalid JSON: ${error.message}`);
    }
  }

  const forbiddenHits = [];
  const forbiddenBuffers = GOOGLE_SAMPLE_ADMOB_PUBLISHERS.map((publisher) => ({
    publisher,
    bytes: Buffer.from(publisher, 'ascii'),
  }));

  for (const entry of webEntries) {
    const contents = await entry.async('nodebuffer');
    for (const forbidden of forbiddenBuffers) {
      if (contents.indexOf(forbidden.bytes) !== -1) {
        forbiddenHits.push(`${forbidden.publisher} in ${entry.name}`);
      }
    }
  }

  if (forbiddenHits.length > 0) {
    violations.push(`Google sample AdMob IDs are packaged in the production web bundle: ${forbiddenHits.join('; ')}`);
  }

  return { entryCount: webEntries.length, metadata };
}

function checkProductionAds(appId, metadata, violations) {
  addMismatch(
    violations,
    'web AdMob audience mode',
    metadata?.admob?.audienceMode,
    'ADULTS_ONLY',
  );

  const bannerId = metadata?.admob?.bannerId;
  const appMatch =
    typeof appId === 'string'
      ? appId.match(/^ca-app-pub-(\d{16})~\d{10}$/)
      : null;
  const bannerMatch =
    typeof bannerId === 'string'
      ? bannerId.match(/^ca-app-pub-(\d{16})\/\d{10}$/)
      : null;
  const obviousPlaceholders = new Set([
    'ca-app-pub-0000000000000000~0000000000',
    'ca-app-pub-1234567890123456~1234567890',
    'ca-app-pub-0000000000000000/0000000000',
    'ca-app-pub-1234567890123456/1234567890',
  ]);

  if (!appMatch) violations.push('packaged AdMob app ID is missing or malformed');
  if (!bannerMatch) {
    violations.push('packaged AdMob banner ID is missing or malformed');
  }
  if (appId && obviousPlaceholders.has(appId)) {
    violations.push('packaged AdMob app ID is a documentation placeholder');
  }
  if (bannerId && obviousPlaceholders.has(bannerId)) {
    violations.push('packaged AdMob banner ID is a documentation placeholder');
  }
  if (
    typeof appId === 'string' &&
    GOOGLE_SAMPLE_ADMOB_PUBLISHERS.some((publisher) => appId.startsWith(publisher))
  ) {
    violations.push('packaged AdMob app ID uses a Google sample publisher');
  }
  if (appMatch && bannerMatch && appMatch[1] !== bannerMatch[1]) {
    violations.push('packaged AdMob app and banner IDs belong to different publishers');
  }
}

function runSelfTest() {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
    <manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application android:allowBackup="false" android:usesCleartextTraffic="false">
        <meta-data
          android:name="com.google.android.gms.ads.APPLICATION_ID"
          android:value="ca-app-pub-1111222233334444~5555666677" />
      </application>
    </manifest>`;
  assert.equal(extractAndroidAttribute(xml, 'application', 'allowBackup'), 'false');
  assert.equal(extractAndroidAttribute(xml, 'application', 'usesCleartextTraffic'), 'false');
  assert.deepEqual(
    parsePermissionOutput('android.permission.INTERNET\ncom.google.android.gms.permission.AD_ID\n'),
    ['android.permission.INTERNET', 'com.google.android.gms.permission.AD_ID'],
  );

  const compliantViolations = [];
  checkPermissions(MERGED_PERMISSION_ALLOWLIST, compliantViolations);
  assert.deepEqual(compliantViolations, []);

  const expandedViolations = [];
  checkPermissions(
    [...MERGED_PERMISSION_ALLOWLIST, 'android.permission.CAMERA'],
    expandedViolations,
  );
  assert.equal(expandedViolations.length, 2);
  assert.match(expandedViolations[0], /sensitive permissions are forbidden/);
  assert.match(expandedViolations[1], /outside the merged allowlist/);

  const productionAdViolations = [];
  checkProductionAds(
    'ca-app-pub-1111222233334444~5555666677',
    {
      admob: {
        audienceMode: 'ADULTS_ONLY',
        bannerId: 'ca-app-pub-1111222233334444/8888999900',
      },
    },
    productionAdViolations,
  );
  assert.deepEqual(productionAdViolations, []);

  console.log('Android artifact verifier self-test passed.');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(usage());
    return;
  }
  if (args.includes('--self-test')) {
    if (args.length !== 1) throw new Error('--self-test cannot be combined with an APK path');
    runSelfTest();
    return;
  }
  const requireProductionAds = args.includes('--require-production-ads');
  const positionalArgs = args.filter(
    (argument) => argument !== '--require-production-ads',
  );
  if (positionalArgs.length > 1 || positionalArgs[0]?.startsWith('-')) {
    throw new Error(`${usage()}\n\nUnexpected arguments: ${args.join(' ')}`);
  }

  const apkPath = path.resolve(positionalArgs[0] ?? DEFAULT_APK);
  if (!existsSync(apkPath) || !statSync(apkPath).isFile()) {
    throw new Error(`Release APK does not exist: ${apkPath}`);
  }

  const allowDenyOverlap = MERGED_PERMISSION_ALLOWLIST.filter((permission) =>
    SENSITIVE_PERMISSION_DENYLIST.includes(permission),
  );
  if (allowDenyOverlap.length > 0) {
    throw new Error(`Verifier policy is invalid; permissions are both allowed and denied: ${allowDenyOverlap.join(', ')}`);
  }

  const analyzer = resolveApkAnalyzer();
  const violations = [];
  addMismatch(
    violations,
    'application ID',
    runApkAnalyzer(analyzer, 'application-id', apkPath),
    EXPECTED.applicationId,
  );
  addMismatch(
    violations,
    'version code',
    runApkAnalyzer(analyzer, 'version-code', apkPath),
    EXPECTED.versionCode,
  );
  addMismatch(
    violations,
    'version name',
    runApkAnalyzer(analyzer, 'version-name', apkPath),
    EXPECTED.versionName,
  );
  addMismatch(
    violations,
    'minimum SDK',
    runApkAnalyzer(analyzer, 'min-sdk', apkPath),
    EXPECTED.minSdk,
  );
  addMismatch(
    violations,
    'target SDK',
    runApkAnalyzer(analyzer, 'target-sdk', apkPath),
    EXPECTED.targetSdk,
  );
  addMismatch(
    violations,
    'debuggable',
    runApkAnalyzer(analyzer, 'debuggable', apkPath).toLowerCase(),
    'false',
  );

  const manifestXml = runApkAnalyzer(analyzer, 'print', apkPath);
  addMismatch(
    violations,
    'android:allowBackup',
    extractAndroidAttribute(manifestXml, 'application', 'allowBackup'),
    'false',
  );
  addMismatch(
    violations,
    'android:usesCleartextTraffic',
    extractAndroidAttribute(manifestXml, 'application', 'usesCleartextTraffic'),
    'false',
  );

  const permissions = parsePermissionOutput(
    runApkAnalyzer(analyzer, 'permissions', apkPath),
  );
  checkPermissions(permissions, violations);
  const webBundle = await checkWebBundle(apkPath, violations);
  if (requireProductionAds) {
    checkProductionAds(
      readPackagedAdMobAppId(analyzer, apkPath),
      webBundle.metadata,
      violations,
    );
  }

  if (violations.length > 0) {
    throw new Error(`Android release artifact is not compliant:\n- ${violations.join('\n- ')}`);
  }

  console.log(`Android release artifact compliance verified: ${apkPath}`);
  console.log(
    `  ${EXPECTED.applicationId} v${EXPECTED.versionName} (${EXPECTED.versionCode}), SDK ${EXPECTED.minSdk}-${EXPECTED.targetSdk}`,
  );
  console.log('  non-debuggable; backup disabled; cleartext traffic disabled');
  console.log(`  exact merged permissions (${permissions.length}): ${permissions.join(', ')}`);
  console.log(
    `  production web bundle (${webBundle.entryCount} files): no Google sample AdMob IDs`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
