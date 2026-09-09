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
