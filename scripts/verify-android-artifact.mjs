import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import JSZip from 'jszip';

const DEFAULT_APK = 'android/app/build/outputs/apk/release/app-release.apk';
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE_IDENTITY_PATH = path.join(REPOSITORY_ROOT, 'android', 'variables.gradle');
const MONETIZATION = JSON.parse(
  readFileSync(path.join(REPOSITORY_ROOT, 'monetization.config.json'), 'utf8'),
);
const GOOGLE_TEST_BANNER_ID = 'ca-app-pub-3940256099942544/9214589741';

const RELEASE_IDENTITY_FIELDS = Object.freeze({
  versionCode: Object.freeze({ gradleName: 'appVersionCode', type: 'integer' }),
  versionName: Object.freeze({ gradleName: 'appVersionName', type: 'string' }),
  minSdk: Object.freeze({ gradleName: 'minSdkVersion', type: 'integer' }),
  targetSdk: Object.freeze({ gradleName: 'targetSdkVersion', type: 'integer' }),
});

function stripGradleComments(source, sourceLabel) {
  let output = '';
  let quote;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];
    if (lineComment) {
      if (character === '\r' || character === '\n') {
        lineComment = false;
        output += character;
      } else {
        output += ' ';
      }
      continue;
    }
    if (blockComment) {
      if (character === '*' && nextCharacter === '/') {
        blockComment = false;
        output += '  ';
        index += 1;
      } else {
        output += character === '\r' || character === '\n' ? character : ' ';
      }
      continue;
    }
    if (escaped) {
      escaped = false;
      output += character;
      continue;
    }
    if (character === '\\' && quote) {
      escaped = true;
      output += character;
      continue;
    }
    if (quote) {
      if (character === quote) quote = undefined;
      output += character;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      output += character;
      continue;
    }
    if (character === '/' && nextCharacter === '/') {
      lineComment = true;
      output += '  ';
      index += 1;
      continue;
    }
    if (character === '/' && nextCharacter === '*') {
      blockComment = true;
      output += '  ';
      index += 1;
      continue;
    }
    output += character;
  }

  if (blockComment) throw new Error(`${sourceLabel} contains an unterminated block comment.`);
  return output;
}

function parseReleaseIdentity(source, sourceLabel = 'android/variables.gradle') {
  const lines = stripGradleComments(source, sourceLabel).split(/\r?\n/);
  const identity = {};

  for (const [outputName, definition] of Object.entries(RELEASE_IDENTITY_FIELDS)) {
    const escapedGradleName = definition.gradleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const startsWithField = new RegExp(`^\\s*(?:ext\\.)?${escapedGradleName}\\b`);
    const assignment = new RegExp(
      `^\\s*(?:ext\\.)?${escapedGradleName}\\s*=\\s*(.*?)\\s*;?\\s*$`,
    );
    const occurrences = [];

    for (const [index, line] of lines.entries()) {
      if (startsWithField.test(line)) occurrences.push({ line, lineNumber: index + 1 });
    }

    if (occurrences.length === 0) {
      throw new Error(`${sourceLabel} is missing required assignment ${definition.gradleName}.`);
    }
    if (occurrences.length > 1) {
      throw new Error(
        `${sourceLabel} defines ${definition.gradleName} more than once (lines ${occurrences.map(({ lineNumber }) => lineNumber).join(', ')}).`,
      );
    }

    const [{ line, lineNumber }] = occurrences;
    const rawValue = line.match(assignment)?.[1];
    if (!rawValue) {
      throw new Error(
        `${sourceLabel}:${lineNumber} has a malformed ${definition.gradleName} assignment.`,
      );
    }

    if (definition.type === 'integer') {
      if (!/^[1-9]\d*$/.test(rawValue)) {
        throw new Error(
          `${sourceLabel}:${lineNumber} requires ${definition.gradleName} to be a positive integer literal.`,
        );
      }
      const numericValue = Number(rawValue);
      if (!Number.isSafeInteger(numericValue)) {
        throw new Error(
          `${sourceLabel}:${lineNumber} has an out-of-range ${definition.gradleName} value.`,
        );
      }
      identity[outputName] = rawValue;
      continue;
    }

    const singleQuoted = rawValue.match(/^'([^'\\\r\n]+)'$/)?.[1];
    const doubleQuoted = rawValue.match(/^"([^"\\\r\n]+)"$/)?.[1];
    const stringValue = singleQuoted ?? doubleQuoted;
    if (!stringValue || stringValue !== stringValue.trim()) {
      throw new Error(
        `${sourceLabel}:${lineNumber} requires ${definition.gradleName} to be a non-empty quoted string literal without escapes or surrounding whitespace.`,
      );
    }
    identity[outputName] = stringValue;
  }

  if (Number(identity.targetSdk) < Number(identity.minSdk)) {
    throw new Error(
      `${sourceLabel} targetSdkVersion (${identity.targetSdk}) cannot be lower than minSdkVersion (${identity.minSdk}).`,
    );
  }

  return Object.freeze(identity);
}

