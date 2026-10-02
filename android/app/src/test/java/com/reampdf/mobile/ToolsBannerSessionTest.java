package com.reampdf.mobile;
import org.junit.Test;
import static org.junit.Assert.*;
public class ToolsBannerSessionTest {
    @Test public void scrollUpdatesDoNotIncrementRequests() {
        ToolsBannerSession s=new ToolsBannerSession(); assertTrue(s.begin(1,100,0));
        for(int i=1;i<=100;i++){assertTrue(s.accept(1,i));assertFalse(s.begin(1,100,i));}
        assertEquals(1,s.requestCount());
    }
    @Test public void noFillRequiresNewGenerationAndSixtySecondBackoff() {
        ToolsBannerSession s=new ToolsBannerSession(); s.begin(1,100,0); s.failed(1,0);
        assertFalse(s.mayRetry(59999)); assertTrue(s.mayRetry(60000));
        assertFalse(s.begin(1,100,60000)); assertTrue(s.begin(2,100,60000));
    }
    @Test public void retiredGenerationCannotAcceptLateMeasurement() {
        ToolsBannerSession s=new ToolsBannerSession();s.begin(1,100,0);s.retire(1);s.begin(2,100,0);
        assertFalse(s.accept(1,99));assertTrue(s.accept(2,1));
    }
    @Test public void invalidGenerationAndWidthCannotRequest() {
        ToolsBannerSession s=new ToolsBannerSession();assertFalse(s.begin(0,100,0));assertFalse(s.begin(1,0,0));assertEquals(0,s.requestCount());
    }
    @Test public void nativeAllocatedGenerationsNeverCollideAcrossControllersAndReloads() {
        ToolsBannerSession s=new ToolsBannerSession();long a=s.allocateGeneration(),b=s.allocateGeneration();
        assertEquals(1,a);assertEquals(2,b);assertTrue(s.begin(a,100,0));s.retire(a);
        long remount=s.allocateGeneration();assertEquals(3,remount);assertTrue(s.begin(remount,100,0));
        assertFalse(s.current(a));assertFalse(s.current(remount+100));assertTrue(s.current(remount));
        assertFalse(s.issued(remount+100));assertTrue(s.issued(remount));
    }
    @Test public void rejectedCurrentGeometryNeedsFreshMonotonicAck() {
        ToolsBannerSession s=new ToolsBannerSession();s.begin(1,100,0);s.accept(1,1);
        assertTrue(s.geometryAcknowledged(1));s.invalidateGeometry(1);assertFalse(s.geometryAcknowledged(1));
        assertFalse(s.accept(1,1));assertFalse(s.geometryAcknowledged(1));
        assertTrue(s.accept(1,2));assertTrue(s.geometryAcknowledged(1));
        s.invalidateGeometry(99);assertTrue(s.geometryAcknowledged(1));
    }
    @Test public void persistentGeometryFailureCollapsesOnlyCurrentOwnerAfterOneSecond() {
        ToolsBannerSession s=new ToolsBannerSession();s.begin(1,100,0);s.accept(1,1);s.geometryFailed(1,100);
        assertFalse(s.shouldCollapseGeometry(1,1099));assertTrue(s.shouldCollapseGeometry(1,1100));
        s.accept(1,2);assertFalse(s.shouldCollapseGeometry(1,9000));
        s.geometryFailed(99,9000);assertTrue(s.geometryAcknowledged(1));
    }
}
