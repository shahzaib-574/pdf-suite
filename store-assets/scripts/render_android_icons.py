"""Generate legacy Android launcher sizes from the verified Play icon source."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, PngImagePlugin


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "store-assets" / "graphics" / "app-icon-512.png"
RES = ROOT / "android" / "app" / "src" / "main" / "res"
SIZES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}


def main() -> None:
    with Image.open(SOURCE) as original:
        source = original.convert("RGB")
        for density, size in SIZES.items():
            output_dir = RES / f"mipmap-{density}"
            output_dir.mkdir(parents=True, exist_ok=True)
            icon = source.resize((size, size), Image.Resampling.LANCZOS)
            metadata = PngImagePlugin.PngInfo()
            metadata.add(b"sRGB", b"\x00")
            for filename in ("ic_launcher.png", "ic_launcher_round.png"):
                target = output_dir / filename
                icon.save(target, "PNG", optimize=True, pnginfo=metadata)
                print(f"{target.relative_to(ROOT)}: {size}x{size} opaque sRGB")


if __name__ == "__main__":
    main()
