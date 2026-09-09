#!/usr/bin/env bash
set -euo pipefail
output=store-assets/screenshots/release-capture
mkdir -p "$output"
collect_diagnostics() {
  adb logcat -d > "$output/logcat.txt" || true
  adb pull /sdcard/Android/data/com.reampdf.mobile/files/store-screenshots/. "$output/" || true
}
trap collect_diagnostics EXIT
(cd android && ./gradlew --no-daemon :app:installRelease :app:installReleaseAndroidTest -PcaptureStoreScreenshots=true)
adb shell am instrument -w -r \
  -e captureStoreScreenshots true \
  -e deviceSerial "$(adb get-serialno)" \
  com.reampdf.mobile.test/com.reampdf.mobile.StoreScreenshotInstrumentation | tee "$output/instrumentation.txt"
grep -Fq 'REAM_CAPTURE_SUCCESS' "$output/instrumentation.txt"
