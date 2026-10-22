package com.reampdf.mobile;
import org.junit.Test;
import static org.junit.Assert.*;
public class ToolsBannerGestureTest {
    @Test public void physicalCoordinatesRemainStableWhenHostMoves() {
        ToolsBannerGesture g=new ToolsBannerGesture(8);g.update(ToolsBannerGesture.Action.DOWN,30,220,1);
        // Host Y moves 200→180, local touch would change20→41 despite a one-pixel physical move.
        assertEquals(ToolsBannerGesture.Ownership.AD,g.update(ToolsBannerGesture.Action.MOVE,30,221,1));
        assertEquals(ToolsBannerGesture.Ownership.WEBVIEW,g.update(ToolsBannerGesture.Action.MOVE,30,250,1));
        assertEquals(213,ToolsBannerGesture.screenToLocal(220,7),0); // Cached physical DOWN, not host's new origin.
        assertEquals(243,ToolsBannerGesture.screenToLocal(250,7),0);
    }
    @Test public void ordinarySuppressionPreservesOnlyActiveWebviewOwnedStream() {
        ToolsBannerGesture g=new ToolsBannerGesture(8);g.update(ToolsBannerGesture.Action.DOWN,10,10,1);g.update(ToolsBannerGesture.Action.MOVE,10,40,1);
        assertTrue(g.suppress(false));assertEquals(ToolsBannerGesture.Ownership.WEBVIEW,g.update(ToolsBannerGesture.Action.MOVE,10,70,1));
        assertEquals(ToolsBannerGesture.Ownership.WEBVIEW,g.update(ToolsBannerGesture.Action.UP,10,90,1));assertFalse(g.isActive());assertFalse(g.suppress(false));
    }
    @Test public void destructiveSuppressionAndAdOwnedSuppressionCancelOnce() {
        ToolsBannerGesture g=new ToolsBannerGesture(8);g.update(ToolsBannerGesture.Action.DOWN,10,10,1);assertFalse(g.suppress(false));assertTrue(g.consumeChildCancellation());assertFalse(g.suppress(false));assertFalse(g.consumeChildCancellation());
        g.update(ToolsBannerGesture.Action.DOWN,10,10,1);g.update(ToolsBannerGesture.Action.MOVE,10,40,1);assertFalse(g.suppress(true));assertFalse(g.isActive());assertEquals(ToolsBannerGesture.Ownership.CANCELLED,g.update(ToolsBannerGesture.Action.UP,10,90,1));
    }
    @Test public void verticalDragCancelsChildBeforeWebviewOwnership() {
        ToolsBannerGesture g=new ToolsBannerGesture(8);assertEquals(ToolsBannerGesture.Ownership.AD,g.update(ToolsBannerGesture.Action.DOWN,10,10,1));
        assertEquals(ToolsBannerGesture.Ownership.WEBVIEW,g.update(ToolsBannerGesture.Action.MOVE,12,30,1));
        assertTrue(g.consumeChildCancellation());assertFalse(g.consumeChildCancellation());
    }
    @Test public void tapNeverTransfersToUnderlyingControl() {
        ToolsBannerGesture g=new ToolsBannerGesture(8);g.update(ToolsBannerGesture.Action.DOWN,10,10,1);
        assertEquals(ToolsBannerGesture.Ownership.AD,g.update(ToolsBannerGesture.Action.UP,10,10,1));assertFalse(g.consumeChildCancellation());
    }
    @Test public void multipointerCancelsHandoff() {
        ToolsBannerGesture g=new ToolsBannerGesture(8);g.update(ToolsBannerGesture.Action.DOWN,10,10,1);
        assertEquals(ToolsBannerGesture.Ownership.CANCELLED,g.update(ToolsBannerGesture.Action.MOVE,10,30,2));assertTrue(g.consumeChildCancellation());
    }
    @Test public void horizontalInteractionDoesNotBecomeScroll() {
        ToolsBannerGesture g=new ToolsBannerGesture(8);g.update(ToolsBannerGesture.Action.DOWN,10,10,1);
        assertEquals(ToolsBannerGesture.Ownership.AD,g.update(ToolsBannerGesture.Action.MOVE,30,12,1));
    }
    @Test public void completedAdTapHasNoLiveStreamOrSpuriousCancellation() {
        ToolsBannerGesture g=new ToolsBannerGesture(8);g.update(ToolsBannerGesture.Action.DOWN,10,10,1);assertTrue(g.isActive());
        assertEquals(ToolsBannerGesture.Ownership.AD,g.update(ToolsBannerGesture.Action.UP,10,10,1));assertFalse(g.isActive());
        g.update(ToolsBannerGesture.Action.CANCEL,10,10,1);assertFalse(g.consumeChildCancellation());
    }
    @Test public void cancellingLiveStreamProducesCancellationOnlyOnce() {
        ToolsBannerGesture g=new ToolsBannerGesture(8);g.update(ToolsBannerGesture.Action.DOWN,10,10,1);
        g.update(ToolsBannerGesture.Action.CANCEL,10,10,1);assertTrue(g.consumeChildCancellation());assertFalse(g.isActive());
        g.update(ToolsBannerGesture.Action.CANCEL,10,10,1);assertFalse(g.consumeChildCancellation());
    }
}
