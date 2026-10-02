package com.reampdf.mobile;

/** Ownership only; the host handles coherent MotionEvent cancellation/translation. */
public final class ToolsBannerGesture {
    public enum Action { DOWN, MOVE, UP, CANCEL }
    public enum Ownership { AD, WEBVIEW, CANCELLED }
    private final float slop;
    private float downX,downY;
    private Ownership owner=Ownership.CANCELLED;
    private boolean cancellation, horizontal, active;
    public ToolsBannerGesture(float slop){this.slop=slop;}
    public Ownership update(Action action,float x,float y,int pointers){
        if(action==Action.DOWN){downX=x;downY=y;owner=Ownership.AD;horizontal=false;cancellation=false;active=true;}
        if(pointers!=1 || action==Action.CANCEL){cancellation=active&&owner==Ownership.AD;owner=Ownership.CANCELLED;active=false;}
        if(action==Action.MOVE && owner==Ownership.AD){
            float dx=Math.abs(x-downX),dy=Math.abs(y-downY);
            if(dx>slop && dx>dy)horizontal=true;
            if(!horizontal && dy>slop && dy>dx){owner=Ownership.WEBVIEW;cancellation=true;}
        }
        if(action==Action.UP)active=false;
        return owner;
    }
    public boolean consumeChildCancellation(){boolean result=cancellation;cancellation=false;return result;}
    public boolean isActive(){return active;}
    /** Events retain their physical screen position even if the host moves between samples. */
    public static float screenToLocal(float screen,float viewOrigin){return screen-viewOrigin;}
    /** Ordinary suppression can preserve only an already handed-off live drag, never an SDK tap. */
    public boolean suppress(boolean destructive){
        if(!destructive&&active&&owner==Ownership.WEBVIEW)return true;
        update(Action.CANCEL,0,0,1);return false;
    }
}
