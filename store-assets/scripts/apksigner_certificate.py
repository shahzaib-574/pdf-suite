"""Fail-closed extraction of an APK signer's certificate SHA-256 digest."""
import argparse
import pathlib
import re
import sys


CERTIFICATE_SHA256_RE = re.compile(
    r"^(?:Signer #\d+|V\d+ Signer:) certificate SHA-256 digest:\s*([0-9a-f:]+)\s*$",
    re.I | re.M,
)


def normalize_sha256(value):
    if re.fullmatch(r"[0-9a-f]{64}", value, re.I):
        return value.lower()
    if re.fullmatch(r"(?:[0-9a-f]{2}:){31}[0-9a-f]{2}", value, re.I):
        return value.replace(":", "").lower()
    raise ValueError("certificate SHA-256 digest must be 64 hex characters, optionally byte-separated by colons")


def require_certificate_sha256(output, expected=None):
    digests = {normalize_sha256(match) for match in CERTIFICATE_SHA256_RE.findall(output)}
    if len(digests) != 1:
        raise ValueError(f"expected exactly one distinct certificate SHA-256 digest, found {len(digests)}")
    actual = next(iter(digests))
    if expected is not None and actual != normalize_sha256(expected):
        raise ValueError("APK certificate SHA-256 digest does not match expected provenance")
    return actual


def sanitized_certificate_output(output):
    sanitized = re.sub(
        r"(?im)^((?:Signer #\d+|V\d+ Signer:) certificate DN:).*$",
        r"\1 [redacted]",
        output,
    )
    return "".join(character if character.isprintable() or character in "\r\n\t" else "?" for character in sanitized)[:4000]


def self_test():
    digest = "47af4be263f6bfb63065ba344d1c14096320308c75c55cc40acaee430c82063a"
    numbered_shape = f"""Signer #1 certificate DN: CN=Release
Signer #1 certificate SHA-256 digest: {digest}
Signer #1 certificate SHA-1 digest: 0123456789abcdef0123456789abcdef01234567
Signer #1 certificate MD5 digest: 0123456789abcdef0123456789abcdef
"""
    versioned_shape = numbered_shape.replace("Signer #1", "V2 Signer:")
    assert require_certificate_sha256(numbered_shape, digest) == digest
    assert require_certificate_sha256(versioned_shape, digest) == digest
    assert require_certificate_sha256(numbered_shape + numbered_shape, digest) == digest
    failures = [
        ("Signer #1 public key SHA-256 digest: " + digest, digest),
        ("Signer #1 certificate SHA-256 digest: " + digest[:-1], digest),
        ("Signer #1 certificate SHA-256 digest: " + digest[:2] + "::" + digest[2:], digest),
        (numbered_shape, "0" * 64),
        (numbered_shape + "V3 Signer: certificate SHA-256 digest: " + "1" * 64, digest),
    ]
    for output, expected in failures:
        try:
            require_certificate_sha256(output, expected)
        except ValueError:
            continue
        raise AssertionError("certificate digest verifier accepted invalid evidence")
    print("APK signer certificate verifier self-test passed.")


def main(argv):
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--self-test", action="store_true")
    mode.add_argument("--extract", type=pathlib.Path, metavar="OUTPUT_FILE")
    args = parser.parse_args(argv)
    if args.self_test:
        self_test()
        return 0
    output = args.extract.read_text(encoding="utf-8", errors="replace")
    try:
        print(require_certificate_sha256(output))
    except ValueError as failure:
        print("apksigner certificate output (sanitized):\n" + sanitized_certificate_output(output), file=sys.stderr)
        print(f"error: {failure}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
