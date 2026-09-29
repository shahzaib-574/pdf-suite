"""Validate native framebuffer captures and losslessly save opaque RGB PNGs."""
import hashlib
import json
import pathlib
import re
import subprocess
import sys
from PIL import Image


CERTIFICATE_SHA256_RE = re.compile(
    r"^Signer #\d+ certificate SHA-256 digest:\s*([0-9a-f:]+)\s*$",
    re.I | re.M,
)


def normalize_sha256(value):
    if re.fullmatch(r"[0-9a-f]{64}", value, re.I):
        return value.lower()
    if re.fullmatch(r"(?:[0-9a-f]{2}:){31}[0-9a-f]{2}", value, re.I):
        return value.replace(":", "").lower()
    raise ValueError("certificate SHA-256 digest must be 64 hex characters, optionally byte-separated by colons")


def require_certificate_sha256(output, expected):
    digests = {normalize_sha256(match) for match in CERTIFICATE_SHA256_RE.findall(output)}
    if len(digests) != 1:
        raise ValueError(f"expected exactly one distinct certificate SHA-256 digest, found {len(digests)}")
    actual = next(iter(digests))
    if actual != normalize_sha256(expected):
        raise ValueError("APK certificate SHA-256 digest does not match capture provenance")
    return actual


def sanitized_certificate_output(output):
    sanitized = re.sub(
        r"(?im)^(Signer #\d+ certificate DN:).*$",
        r"\1 [redacted]",
        output,
    )
    return "".join(character if character.isprintable() or character in "\r\n\t" else "?" for character in sanitized)[:4000]


def self_test():
    digest = "47af4be263f6bfb63065ba344d1c14096320308c75c55cc40acaee430c82063a"
    observed_shape = f"""Signer #1 certificate DN: CN=Release
Signer #1 certificate SHA-256 digest: {digest}
Signer #1 certificate SHA-1 digest: 0123456789abcdef0123456789abcdef01234567
Signer #1 certificate MD5 digest: 0123456789abcdef0123456789abcdef
"""
    assert require_certificate_sha256(observed_shape, digest) == digest
    assert require_certificate_sha256(observed_shape + observed_shape, digest) == digest
    failures = [
        ("Signer #1 public key SHA-256 digest: " + digest, digest),
        ("Signer #1 certificate SHA-256 digest: " + digest[:-1], digest),
        ("Signer #1 certificate SHA-256 digest: " + digest[:2] + "::" + digest[2:], digest),
        (observed_shape, "0" * 64),
        (observed_shape + "Signer #2 certificate SHA-256 digest: " + "1" * 64, digest),
    ]
    for output, expected in failures:
        try:
            require_certificate_sha256(output, expected)
        except ValueError:
            continue
        raise AssertionError("certificate digest verifier accepted invalid evidence")
    print("Screenshot signer verifier self-test passed.")


if sys.argv[1:] == ["--self-test"]:
    self_test()
    raise SystemExit(0)

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
