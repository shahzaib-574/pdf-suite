import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
const read = (file) => readFileSync(file, "utf8");
const forbidden =
  /@capacitor-community\/admob|capacitor-community-admob|com\.google\.android\.gms\.ads|com\.google\.android\.ump|ca-app-pub-|ACCESS_ADSERVICES_|com\.google\.android\.gms\.permission\.AD_ID/;
function check(label, contents) {
  assert(
    !forbidden.test(contents),
    `Advertising component remains in ${label}`,
  );
}
for (const file of [
  "package.json",
  "package-lock.json",
  "android/app/src/main/AndroidManifest.xml",
  "android/app/src/main/res/values/strings.xml",
  "android/capacitor.settings.gradle",
  "android/app/capacitor.build.gradle",
])
  check(file, read(file));
function scan(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (/\.(?:js|mjs|json|html)$/.test(file)) check(file, read(file));
  }
}
for (const dir of ["dist", "android/app/src/main/assets/public"]) {
  const metadata = JSON.parse(read(`${dir}/release-metadata.json`));
  assert.deepEqual(metadata, {
    schemaVersion: 3,
    mode: "production",
    advertising: false,
  });
  scan(dir);
}
const plugins = JSON.parse(
  read("android/app/src/main/assets/capacitor.plugins.json"),
);
assert(!plugins.some((plugin) => /admob/i.test(JSON.stringify(plugin))));
console.log(
  "AD_FREE_CHECK_OK dependencies native-registration manifest synchronized-web-assets",
);
