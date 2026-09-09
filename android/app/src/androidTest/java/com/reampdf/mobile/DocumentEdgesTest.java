package com.reampdf.mobile;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.BeforeClass;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.opencv.android.OpenCVLoader;
import org.opencv.core.*;
import org.opencv.imgproc.Imgproc;
import static org.junit.Assert.*;

/** Runs the real Android OpenCV library, not a port or mock of the detector. */
@RunWith(AndroidJUnit4.class)
public class DocumentEdgesTest {
    @BeforeClass public static void load() { assertTrue(OpenCVLoader.initLocal()); }
    private Mat page(Point[] corners, int background, int paper) {
        Mat image = new Mat(480, 640, CvType.CV_8UC1, new Scalar(background));
        MatOfPoint polygon = new MatOfPoint(corners);
        Imgproc.fillConvexPoly(image, polygon, new Scalar(paper)); polygon.release();
        // Interior text-like lines must not become the page boundary.
        for (int y = 150; y <= 300; y += 22) Imgproc.line(image, new Point(235,y), new Point(395,y), new Scalar(background), 3);
        return image;
    }
    private void assertDetects(Point[] expected, int background, int paper) {
        Mat image = page(expected, background, paper);
        try {
            DocumentEdges.Detection result = DocumentEdges.detect(image);
            assertNotNull("Expected a page outline", result);
            Point[] sorted = DocumentEdges.order(expected.clone());
            for (int i=0;i<4;i++) {
                assertEquals(sorted[i].x / 639, result.corners[i].x, .025);
                assertEquals(sorted[i].y / 479, result.corners[i].y, .025);
            }
        } finally { image.release(); }
    }
    @Test public void perspectiveAndPrintedPage() {
        assertDetects(new Point[]{new Point(160,65),new Point(475,95),new Point(510,411),new Point(126,390)},30,235);
    }
    @Test public void darkPaperOnLightDesk() {
        assertDetects(new Point[]{new Point(160,65),new Point(475,95),new Point(510,411),new Point(126,390)},230,45);
    }
    @Test public void rotatedPage() {
        assertDetects(new Point[]{new Point(275,40),new Point(530,200),new Point(340,445),new Point(90,285)},30,235);
    }
    @Test public void moderateContrastAndShadowKeepThePaperBoundary() {
        Point[] corners = {new Point(160,65),new Point(475,95),new Point(510,411),new Point(126,390)};
        assertDetects(corners,120,150);
        Mat image = new Mat(480,640,CvType.CV_8UC1,new Scalar(30));
        MatOfPoint shadow = new MatOfPoint(new Point(153,58),new Point(482,88),new Point(517,418),new Point(119,397));
        MatOfPoint paper = new MatOfPoint(corners);
        try {
            Imgproc.fillConvexPoly(image,shadow,new Scalar(70));
            Imgproc.fillConvexPoly(image,paper,new Scalar(235));
            DocumentEdges.Detection result = DocumentEdges.detect(image); assertNotNull(result);
            for (int i=0;i<4;i++) {
                assertEquals(corners[i].x/639,result.corners[i].x,.012);
                assertEquals(corners[i].y/479,result.corners[i].y,.012);
            }
        } finally { image.release(); shadow.release(); paper.release(); }
    }
    @Test public void trackerFollowsMotionRejectsOneFrameJumpAndAlignsCorners() {
        DocumentEdges.Tracker tracker = new DocumentEdges.Tracker();
        for (int frame=0;frame<20;frame++) {
            double dx=frame*.005;
            Point[] corners={new Point(.15+dx,.15),new Point(.7+dx,.15),new Point(.7+dx,.8),new Point(.15+dx,.8)};
            Point[] result=tracker.update(new DocumentEdges.Detection(corners,.9),1000+frame*33);
            assertTrue("Live border should follow a moving page within 1% of the frame",Math.abs(result[0].x-corners[0].x)<.01);
            assertFalse("A moving page is not ready/steady",tracker.stable(1000+frame*33));
        }
        Point[] shifted={new Point(.245,.15),new Point(.795,.15),new Point(.795,.8),new Point(.245,.8)};
        Point[] cycled={shifted[1],shifted[2],shifted[3],shifted[0]};
        Point[] aligned=tracker.update(new DocumentEdges.Detection(cycled,.9),1660);
        assertEquals(.245,aligned[0].x,.01);
        Point[] outlier={new Point(.01,.01),new Point(.4,.01),new Point(.4,.4),new Point(.01,.4)};
        Point[] held=tracker.update(new DocumentEdges.Detection(outlier,.9),1693);
        assertEquals(aligned[0].x,held[0].x,0);
        assertFalse(tracker.stable(1693));
        assertNotNull(tracker.update(null,1726));
        assertNull("Lost page should disappear within 160ms",tracker.update(null,1821));
    }
    @Test public void blankAndCircleAreNotDocuments() {
        Mat image = new Mat(480,640,CvType.CV_8UC1,new Scalar(180));
        try {
            assertNull(DocumentEdges.detect(image));
            Imgproc.circle(image,new Point(320,240),170,new Scalar(20),-1);
            assertNull(DocumentEdges.detect(image));
        } finally { image.release(); }
    }
    @Test public void clippedDocumentAndLowContrastStayManual() {
        Mat clipped = page(new Point[]{new Point(0,70),new Point(500,70),new Point(500,420),new Point(0,420)},30,235);
        Mat faint = page(new Point[]{new Point(140,60),new Point(490,60),new Point(490,420),new Point(140,420)},150,152);
        try { assertNull(DocumentEdges.detect(clipped)); assertNull(DocumentEdges.detect(faint)); }
        finally { clipped.release(); faint.release(); }
    }
    @Test public void liveOutlineNeedsStabilityAndExpires() {
        Point[] corners={new Point(.2,.2),new Point(.8,.2),new Point(.8,.8),new Point(.2,.8)};
        DocumentEdges.Detection detection = new DocumentEdges.Detection(corners,.9);
        DocumentEdges.Tracker tracker = new DocumentEdges.Tracker();
        tracker.update(detection,1000); assertFalse(tracker.stable(1000));
        tracker.update(detection,1130); tracker.update(detection,1260); tracker.update(detection,1390);
        assertTrue(tracker.stable(1390));
        assertNull(tracker.update(null,1900)); assertFalse(tracker.stable(1900));
        tracker.update(detection,2100); assertFalse(tracker.stable(2100));
    }
}
