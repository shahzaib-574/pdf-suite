package com.reampdf.mobile;

/** Generation and request ownership; deliberately independent of Android and ad callbacks. */
public final class ToolsBannerSession {
    private long generation, sequence, retired, retryAfter, issued, geometryFailedAt=-1;
    private int requests;
    private boolean geometryAck;
    public boolean begin(long next, int widthDp, long nowMs) {
        if(next<=0 || next<=generation || next<=retired || widthDp<=0 || !mayRetry(nowMs)) return false;
        generation=next;sequence=0;geometryAck=false;geometryFailedAt=-1;requests++;return true;
    }
    public boolean accept(long incoming,long nextSequence) {
        if(incoming!=generation || incoming<=retired || nextSequence<=sequence) return false;
        sequence=nextSequence;geometryAck=true;geometryFailedAt=-1;return true;
    }
    public boolean current(long incoming){return incoming==generation && incoming>retired;}
    public long allocateGeneration(){issued=Math.max(issued,Math.max(generation,retired))+1;return issued;}
    public boolean issued(long incoming){return incoming>0&&incoming<=issued;}
    public void invalidateGeometry(long incoming){if(current(incoming))geometryAck=false;}
    public boolean geometryAcknowledged(long incoming){return current(incoming)&&geometryAck;}
    public void geometryFailed(long incoming,long nowMs){if(current(incoming)){geometryAck=false;if(geometryFailedAt<0)geometryFailedAt=nowMs;}}
    public boolean shouldCollapseGeometry(long incoming,long nowMs){return current(incoming)&&!geometryAck&&geometryFailedAt>=0&&nowMs-geometryFailedAt>=1000;}
    public void retire(long incoming){retired=Math.max(retired,incoming);}
    public void failed(long incoming,long nowMs){if(current(incoming)){retryAfter=nowMs+60000;retire(incoming);}}
    public boolean mayRetry(long nowMs){return nowMs>=retryAfter;}
    public int requestCount(){return requests;}
}
