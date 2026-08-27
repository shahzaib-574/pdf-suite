"""Render and validate the source-controlled Google Play graphics."""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, PngImagePlugin


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "store-assets" / "graphics" / "source"
OUTPUT = ROOT / "store-assets" / "graphics"


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


def render(source: str, output: str, size: tuple[int, int], mode: str) -> None:
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


def main() -> None:
    render("app-icon.svg", "app-icon-512.png", (512, 512), "RGBA")
    render(
        "feature-graphic.svg",
        "feature-graphic-1024x500.png",
        (1024, 500),
        "RGB",
    )


if __name__ == "__main__":
    main()
