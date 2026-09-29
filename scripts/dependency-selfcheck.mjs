import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const xcode = require("xcode");
const temporaryDirectory = mkdtempSync(
  path.join(tmpdir(), "ream-xcode-compat-"),
);
let generated;
try {
  const fixturePath = path.join(temporaryDirectory, "project.pbxproj");
  writeFileSync(
    fixturePath,
    `// !$*UTF8*$!
{
  archiveVersion = 1;
  classes = {};
  objectVersion = 46;
  objects = {
/* Begin PBXGroup section */
    000000000000000000000001 /* Root */ = { isa = PBXGroup; children = (); sourceTree = "<group>"; };
/* End PBXGroup section */
  };
  rootObject = 000000000000000000000001 /* Root */;
}
`,
  );
  const project = xcode.project(fixturePath).parseSync();
  generated = project.generateUuid();
  assert.match(
    generated,
    /^[0-9A-F]{24}$/,
    "xcode must generate a 24-character PBX UUID with the patched uuid package",
  );
  assert.match(
    project.writeSync(),
    /rootObject = 000000000000000000000001 \/\* Root \*\//,
    "xcode must parse and write a PBX project with the patched uuid package",
  );
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

const lock = require("../package-lock.json");
const cli = lock.packages?.["node_modules/@capacitor/cli"]?.version;
const core = lock.packages?.["node_modules/@capacitor/core"]?.version;
const android = lock.packages?.["node_modules/@capacitor/android"]?.version;
assert.equal(cli, core, "Capacitor CLI and core must stay on the same version");
assert.equal(
  android,
  core,
  "Capacitor Android and core must stay on the same version",
);

console.log(
  `DEPENDENCY_SELFCHECK_OK capacitor=${core} xcode-uuid=${generated.length}`,
);
