package com.reampdf.mobile;

import org.junit.Test;
import static org.junit.Assert.*;

public class ToolsBannerGeometryTest {
    @Test public void horizontalSystemInsetsRespectBothSidesAndParentOrigins() {
        ToolsBannerGeometry.NativeViewport v=new ToolsBannerGeometry.NativeViewport(10,20,800,400,1,0,0,90,760,20,420,false,false,0);
        assertFalse(ToolsBannerGeometry.map(new ToolsBannerGeometry.Snapshot(1,1,20,50,300,50,800,400,1,0,0,true),v).visible);
        assertTrue(ToolsBannerGeometry.map(new ToolsBannerGeometry.Snapshot(1,1,80,50,300,50,800,400,1,0,0,true),v).visible);
        assertFalse(ToolsBannerGeometry.map(new ToolsBannerGeometry.Snapshot(1,1,460,50,300,50,800,400,1,0,0,true),v).visible);
        ToolsBannerGeometry.NativeViewport portrait=new ToolsBannerGeometry.NativeViewport(5,7,400,800,2,0,0,5,405,7,807,false,false,0);
        assertTrue(ToolsBannerGeometry.map(sample(20),portrait).visible);
    }
    private ToolsBannerGeometry.Snapshot sample(double y) {
        return new ToolsBannerGeometry.Snapshot(1, 1, 10, y, 100, 50, 200, 400, 1, 0, 0, true);
    }
    private ToolsBannerGeometry.NativeViewport viewport(boolean ime, boolean scrolling, long age) {
        return new ToolsBannerGeometry.NativeViewport(5, 7, 400, 800, 2, 0, 0, 0, 700, ime, scrolling, age);
    }
    @Test public void mapsCssAtDifferentDensitiesWithoutDoubleInsets() {
        ToolsBannerGeometry.Decision d = ToolsBannerGeometry.map(sample(20), viewport(false, false, 0));
        assertTrue(d.visible); assertEquals(25, d.xPx); assertEquals(47, d.yPx);
        assertEquals(200, d.widthPx); assertEquals(100, d.heightPx); assertEquals(50, d.heightCss, 0);
    }
    @Test public void hidesWhenCreativeNotFullyInsideSafeViewport() {
        assertFalse(ToolsBannerGeometry.map(sample(340), viewport(false, false, 0)).visible);
        assertFalse(ToolsBannerGeometry.map(sample(-1), viewport(false, false, 0)).visible);
    }
    @Test public void rejectsNaNUnknownScaleAndStaleSequence() {
        assertFalse(ToolsBannerGeometry.map(sample(Double.NaN), viewport(false, false, 0)).valid);
        ToolsBannerGeometry.Snapshot zoomed = new ToolsBannerGeometry.Snapshot(1,1,10,20,100,50,200,400,2,0,0,true);
        assertFalse(ToolsBannerGeometry.map(zoomed, viewport(false,false,0)).valid);
        ToolsBannerSession s = new ToolsBannerSession(); s.begin(1,100,0);
        assertTrue(s.accept(1,2)); assertFalse(s.accept(1,1));
    }
    @Test public void idleSampleDoesNotExpire() {
        assertTrue(ToolsBannerGeometry.map(sample(20), viewport(false, false, 100000)).visible);
        assertFalse(ToolsBannerGeometry.map(sample(20), viewport(false, true, 51)).visible);
    }
    @Test public void imeAndRetiredGenerationAreNonInteractive() {
        assertFalse(ToolsBannerGeometry.map(sample(20), viewport(true,false,0)).visible);
        ToolsBannerSession s = new ToolsBannerSession(); s.begin(1,100,0); s.retire(1);
        assertFalse(s.accept(1,2)); assertFalse(s.begin(1,100,100));
    }
    @Test public void nativeScrollDeltaMovesFrameWithoutChangingCreativeSize() {
        ToolsBannerGeometry.NativeViewport v = new ToolsBannerGeometry.NativeViewport(5,7,400,800,2,0,20,0,700,false,false,0);
        ToolsBannerGeometry.Decision d=ToolsBannerGeometry.map(sample(20),v);
        assertEquals(27,d.yPx); assertEquals(100,d.heightPx);
    }
    @Test public void rejectsInvalidDensityViewportAndOversizedAd() {
        assertFalse(ToolsBannerGeometry.map(sample(20),new ToolsBannerGeometry.NativeViewport(0,0,0,800,0,0,0,0,700,false,false,0)).valid);
        assertFalse(ToolsBannerGeometry.map(new ToolsBannerGeometry.Snapshot(1,1,0,0,100,101,200,400,1,0,0,true),viewport(false,false,0)).valid);
    }
    private ToolsBannerGeometry.Snapshot full(ToolsBannerGeometry.Rect creative,double reserved,ToolsBannerGeometry.Rect[] occlusions,double vw,double vh) {
        return new ToolsBannerGeometry.Snapshot(1,1,new ToolsBannerGeometry.Rect(10,20,100,80),creative,200,400,1,0,0,vw,vh,0,0,reserved,true,occlusions);
    }
    @Test public void creativeMustFitReservedSlotAndMatchingHeight() {
        ToolsBannerGeometry.Rect creative=new ToolsBannerGeometry.Rect(10,40,100,50);
        assertTrue(ToolsBannerGeometry.map(full(creative,80,new ToolsBannerGeometry.Rect[0],200,400),viewport(false,false,0)).visible);
        assertFalse(ToolsBannerGeometry.map(full(creative,70,new ToolsBannerGeometry.Rect[0],200,400),viewport(false,false,0)).valid);
        assertFalse(ToolsBannerGeometry.map(full(new ToolsBannerGeometry.Rect(5,40,100,50),80,new ToolsBannerGeometry.Rect[0],200,400),viewport(false,false,0)).valid);
    }
    @Test public void occludedCreativeIsValidButNotVisible() {
        ToolsBannerGeometry.Decision d=ToolsBannerGeometry.map(full(new ToolsBannerGeometry.Rect(10,40,100,50),80,new ToolsBannerGeometry.Rect[]{new ToolsBannerGeometry.Rect(0,80,200,20)},200,400),viewport(false,false,0));
        assertTrue(d.valid);assertFalse(d.visible);
    }
    @Test public void malformedVisualAndOcclusionCannotBeAcknowledged() {
        ToolsBannerGeometry.Rect c=new ToolsBannerGeometry.Rect(10,40,100,50);
        assertFalse(ToolsBannerGeometry.map(full(c,80,new ToolsBannerGeometry.Rect[0],Double.NaN,400),viewport(false,false,0)).valid);
        assertFalse(ToolsBannerGeometry.map(full(c,80,new ToolsBannerGeometry.Rect[0],180,400),viewport(false,false,0)).valid);
        assertFalse(ToolsBannerGeometry.map(full(c,80,new ToolsBannerGeometry.Rect[]{new ToolsBannerGeometry.Rect(0,Double.POSITIVE_INFINITY,100,10)},200,400),viewport(false,false,0)).valid);
    }
    @Test public void nativeSystemBarBoundsClipWithoutAddingInsetsToCoordinates() {
        ToolsBannerGeometry.NativeViewport v=new ToolsBannerGeometry.NativeViewport(5,7,400,800,2,0,0,100,700,false,false,0);
        assertFalse(ToolsBannerGeometry.map(full(new ToolsBannerGeometry.Rect(10,40,100,50),80,new ToolsBannerGeometry.Rect[0],200,400),v).visible);
        assertEquals(87,ToolsBannerGeometry.map(full(new ToolsBannerGeometry.Rect(10,40,100,50),80,new ToolsBannerGeometry.Rect[0],200,400),v).yPx);
    }
}
