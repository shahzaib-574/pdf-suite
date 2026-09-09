#!/usr/bin/env bash
set -euo pipefail
collect_evidence() {
  mkdir -p tmp/edge-checks
  adb logcat -d -s System.out:I '*:S' | tee tmp/edge-checks/benchmarks.txt || true
  adb pull /sdcard/Android/data/com.reampdf.mobile/files/edge-checks/. tmp/edge-checks/ || true
}
trap collect_evidence EXIT
(cd android && ./gradlew --no-daemon :app:connectedDebugAndroidTest)
