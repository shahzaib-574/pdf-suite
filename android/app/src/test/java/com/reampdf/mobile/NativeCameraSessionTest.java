package com.reampdf.mobile;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;
import static org.junit.Assert.*;
public class NativeCameraSessionTest {
    @Test public void cancelBeforeActivityAttachClosesWhenItAppears(){NativeCameraSession s=new NativeCameraSession();s.cancel("");AtomicInteger closes=new AtomicInteger();s.attach(closes::incrementAndGet);assertEquals(1,closes.get());assertTrue(s.isCancelled());}
    @Test public void oldActivityCannotDetachNewActivityAndCancellationClosesOnce(){NativeCameraSession s=new NativeCameraSession();AtomicInteger old=new AtomicInteger(),fresh=new AtomicInteger();Runnable a=old::incrementAndGet,b=fresh::incrementAndGet;s.attach(a);s.attach(b);s.detach(a);s.cancel("Camera restarted during capture.");s.cancel("");assertEquals(0,old.get());assertEquals(1,fresh.get());assertEquals("Camera restarted during capture.",s.reason());}
    @Test public void finishedSessionCannotBeCancelledAgain(){NativeCameraSession s=new NativeCameraSession();AtomicInteger closes=new AtomicInteger();s.attach(closes::incrementAndGet);s.finish();s.cancel("");assertEquals(0,closes.get());assertFalse(s.isCancelled());}
}
