#!/usr/bin/env bash
set -euo pipefail
output=store-assets/screenshots/release-capture
: "${GITHUB_SHA:?GITHUB_SHA is required for exact capture provenance}"
mkdir -p "$output"
collect_diagnostics() {
  adb logcat -d > "$output/logcat.txt" || true
  adb pull /sdcard/Android/data/com.reampdf.mobile/files/store-screenshots/. "$output/" || true
}
trap collect_diagnostics EXIT
adb uninstall com.reampdf.mobile >/dev/null 2>&1 || true
(cd android && ./gradlew --no-daemon :app:installRelease :app:installReleaseAndroidTest -PcaptureStoreScreenshots=true)
adb shell am instrument -w -r \
  -e captureStoreScreenshots true \
  -e sourceCommit "$GITHUB_SHA" \
  -e deviceSerial "$(adb get-serialno)" \
  com.reampdf.mobile.test/com.reampdf.mobile.StoreScreenshotInstrumentation | tee "$output/instrumentation.txt"
grep -Fq 'REAM_CAPTURE_SUCCESS' "$output/instrumentation.txt"
