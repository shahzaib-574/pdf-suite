package com.reampdf.mobile;

import java.nio.ByteBuffer;

/** Copies only Y samples, respecting padding, pixel stride and buffer position. */
final class LumaPlane {
    static void copy(ByteBuffer source, int width, int height, int rowStride,
                     int pixelStride, byte[] destination, byte[] row) {
        long span = (long) (width - 1) * pixelStride + 1;
        long required = (long) (height - 1) * rowStride + span;
        if (width <= 0 || height <= 0 || pixelStride <= 0 || rowStride < span ||
            required > source.remaining() || (long) width * height > destination.length ||
            (pixelStride != 1 && span > row.length)) {
            throw new IllegalArgumentException("Invalid camera luminance plane");
        }
        ByteBuffer buffer = source.duplicate();
        int base = buffer.position();
        if (pixelStride == 1 && rowStride == width) {
            buffer.get(destination, 0, width * height);
            return;
        }
        for (int y = 0; y < height; y++) {
            buffer.position(base + y * rowStride);
            if (pixelStride == 1) buffer.get(destination, y * width, width);
            else {
                buffer.get(row, 0, (int) span);
                for (int x = 0; x < width; x++) destination[y * width + x] = row[x * pixelStride];
            }
        }
    }
    private LumaPlane() { }
}
