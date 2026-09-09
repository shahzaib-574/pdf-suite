/** Read only the bounded EXIF orientation tag; never decode/recompress the camera JPEG. */
export function jpegOrientation(bytes: Uint8Array): number {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1]!;
    if (marker === 0xda || marker === 0xd9) break;
    const size = view.getUint16(offset + 2);
    const end = offset + 2 + size;
    if (size < 2 || end > bytes.length) return 1;
    if (marker === 0xe1 && size >= 16 && view.getUint32(offset + 4) === 0x45786966 && view.getUint16(offset + 8) === 0) {
      const tiff = offset + 10;
      const order = view.getUint16(tiff);
      if (order !== 0x4949 && order !== 0x4d4d) return 1;
      const little = order === 0x4949;
      if (view.getUint16(tiff + 2, little) !== 42) return 1;
      const directory = tiff + view.getUint32(tiff + 4, little);
      if (directory < tiff + 8 || directory + 2 > end) return 1;
      const count = view.getUint16(directory, little);
      for (let i = 0; i < count; i++) {
        const entry = directory + 2 + i * 12;
        if (entry + 12 > end) return 1;
        if (view.getUint16(entry, little) !== 0x0112) continue;
        if (view.getUint16(entry + 2, little) !== 3 || view.getUint32(entry + 4, little) !== 1) return 1;
        const orientation = view.getUint16(entry + 8, little);
        return orientation >= 1 && orientation <= 8 ? orientation : 1;
      }
    }
    offset = end;
  }
  return 1;
}

/** PDF uses a bottom-left origin. These matrices map encoded pixels to upright display. */
export function orientedImageMatrix(orientation: number, x: number, y: number, width: number, height: number): [number, number, number, number, number, number] {
  switch (orientation) {
    case 2: return [-width, 0, 0, height, x + width, y];
    case 3: return [-width, 0, 0, -height, x + width, y + height];
    case 4: return [width, 0, 0, -height, x, y + height];
    case 5: return [0, -height, -width, 0, x + width, y + height];
    case 6: return [0, -height, width, 0, x, y + height];
    case 7: return [0, height, width, 0, x, y];
    case 8: return [0, height, -width, 0, x + width, y];
    default: return [width, 0, 0, height, x, y];
  }
}