function readReleaseIdentity() {
  let source;
  try {
    source = readFileSync(RELEASE_IDENTITY_PATH, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read ${RELEASE_IDENTITY_PATH}: ${error.message}`);
  }
  return parseReleaseIdentity(source, RELEASE_IDENTITY_PATH);
}

const RELEASE_IDENTITY = readReleaseIdentity();

const EXPECTED = Object.freeze({
  applicationId: 'com.reampdf.mobile',
  ...RELEASE_IDENTITY,
});

// Exact release permission contract. Network state and the advertising/Privacy
// Sandbox identifiers below are introduced by the pinned Google Mobile Ads SDK.
const MERGED_PERMISSION_ALLOWLIST = Object.freeze([
  'android.permission.ACCESS_ADSERVICES_AD_ID',
  'android.permission.ACCESS_ADSERVICES_ATTRIBUTION',
  'android.permission.ACCESS_ADSERVICES_TOPICS',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.CAMERA',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.INTERNET',
  'android.permission.WAKE_LOCK',
  'com.google.android.gms.permission.AD_ID',
  'com.reampdf.mobile.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',
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

function usage() {
  return `Usage: node scripts/verify-android-artifact.mjs [APK_PATH]
       node scripts/verify-android-artifact.mjs --print-release-identity
       node scripts/verify-android-artifact.mjs --self-test

Verifies the packaged release manifest and Capacitor web assets. APK_PATH
defaults to ${DEFAULT_APK}.

Options:
  --print-release-identity  Print versionCode and versionName from
                            android/variables.gradle for release automation.
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

function windowsBatchInvocation(executable, args, environment = process.env) {
  const values = [executable, ...args];
  for (const value of values) {
    if (/[\0\r\n"]/.test(value)) {
      throw new Error('Windows SDK tool paths and arguments cannot contain quotes or control characters.');
    }
  }

  const env = { ...environment, REAM_SDK_TOOL: executable };
  const references = ['"%REAM_SDK_TOOL%"'];
  for (const [index, value] of args.entries()) {
    const name = `REAM_SDK_ARG_${index}`;
    env[name] = value;
    references.push(`"%${name}%"`);
  }

  // /s requires the outer quote pair when the command itself starts with a
  // quoted path. Values travel through the environment so cmd metacharacters
  // in SDK/workspace paths remain data inside their individual quotes.
  return {
    executable: process.env.ComSpec || process.env.COMSPEC || 'cmd.exe',
    args: ['/d', '/s', '/c', `"${references.join(' ')}"`],
    env,
    windowsVerbatimArguments: true,
  };
}

function windowsShortPathInvocation(executable, environment = process.env) {
  if (/[\0\r\n"]/.test(executable)) {
    throw new Error('Windows SDK tool paths cannot contain quotes or control characters.');
  }
  return {
    executable: process.env.ComSpec || process.env.COMSPEC || 'cmd.exe',
    args: ['/d', '/s', '/c', 'for %I in ("%REAM_SDK_TOOL%") do @echo %~sI'],
    env: { ...environment, REAM_SDK_TOOL: executable },
    windowsVerbatimArguments: true,
  };
}

function resolveWindowsBatchExecutable(executable, options) {
  const invocation = windowsShortPathInvocation(executable, options.env);
  const result = spawnSync(invocation.executable, invocation.args, {
    encoding: 'utf8',
    maxBuffer: options.maxBuffer,
    windowsHide: options.windowsHide,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
    env: invocation.env,
  });
  if (result.error) {
    throw new Error(`Unable to resolve Windows SDK tool path (${executable}): ${result.error.message}`);
  }
  if (result.status !== 0) {
    const details = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(
      `Unable to resolve Windows SDK tool path (${executable}); cmd.exe exited with ${result.status}${details ? `:\n${details}` : ''}`,
    );
  }
  const resolved = result.stdout.trim().split(/\r?\n/).at(-1)?.trim();
  if (!resolved) throw new Error(`Unable to resolve Windows SDK tool path (${executable}): no path returned`);
  return resolved;
}

function spawnSdkTool(executable, args, options) {
  if (process.platform !== 'win32' || !/\.(?:bat|cmd)$/i.test(executable)) {
    return spawnSync(executable, args, options);
  }

  // The Android SDK's Windows launcher currently embeds its own directory in
  // an unquoted JVM option. A DOS short path prevents spaces in the SDK root
  // from being split inside that batch file; command arguments remain quoted.
  const batchExecutable = resolveWindowsBatchExecutable(executable, options);
  const invocation = windowsBatchInvocation(batchExecutable, args, options.env);
  return spawnSync(invocation.executable, invocation.args, {
    ...options,
    env: invocation.env,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
  });
}

function runApkAnalyzerCommand(analyzer, args, description) {
  const result = spawnSdkTool(analyzer, args, {
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
    const termination = result.signal
      ? `signal ${result.signal}`
      : `exit code ${result.status}`;
    throw new Error(
      `apkanalyzer ${description} failed with ${termination}${details ? `:\n${details}` : ''}`,
    );
  }

  return result.stdout.trim();
}

function runApkAnalyzer(analyzer, command, apkPath) {
  return runApkAnalyzerCommand(
    analyzer,
    ['manifest', command, apkPath],
    `manifest ${command}`,
  );
}

function readStringResource(analyzer, resourceName, apkPath) {
  return runApkAnalyzerCommand(
    analyzer,
    ['resources', 'value', '--config', 'default', '--type', 'string', '--name', resourceName, apkPath],
    `resources value --type string --name ${resourceName}`,
  );
}

async function checkWebBundle(apkPath, violations) {
  const apk = await JSZip.loadAsync(await readFile(apkPath));
  let hasMobileAds = false;
  let hasUmpPackage = false;
  let hasUmpPlatformApi = false;
  let hasUmpConsentApi = false;
  for (const entry of Object.values(apk.files).filter(item => /^classes\d*\.dex$/.test(item.name))) {
    const bytes = await entry.async('nodebuffer');
    hasMobileAds ||= bytes.includes(Buffer.from('Lcom/google/android/gms/ads/'));
    hasUmpPackage ||= bytes.includes(Buffer.from('Lcom/google/android/ump/'));
    hasUmpPlatformApi ||= bytes.includes(Buffer.from('UserMessagingPlatform'));
    hasUmpConsentApi ||= bytes.includes(Buffer.from('ConsentInformation'));
  }
  if (!hasMobileAds) violations.push('Google Mobile Ads SDK classes are missing from DEX');
  if (!hasUmpPackage && !(hasUmpPlatformApi && hasUmpConsentApi)) {
    violations.push('Google UMP SDK classes are missing from DEX');
  }
  const pluginEntry = apk.file('assets/capacitor.plugins.json');
  if (!pluginEntry || !/AdMobPlugin|admob/i.test(await pluginEntry.async('string'))) {
    violations.push('AdMob plugin is missing from the APK plugin registry');
  }
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
      checkAdsMetadata(metadata, violations);
    } catch (error) {
      violations.push(`packaged production metadata is invalid JSON: ${error.message}`);
    }
  }

  let productionBannerPresent = false;
  const forbiddenHits = [];
  for (const entry of webEntries) {
    const contents = await entry.async('nodebuffer');
    productionBannerPresent ||= contents.includes(Buffer.from(MONETIZATION.admobBannerUnitId));
    if (contents.includes(Buffer.from(GOOGLE_TEST_BANNER_ID))) forbiddenHits.push(entry.name);
  }
  if (!productionBannerPresent) violations.push('Configured production banner ID is missing from packaged web assets');
  if (forbiddenHits.length > 0) violations.push(`Google test banner ID is packaged in production assets: ${forbiddenHits.join(', ')}`);

  return { entryCount: webEntries.length, metadata };
}

function checkAdsMetadata(metadata, violations) {
  addMismatch(violations, 'web metadata schema', metadata?.schemaVersion, 4);
  addMismatch(violations, 'web build mode', metadata?.mode, 'production');
  addMismatch(violations, 'advertising enabled', metadata?.advertising, true);
  addMismatch(violations, 'ad provider', metadata?.ads?.provider, 'google-admob');
  addMismatch(violations, 'AdMob app ID', metadata?.ads?.appId, MONETIZATION.admobAppId);
  addMismatch(violations, 'AdMob banner ID', metadata?.ads?.bannerId, MONETIZATION.admobBannerUnitId);
  addMismatch(violations, 'production ad test mode', metadata?.ads?.isTesting, false);
  addMismatch(violations, 'consent platform', metadata?.ads?.consent, 'google-ump');
  addMismatch(violations, 'maximum ad content rating', metadata?.ads?.maxAdContentRating, 'G');
  addMismatch(violations, 'under-age-of-consent treatment', metadata?.ads?.tagForUnderAgeOfConsent, true);
}

function checkAdsManifest(manifest, resolvedAppId, violations) {
  if (!manifest.includes('com.google.android.gms.ads.APPLICATION_ID')) {
    violations.push('AdMob application metadata is missing from the merged manifest');
  }
  if (resolvedAppId !== MONETIZATION.admobAppId) {
    violations.push('Merged manifest AdMob application ID does not match production configuration');
  }
  if (manifest.includes('ca-app-pub-3940256099942544') || resolvedAppId.includes('ca-app-pub-3940256099942544')) {
    violations.push('Merged production manifest contains a Google sample AdMob ID');
  }
}

function runSelfTest() {
  const windowsInvocation = windowsBatchInvocation(
    'C:\\Android SDK\\cmdline-tools\\latest\\bin\\apkanalyzer.bat',
    ['manifest', 'version-code', 'C:\\Build & QA\\release candidate.apk'],
    { EXISTING_VALUE: 'preserved' },
  );
  assert.deepEqual(windowsInvocation.args, [
    '/d',
    '/s',
    '/c',
    '""%REAM_SDK_TOOL%" "%REAM_SDK_ARG_0%" "%REAM_SDK_ARG_1%" "%REAM_SDK_ARG_2%""',
  ]);
  assert.equal(windowsInvocation.env.EXISTING_VALUE, 'preserved');
  assert.equal(windowsInvocation.env.REAM_SDK_ARG_2, 'C:\\Build & QA\\release candidate.apk');
  assert.equal(windowsInvocation.windowsVerbatimArguments, true);
  const shortPathInvocation = windowsShortPathInvocation(
    'C:\\Android SDK\\cmdline-tools\\latest\\bin\\apkanalyzer.bat',
    { EXISTING_VALUE: 'preserved' },
  );
  assert.deepEqual(shortPathInvocation.args, [
    '/d',
    '/s',
    '/c',
    'for %I in ("%REAM_SDK_TOOL%") do @echo %~sI',
  ]);
  assert.equal(shortPathInvocation.env.EXISTING_VALUE, 'preserved');
  assert.equal(shortPathInvocation.windowsVerbatimArguments, true);
  assert.throws(
    () => windowsBatchInvocation('apkanalyzer.bat', ['bad"argument']),
    /cannot contain quotes or control characters/,
  );

  const identityFixture = `ext {
    /* Retired identity:
    appVersionCode = 41
    */
    appVersionCode = 42
    appVersionName = '2.3.4'
    minSdkVersion = 24
    targetSdkVersion = 36 // current Play target
  }`;
  assert.deepEqual(parseReleaseIdentity(identityFixture, 'fixture'), {
    versionCode: '42',
    versionName: '2.3.4',
    minSdk: '24',
    targetSdk: '36',
  });
  assert.throws(
    () => parseReleaseIdentity(identityFixture.replace('    targetSdkVersion = 36 // current Play target\n', ''), 'fixture'),
    /missing required assignment targetSdkVersion/,
  );
  assert.throws(
    () => parseReleaseIdentity(identityFixture.replace('    appVersionCode = 42', '    appVersionCode = 42\n    appVersionCode = 43'), 'fixture'),
    /defines appVersionCode more than once/,
  );
  assert.throws(
    () => parseReleaseIdentity(identityFixture.replace("appVersionName = '2.3.4'", 'appVersionName = project.version'), 'fixture'),
    /requires appVersionName to be a non-empty quoted string literal/,
  );
  assert.throws(
    () => parseReleaseIdentity(identityFixture.replace('targetSdkVersion = 36', 'targetSdkVersion = 23'), 'fixture'),
    /cannot be lower than minSdkVersion/,
  );
  assert.throws(
    () => parseReleaseIdentity(`${identityFixture}\n/*`, 'fixture'),
    /contains an unterminated block comment/,
  );

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
    [...MERGED_PERMISSION_ALLOWLIST, 'android.permission.RECORD_AUDIO'],
    expandedViolations,
  );
  assert.equal(expandedViolations.length, 2);
  assert.match(expandedViolations[0], /sensitive permissions are forbidden/);
  assert.match(expandedViolations[1], /outside the merged allowlist/);

  const clean = [];
  checkAdsMetadata({schemaVersion: 4, mode: 'production', advertising: true, ads: {
    provider: 'google-admob', appId: MONETIZATION.admobAppId,
    bannerId: MONETIZATION.admobBannerUnitId, isTesting: false,
    consent: 'google-ump', maxAdContentRating: 'G', tagForUnderAgeOfConsent: true,
  }}, clean);
  assert.deepEqual(clean, []);
  const legacy = [];
  checkAdsMetadata({schemaVersion: 3, mode: 'production', advertising: false}, legacy);
  assert(legacy.length > 0);
  const manifestViolations = [];
  checkAdsManifest(xml, MONETIZATION.admobAppId, manifestViolations);
  assert.deepEqual(manifestViolations, []);

  console.log('Android artifact verifier self-test passed.');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(usage());
    return;
  }
  if (args.includes('--self-test')) {
    if (args.length !== 1) throw new Error('--self-test cannot be combined with other arguments');
    runSelfTest();
    return;
  }
  if (args.includes('--print-release-identity')) {
    if (args.length !== 1) {
      throw new Error('--print-release-identity cannot be combined with other arguments');
    }
    console.log(`versionCode=${EXPECTED.versionCode}`);
    console.log(`versionName=${EXPECTED.versionName}`);
    return;
  }
  const positionalArgs = args;
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
  const resolvedAdmobAppId = readStringResource(analyzer, 'admob_app_id', apkPath);
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
  checkAdsManifest(manifestXml, resolvedAdmobAppId, violations);

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
    `  production web bundle (${webBundle.entryCount} files): AdMob/UMP metadata and production IDs`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
