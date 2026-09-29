#!/usr/bin/env bash
set -euo pipefail

apk="${1:-android/app/build/outputs/apk/release/app-release.apk}"
: "${GITHUB_SHA:?GITHUB_SHA is required for exact 16 KB smoke provenance}"
test -f "$apk"

page_size="$(adb shell getconf PAGE_SIZE | tr -d '\r')"
if [[ "$page_size" != "16384" ]]; then
  echo "Expected a 16384-byte emulator page size, got: $page_size" >&2
  exit 1
fi

abi_list="$(adb shell getprop ro.product.cpu.abilist | tr -d '\r')"
if [[ "$abi_list" != *x86_64* && "$abi_list" != *arm64-v8a* ]]; then
  echo "Expected a 64-bit emulator ABI, got: $abi_list" >&2
  exit 1
fi

output=tmp/16k-smoke
mkdir -p "$output"
collect_diagnostics() {
  adb logcat -b crash -d > "$output/crash-buffer.txt" || true
  adb logcat -b main -b crash -d -v threadtime > "$output/logcat.txt" || true
  adb shell dumpsys activity exit-info com.reampdf.mobile > "$output/exit-info.txt" || true
}
on_exit() {
  status="$?"
  trap - EXIT
  collect_diagnostics
  exit "$status"
}
trap on_exit EXIT
adb uninstall com.reampdf.mobile >/dev/null 2>&1 || true
adb logcat -b crash -c || true
(cd android && ./gradlew --no-daemon :app:installRelease :app:installReleaseAndroidTest -PcaptureStoreScreenshots=true)
set +e
adb shell am instrument -w -r \
  -e mode 16kSmoke \
  -e sourceCommit "$GITHUB_SHA" \
  com.reampdf.mobile.test/com.reampdf.mobile.StoreScreenshotInstrumentation | tee "$output/instrumentation.txt"
instrument_status="${PIPESTATUS[0]}"
set -e
if (( instrument_status != 0 )) || ! grep -Fq 'REAM_16K_SMOKE_SUCCESS' "$output/instrumentation.txt"; then
  collect_diagnostics
  echo "16 KB instrumentation failed (adb status $instrument_status)." >&2
  cat "$output/crash-buffer.txt" >&2
  exit 1
fi

adb shell am force-stop com.reampdf.mobile
adb shell am start -W -n com.reampdf.mobile/.MainActivity > "$output/restart.txt"
for delay in 0 5; do
  sleep "$delay"
  adb shell pidof com.reampdf.mobile | grep -Eq '[0-9]'
  adb shell uiautomator dump /sdcard/ream-16k-window.xml >/dev/null
  adb shell cat /sdcard/ream-16k-window.xml > "$output/window-${delay}.xml"
  grep -Eq 'Merge PDFs|PDF to Word|Scan' "$output/window-${delay}.xml"
done

collect_diagnostics
if grep -Fq 'Process: com.reampdf.mobile' "$output/crash-buffer.txt"; then
  echo 'Ream emitted an app-scoped fatal exception during the 16 KB smoke.' >&2
  cat "$output/crash-buffer.txt" >&2
  exit 1
fi

echo "REAM_16K_SMOKE_OK pageSize=$page_size abi=$abi_list flow=pdf-reader+native-camera stableSeconds=5"
