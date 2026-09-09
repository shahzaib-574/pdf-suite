package com.reampdf.mobile;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.BeforeClass;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.opencv.android.OpenCVLoader;
import org.opencv.core.*;
import org.opencv.imgproc.Imgproc;
import java.util.Arrays;
import java.nio.ByteBuffer;
import static org.junit.Assert.*;

/** Side-by-side measurements of the shipped v1.1.0 baseline on the same emulator. */
@RunWith(AndroidJUnit4.class)
public class DocumentEdgesBenchmarkTest {
    @BeforeClass public static void load() { assertTrue(OpenCVLoader.initLocal()); }

    @Test public void compareLiveDetectorAndPlaneCopy() {
        Mat image = new Mat(480,640,CvType.CV_8UC1,new Scalar(35));
        MatOfPoint page = new MatOfPoint(new Point(160,65),new Point(475,95),new Point(510,411),new Point(126,390));
        try (DocumentEdges.Detector detector = new DocumentEdges.Detector()) {
            Imgproc.fillConvexPoly(image,page,new Scalar(235));
            for(int y=140;y<330;y+=18) Imgproc.line(image,new Point(215,y),new Point(410,y),new Scalar(45),2);
            for(int i=0;i<8;i++) { BaselineDocumentEdges.detect(image); detector.detect(image); }
            long[] before=new long[30],after=new long[30];
            for(int i=0;i<30;i++) {
                long start=System.nanoTime(); assertNotNull(BaselineDocumentEdges.detect(image)); before[i]=System.nanoTime()-start;
                start=System.nanoTime(); assertNotNull(detector.detect(image)); after[i]=System.nanoTime()-start;
            }
            report("detector640x480",before,after);
            // Clutter exercises candidate filtering and cached contour areas.
            for(int y=8;y<470;y+=12) for(int x=8;x<115;x+=12) Imgproc.rectangle(image,new Point(x,y),new Point(x+5,y+5),new Scalar(170),1);
            for(int i=0;i<30;i++) {
                long start=System.nanoTime(); assertNotNull(BaselineDocumentEdges.detect(image)); before[i]=System.nanoTime()-start;
                start=System.nanoTime(); assertNotNull(detector.detect(image)); after[i]=System.nanoTime()-start;
            }
            report("clutter640x480",before,after);
            ByteBuffer buffer=ByteBuffer.allocateDirect(672*480); byte[] copy=new byte[640*480],fast=new byte[640*480];
            for(int i=0;i<buffer.limit();i++)buffer.put(i,(byte)(i%251));
            for(int i=0;i<30;i++) {
                long start=System.nanoTime();
                for(int y=0;y<480;y++)for(int x=0;x<640;x++)copy[y*640+x]=buffer.get(y*672+x);
                before[i]=System.nanoTime()-start;
                start=System.nanoTime(); LumaPlane.copy(buffer,640,480,672,1,fast,new byte[0]); after[i]=System.nanoTime()-start;
                assertArrayEquals(copy,fast);
            }
            report("lumaCopy",before,after);
        } finally { image.release(); page.release(); }
    }

    @Test public void compareScheduledTrackingLag() {
        BaselineDocumentEdges.Tracker baseline=new BaselineDocumentEdges.Tracker();
        DocumentEdges.Tracker tracker=new DocumentEdges.Tracker();
        Point[] old=null,fresh=null; int oldTime=-130,newTime=-33,samples=0;
        double oldError=0,newError=0;
        for(int time=0;time<=1200;time++) {
            double dx=.00012*time;
            Point[] points={new Point(.15+dx,.15),new Point(.7+dx,.15),new Point(.7+dx,.8),new Point(.15+dx,.8)};
            if(time-oldTime>=130){old=baseline.update(new BaselineDocumentEdges.Detection(points,.9),1000+time);oldTime=time;}
            if(time-newTime>=33){fresh=tracker.update(new DocumentEdges.Detection(points,.9),1000+time);newTime=time;}
            if(time>=300){oldError+=Math.abs(points[0].x-old[0].x);newError+=Math.abs(points[0].x-fresh[0].x);samples++;}
        }
        System.out.printf("EDGE_TRACKING baselineMeanLagPx=%.3f updatedMeanLagPx=%.3f at640px samples=%d%n",oldError/samples*640,newError/samples*640,samples);
        assertTrue("New cadence/filter should at least halve modeled tracking lag",newError<oldError*.5);
    }

    private static void report(String name,long[] before,long[] after) {
        Arrays.sort(before);Arrays.sort(after);
        System.out.printf("EDGE_BENCH %s baselineP50Ms=%.3f updatedP50Ms=%.3f baselineP95Ms=%.3f updatedP95Ms=%.3f%n",
            name,before[15]/1e6,after[15]/1e6,before[28]/1e6,after[28]/1e6);
    }
}
