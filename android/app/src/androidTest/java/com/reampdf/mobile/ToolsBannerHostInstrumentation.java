package com.reampdf.mobile;
import android.content.Context;
import android.view.MotionEvent;
import android.view.View;
import android.webkit.WebView;
import android.widget.FrameLayout;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class ToolsBannerHostInstrumentation {
    private static class TouchView extends View {
        int taps, cancels;
        TouchView(Context c){super(c);}
        @Override public boolean onTouchEvent(MotionEvent e){if(e.getActionMasked()==MotionEvent.ACTION_UP)taps++;if(e.getActionMasked()==MotionEvent.ACTION_CANCEL)cancels++;return true;}
    }
    private static class ScrollView extends WebView {
        int downs,moves,ups,cancels;float downY,lastMoveY,upY;
        ScrollView(Context c){super(c);}
        @Override public boolean onTouchEvent(MotionEvent e){switch(e.getActionMasked()){case 0:downs++;downY=e.getY();break;case 1:ups++;upY=e.getY();break;case 2:moves++;lastMoveY=e.getY();break;case 3:cancels++;break;}return true;}
    }
    private void event(View h,int action,float x,float y){MotionEvent e=MotionEvent.obtain(0,10,action,x,y,0);h.dispatchTouchEvent(e);e.recycle();}
    @Test public void hostTranslationDoesNotTurnTinyPhysicalMoveIntoHandoff() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{
            Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();ScrollView w=new ScrollView(c);ToolsBannerHost h=new ToolsBannerHost(c,w);TouchView ad=new TouchView(c);h.addView(ad);FrameLayout root=new FrameLayout(c);root.addView(h);
            root.layout(0,0,400,500);h.layout(0,200,200,300);ad.layout(0,0,200,100);h.setInteractive(true);
            event(root,0,20,220);h.setY(180);event(root,2,20,221);assertEquals(0,w.downs);assertEquals(0,w.moves);h.cancelInteraction();assertEquals(1,ad.cancels);assertEquals(0,ad.taps);w.destroy();
        });
    }
    @Test public void translatedHostHandoffPreservesPhysicalDownMoveAndUp() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{
            Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();ScrollView w=new ScrollView(c);ToolsBannerHost h=new ToolsBannerHost(c,w);TouchView ad=new TouchView(c);h.addView(ad);FrameLayout root=new FrameLayout(c);root.addView(w);root.addView(h);
            root.layout(0,0,400,500);w.layout(0,0,400,500);h.layout(0,200,200,300);ad.layout(0,0,200,100);h.setInteractive(true);
            event(root,0,20,220);h.setY(180);event(root,2,20,250);assertEquals(220,w.downY,0);h.setY(160);event(root,2,20,280);event(root,1,20,290);
            assertEquals(1,w.downs);assertEquals(280,w.lastMoveY,0);assertEquals(290,w.upY,0);assertEquals(1,w.ups);assertEquals(0,w.cancels);assertEquals(1,ad.cancels);assertEquals(0,ad.taps);w.destroy();
        });
    }
    @Test public void suppressedAdRetainsParentTargetThroughForwardedMoveAndUp() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{
            Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();ScrollView w=new ScrollView(c);ToolsBannerHost h=new ToolsBannerHost(c,w);TouchView ad=new TouchView(c);h.addView(ad);FrameLayout root=new FrameLayout(c);root.addView(h);
            root.layout(0,0,400,400);h.layout(0,0,200,100);ad.layout(0,0,200,100);h.setInteractive(true);
            event(root,0,20,20);event(root,2,20,70);h.setInteractive(false);
            assertEquals(View.VISIBLE,h.getVisibility());assertEquals(View.INVISIBLE,ad.getVisibility());assertEquals(1,ad.cancels);assertEquals(0,w.cancels);
            MotionEvent down=MotionEvent.obtain(0,10,0,20,20,0);assertFalse(h.dispatchTouchEvent(down));down.recycle();
            event(root,2,20,140);event(root,1,20,160);assertEquals(1,w.downs);assertTrue(w.moves>=2);assertEquals(1,w.ups);assertEquals(0,w.cancels);assertEquals(0,ad.taps);assertEquals(View.INVISIBLE,h.getVisibility());w.destroy();
        });
    }
    @Test public void destructiveSuppressionCancelsTransferredDragExactlyOnce() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{
            Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();ScrollView w=new ScrollView(c);ToolsBannerHost h=new ToolsBannerHost(c,w);TouchView ad=new TouchView(c);h.addView(ad);
            h.layout(0,0,200,100);ad.layout(0,0,200,100);h.setInteractive(true);event(h,0,20,20);event(h,2,20,70);
            h.cancelInteraction();h.cancelInteraction();event(h,2,20,90);event(h,1,20,90);assertEquals(1,w.cancels);assertEquals(0,w.ups);assertEquals(1,ad.cancels);assertEquals(0,ad.taps);w.destroy();
        });
    }
    @Test public void dragCancelsAdAndForwardsCoherentStreamWithoutTap() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{
            Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();ScrollView w=new ScrollView(c);ToolsBannerHost h=new ToolsBannerHost(c,w);TouchView ad=new TouchView(c);h.addView(ad);
            h.layout(0,0,200,100);ad.layout(0,0,200,100);h.setInteractive(true);
            event(h,0,20,20);event(h,2,20,70);event(h,1,20,80);
            assertEquals(1,ad.cancels);assertEquals(0,ad.taps);assertEquals(1,w.downs);assertTrue(w.moves>0);assertEquals(1,w.ups);w.destroy();
        });
    }
    @Test public void adTapNeverForwardsToWebviewAndHiddenHostRejectsInput() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{
            Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();ScrollView w=new ScrollView(c);ToolsBannerHost h=new ToolsBannerHost(c,w);TouchView ad=new TouchView(c);h.addView(ad);
            h.layout(0,0,200,100);ad.layout(0,0,200,100);h.setInteractive(true);event(h,0,20,20);event(h,1,20,20);
            assertEquals(1,ad.taps);assertEquals(0,w.downs);h.setInteractive(false);assertEquals(0,ad.cancels);
            MotionEvent e=MotionEvent.obtain(0,10,0,20,20,0);assertFalse(h.dispatchTouchEvent(e));e.recycle();w.destroy();
        });
    }
    @Test public void hidingDuringAdGestureCancelsChildWithoutForwardingTap() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{
            Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();ScrollView w=new ScrollView(c);ToolsBannerHost h=new ToolsBannerHost(c,w);TouchView ad=new TouchView(c);h.addView(ad);
            h.layout(0,0,200,100);ad.layout(0,0,200,100);h.setInteractive(true);event(h,0,20,20);h.setInteractive(false);
            h.setInteractive(false);assertEquals(1,ad.cancels);assertEquals(0,ad.taps);assertEquals(0,w.downs);w.destroy();
        });
    }
}
