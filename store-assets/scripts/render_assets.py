"""Render and validate the source-controlled Google Play graphics."""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageCms, PngImagePlugin


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "store-assets" / "graphics" / "source"
OUTPUT = ROOT / "store-assets" / "graphics"
JPEG_QUALITY = 95


def deterministic_srgb_profile() -> bytes:
    profile = bytearray(ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes())
    # Little CMS stamps generated profiles with the current time. Normalize the
    # ICC header's creation date so otherwise identical renders are byte-stable.
    for offset, value in zip(range(24, 36, 2), (2000, 1, 1, 0, 0, 0), strict=True):
        profile[offset : offset + 2] = value.to_bytes(2, "big")
    return bytes(profile)


SRGB_PROFILE = deterministic_srgb_profile()


def find_chrome() -> Path:
    configured = os.environ.get("CHROME_PATH")
    candidates = [
        Path(configured) if configured else None,
        Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
        Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
    ]
    discovered = shutil.which("google-chrome") or shutil.which("chrome")
    if discovered:
        candidates.append(Path(discovered))
    for candidate in candidates:
        if candidate and candidate.is_file():
            return candidate
    raise RuntimeError("Chrome was not found. Set CHROME_PATH to its executable.")


def save_jpeg(image: Image.Image, output: str, size: tuple[int, int]) -> None:
    output_path = OUTPUT / output
    image.convert("RGB").save(
        output_path,
        "JPEG",
        quality=JPEG_QUALITY,
        subsampling=0,
        optimize=False,
        progressive=False,
        icc_profile=SRGB_PROFILE,
    )

    with Image.open(output_path) as saved:
        if saved.format != "JPEG" or saved.size != size or saved.mode != "RGB":
            raise RuntimeError(
                f"{output} saved as {saved.format} {saved.size} {saved.mode}, "
                f"expected JPEG {size} RGB"
            )
        if not saved.info.get("icc_profile"):
            raise RuntimeError(f"{output} is missing its embedded sRGB profile")

    size_bytes = output_path.stat().st_size
    if output == "feature-graphic-1024x500.jpg" and size_bytes > 15 * 1024 * 1024:
        raise RuntimeError(f"{output} exceeds Google Play's 15 MB limit")
    print(
        f"{output}: {size[0]}x{size[1]} RGB JPEG, quality {JPEG_QUALITY}, "
        f"{size_bytes:,} bytes, embedded sRGB"
    )


def render(
    source: str,
    output: str,
    size: tuple[int, int],
    mode: str,
    jpeg_output: str | None = None,
) -> None:
    chrome = find_chrome()
    source_path = SOURCE / source
    output_path = OUTPUT / output
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="ream-store-assets-") as profile:
        subprocess.run(
            [
                str(chrome),
                "--headless=new",
                "--disable-gpu",
                "--disable-lcd-text",
                "--hide-scrollbars",
                "--allow-file-access-from-files",
                "--force-color-profile=srgb",
                "--force-device-scale-factor=1",
                f"--user-data-dir={profile}",
                f"--window-size={size[0]},{size[1]}",
                f"--screenshot={output_path}",
                source_path.as_uri(),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    with Image.open(output_path) as rendered:
        if rendered.size != size:
            raise RuntimeError(f"{output} rendered at {rendered.size}, expected {size}")
        normalized = rendered.convert(mode)
        if mode == "RGBA":
            alpha = normalized.getchannel("A")
            if alpha.getextrema() != (255, 255):
                raise RuntimeError(f"{output} contains transparent pixels")
        png_info = PngImagePlugin.PngInfo()
        png_info.add(b"sRGB", b"\x00")
        normalized.save(output_path, "PNG", compress_level=9, pnginfo=png_info)

    with Image.open(output_path) as saved:
        if saved.size != size or saved.mode != mode:
            raise RuntimeError(
                f"{output} saved as {saved.size} {saved.mode}, expected {size} {mode}"
            )
        if saved.info.get("srgb") != 0:
            raise RuntimeError(f"{output} is missing its standard sRGB declaration")
        if mode == "RGBA" and saved.getchannel("A").getextrema() != (255, 255):
            raise RuntimeError(f"{output} contains transparent pixels after saving")

    size_bytes = output_path.stat().st_size
    if output == "app-icon-512.png" and size_bytes > 1024 * 1024:
        raise RuntimeError(f"{output} exceeds Google Play's 1 MB limit")
    print(f"{output}: {size[0]}x{size[1]} {mode}, {size_bytes:,} bytes, opaque sRGB")

    if jpeg_output:
        save_jpeg(normalized, jpeg_output, size)


def main() -> None:
    render(
        "app-icon.svg",
        "app-icon-512.png",
        (512, 512),
        "RGBA",
        jpeg_output="app-logo-512.jpg",
    )
    render(
        "feature-graphic.svg",
        "feature-graphic-1024x500.png",
        (1024, 500),
        "RGB",
        jpeg_output="feature-graphic-1024x500.jpg",
    )


if __name__ == "__main__":
    main()
