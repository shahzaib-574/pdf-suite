"""Validate native framebuffer captures and losslessly save opaque RGB PNGs."""
import hashlib
import json
import pathlib
import re
import subprocess
import sys
from apksigner_certificate import require_certificate_sha256, sanitized_certificate_output
from PIL import Image

root = pathlib.Path(sys.argv[1]).resolve()
manifest_path = root / "capture-provenance.json"
manifest = json.loads(manifest_path.read_text())
assert manifest["schemaVersion"] == 2
assert manifest["sourceCommit"] == sys.argv[3]
assert re.fullmatch(r"[0-9a-f]{40}", manifest["sourceCommit"])
assert manifest["artifactMode"] == "signed-release-google-test-ads"
assert manifest["packageName"] == "com.reampdf.mobile"
assert manifest["androidApiLevel"] == 36
assert len(manifest["screenshots"]) >= 4
release = pathlib.Path("android/variables.gradle").read_text()
assert manifest["versionCode"] == int(re.search(r"appVersionCode\s*=\s*(\d+)", release).group(1))
assert manifest["versionName"] == re.search(r"appVersionName\s*=\s*'([^']+)'", release).group(1)
assert manifest["serial"].startswith("emulator-")
assert manifest["installedApkSha256"] == hashlib.sha256(pathlib.Path(sys.argv[2]).read_bytes()).hexdigest()
signer_result = subprocess.run(
    [sys.argv[4], "verify", "--print-certs", sys.argv[2]],
    check=False,
    capture_output=True,
    text=True,
)
signer_output = signer_result.stdout + "\n" + signer_result.stderr
try:
    if signer_result.returncode != 0:
        raise ValueError(f"apksigner verify failed with exit code {signer_result.returncode}")
    require_certificate_sha256(signer_output, manifest["signingCertificateSha256"])
except ValueError as failure:
    print("apksigner certificate output (sanitized):\n" + sanitized_certificate_output(signer_output), file=sys.stderr)
    raise AssertionError(str(failure)) from failure
assert manifest["adConfiguration"]["provider"] == "google-admob"
monetization = json.loads(pathlib.Path("monetization.config.json").read_text())
assert manifest["adConfiguration"]["appId"] == monetization["admobAppId"]
assert manifest["adConfiguration"]["bannerId"] == "ca-app-pub-3940256099942544/9214589741"
assert manifest["adConfiguration"]["isTesting"] is True
assert manifest["adConfiguration"]["debugGeography"] == "OTHER"
for record in manifest["screenshots"]:
    image_path = root / record["fileName"]
    assert image_path.parent == root and image_path.suffix == ".png"
    source_hash = hashlib.sha256(image_path.read_bytes()).hexdigest()
    assert source_hash == record["sha256"]
    with Image.open(image_path) as image:
        assert image.size == (1080, 1920)
        if "A" in image.getbands():
            assert image.getchannel("A").getextrema() == (255, 255)
        rgb = image.convert("RGB")
        rgb.save(image_path, format="PNG")
    record["sourceFramebufferPngSha256"] = source_hash
    record["sha256"] = hashlib.sha256(image_path.read_bytes()).hexdigest()
manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
print(f"Verified {len(manifest['screenshots'])} real release screenshots with native 1080x1920 pixels.")
