package com.reampdf.mobile;

import android.content.Context;
import android.view.MotionEvent;
import android.view.ViewConfiguration;
import android.webkit.WebView;
import android.widget.FrameLayout;

/** Small bounded native host. Gesture handoff is a test-ad proof, not device acceptance. */
public final class ToolsBannerHost extends FrameLayout {
    private final WebView webView;
    private final ToolsBannerGesture gesture;
    private boolean interactive, forwarding;
    private MotionEvent down;

    public ToolsBannerHost(Context context,WebView webView){
        super(context);this.webView=webView;gesture=new ToolsBannerGesture(ViewConfiguration.get(context).getScaledTouchSlop());
        setClipChildren(true);setClipToPadding(true);setInteractive(false);
    }
    public void setInteractive(boolean value){
        if(!value)suppress(false);
        interactive=value;updateVisibility();
        setImportantForAccessibility(value?IMPORTANT_FOR_ACCESSIBILITY_AUTO:IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
    }
    public void cancelInteraction(){suppress(true);interactive=false;updateVisibility();setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);}
    private void suppress(boolean destructive){
        boolean childActive=down!=null&&!forwarding&&gesture.isActive();
        boolean preserve=gesture.suppress(destructive);
        if(childActive){MotionEvent cancel=MotionEvent.obtain(down);cancel.setAction(MotionEvent.ACTION_CANCEL);super.dispatchTouchEvent(cancel);cancel.recycle();}
        if(!preserve)cancelForwarding();
    }
    private void updateVisibility(){
        // Keep the framework's existing parent touch target only while finishing a WebView drag.
        // Hide the actual SDK child and reject every new DOWN during suppression.
        for(int i=0;i<getChildCount();i++)getChildAt(i).setVisibility(interactive?VISIBLE:INVISIBLE);
        setVisibility(interactive||forwarding?VISIBLE:INVISIBLE);
    }
    @Override public boolean dispatchTouchEvent(MotionEvent event){
        if(!interactive&&(!forwarding||event.getActionMasked()==MotionEvent.ACTION_DOWN))return false;
        if(event.getActionMasked()==MotionEvent.ACTION_DOWN && (event.getX()<0||event.getY()<0||event.getX()>=getWidth()||event.getY()>=getHeight()))return false;
        boolean result=super.dispatchTouchEvent(event);
        if(event.getActionMasked()==MotionEvent.ACTION_UP||event.getActionMasked()==MotionEvent.ACTION_CANCEL){recycleDown();updateVisibility();}
        return result;
    }
    private ToolsBannerGesture.Action action(MotionEvent e){
        switch(e.getActionMasked()){
            case MotionEvent.ACTION_DOWN:return ToolsBannerGesture.Action.DOWN;
            case MotionEvent.ACTION_UP:return ToolsBannerGesture.Action.UP;
            case MotionEvent.ACTION_CANCEL:case MotionEvent.ACTION_POINTER_DOWN:return ToolsBannerGesture.Action.CANCEL;
            default:return ToolsBannerGesture.Action.MOVE;
        }
    }
    @Override public boolean onInterceptTouchEvent(MotionEvent event){
        if(event.getActionMasked()==MotionEvent.ACTION_DOWN){cancelForwarding();down=MotionEvent.obtain(event);}
        ToolsBannerGesture.Ownership owner=gesture.update(action(event),event.getRawX(),event.getRawY(),event.getPointerCount());
        // Framework sends CANCEL to the SDK child when this parent first intercepts.
        return owner!=ToolsBannerGesture.Ownership.AD;
    }
    @Override public boolean onTouchEvent(MotionEvent event){
        ToolsBannerGesture.Ownership owner=gesture.update(action(event),event.getRawX(),event.getRawY(),event.getPointerCount());
        if(owner==ToolsBannerGesture.Ownership.CANCELLED){cancelForwarding();return true;}
        if(owner!=ToolsBannerGesture.Ownership.WEBVIEW || down==null)return false;
        if(!forwarding){forward(down);forwarding=true;}
        forward(event);
        if(event.getActionMasked()==MotionEvent.ACTION_UP){forwarding=false;recycleDown();}
        return true;
    }
    private void forward(MotionEvent original){
        MotionEvent copy=MotionEvent.obtain(original);
        int[] web=new int[2];webView.getLocationOnScreen(web);
        // Never reconstruct cached DOWN using a later host origin. The original raw position
        // survives MotionEvent.obtain and maps coherently with each MOVE/UP into the WebView.
        copy.setLocation(ToolsBannerGesture.screenToLocal(original.getRawX(),web[0]),ToolsBannerGesture.screenToLocal(original.getRawY(),web[1]));webView.onTouchEvent(copy);copy.recycle();
    }
    private void cancelForwarding(){
        if(forwarding&&down!=null){MotionEvent cancel=MotionEvent.obtain(down);cancel.setAction(MotionEvent.ACTION_CANCEL);forward(cancel);cancel.recycle();}
        forwarding=false;recycleDown();
    }
    private void recycleDown(){if(down!=null){down.recycle();down=null;}}
    @Override protected void onDetachedFromWindow(){cancelInteraction();super.onDetachedFromWindow();}
}
