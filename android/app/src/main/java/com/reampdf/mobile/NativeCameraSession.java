package com.reampdf.mobile;

/** Cancellation belongs to one capture; activity recreation cannot replace its outcome or close a new owner. */
public final class NativeCameraSession {
    private boolean cancelled,finished;
    private String reason="";
    private Runnable close;
    public void attach(Runnable action){boolean run;synchronized(this){if(finished)return;run=cancelled;if(!run)close=action;}if(run)action.run();}
    public synchronized void detach(Runnable action){if(close==action)close=null;}
    public void cancel(String message){Runnable action;synchronized(this){if(cancelled||finished)return;cancelled=true;reason=message;action=close;close=null;}if(action!=null)action.run();}
    public synchronized boolean isCancelled(){return cancelled;}
    public synchronized String reason(){return reason;}
    public synchronized void finish(){finished=true;close=null;}
}
