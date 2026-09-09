package com.reampdf.mobile;

import java.nio.ByteBuffer;
import org.junit.Test;
import static org.junit.Assert.*;

public class LumaPlaneTest {
    @Test public void copiesPackedReadOnlyPlaneWithoutChangingPosition() {
        ByteBuffer buffer = ByteBuffer.wrap(new byte[]{99,1,2,3,4,5,6}).asReadOnlyBuffer();
        buffer.position(1);
        byte[] output = new byte[6];
        LumaPlane.copy(buffer, 3, 2, 3, 1, output, new byte[0]);
        assertArrayEquals(new byte[]{1,2,3,4,5,6}, output); assertEquals(1, buffer.position());
    }
    @Test public void excludesRowPaddingAndAllowsUnpaddedLastRow() {
        ByteBuffer buffer = ByteBuffer.wrap(new byte[]{99,99,1,2,3,88,4,5,6}); buffer.position(2);
        byte[] output = new byte[6];
        LumaPlane.copy(buffer, 3, 2, 4, 1, output, new byte[0]);
        assertArrayEquals(new byte[]{1,2,3,4,5,6}, output); assertEquals(2, buffer.position());
    }
    @Test public void copiesStridedSamplesAndRejectsTruncatedBuffers() {
        ByteBuffer buffer = ByteBuffer.wrap(new byte[]{99,1,9,2,9,3,8,8,8,4,9,5,9,6}); buffer.position(1);
        byte[] output = new byte[6];
        LumaPlane.copy(buffer, 3, 2, 8, 2, output, new byte[5]);
        assertArrayEquals(new byte[]{1,2,3,4,5,6}, output);
        buffer.limit(13);
        assertThrows(IllegalArgumentException.class, () -> LumaPlane.copy(buffer, 3, 2, 8, 2, output, new byte[5]));
    }
}
