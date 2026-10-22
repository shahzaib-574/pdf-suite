package com.reampdf.mobile;

/** Proof supports document scrolling at visual scale 1 only; unknown/nested mapping stays hidden. */
public final class ToolsBannerGeometry {
    public static final class Rect {
        public final double x,y,width,height;
        public Rect(double x,double y,double width,double height){this.x=x;this.y=y;this.width=width;this.height=height;}
    }
    public static final class Snapshot {
        public final long generation,sequence;
        public final double x,y,width,height,layoutWidth,layoutHeight,visualScale,scrollX,scrollY;
        public final boolean eligible;
        public final Rect slot;
        public final Rect[] occlusions;
        public final double visualX,visualY,visualWidth,visualHeight,reservedHeight;
        public Snapshot(long g,long seq,double x,double y,double w,double h,double lw,double lh,double vs,double sx,double sy,boolean e){this(g,seq,new Rect(x,y,w,h),new Rect(x,y,w,h),lw,lh,vs,0,0,lw,lh,sx,sy,h,e,new Rect[0]);}
        public Snapshot(long g,long seq,Rect slot,Rect creative,double lw,double lh,double vs,double vx,double vy,double vw,double vh,double sx,double sy,double reserved,boolean e,Rect[] occlusions){generation=g;sequence=seq;this.slot=slot;x=creative.x;y=creative.y;width=creative.width;height=creative.height;layoutWidth=lw;layoutHeight=lh;visualScale=vs;visualX=vx;visualY=vy;visualWidth=vw;visualHeight=vh;scrollX=sx;scrollY=sy;reservedHeight=reserved;eligible=e;this.occlusions=occlusions;}
    }
    public static final class NativeViewport {
        public final double originX,originY,width,height,density,scrollX,scrollY,safeLeft,safeRight,safeTop,safeBottom;
        public final boolean ime,scrolling;
        public final long ageMs;
        public NativeViewport(double x,double y,double w,double h,double d,double sx,double sy,double top,double bottom,boolean ime,boolean scrolling,long age){this(x,y,w,h,d,sx,sy,x,x+w,top,bottom,ime,scrolling,age);}
        public NativeViewport(double x,double y,double w,double h,double d,double sx,double sy,double left,double right,double top,double bottom,boolean ime,boolean scrolling,long age){originX=x;originY=y;width=w;height=h;density=d;scrollX=sx;scrollY=sy;safeLeft=left;safeRight=right;safeTop=top;safeBottom=bottom;this.ime=ime;this.scrolling=scrolling;ageMs=age;}
    }
    public static final class Decision {
        public final boolean valid,visible;
        public final int xPx,yPx,widthPx,heightPx;
        public final double heightCss;
        public final String reason;
        private Decision(boolean valid,boolean visible,int x,int y,int w,int h,double css,String reason){this.valid=valid;this.visible=visible;xPx=x;yPx=y;widthPx=w;heightPx=h;heightCss=css;this.reason=reason;}
    }
    public static Decision map(Snapshot s,NativeViewport v){
        double[] values={s.x,s.y,s.width,s.height,s.layoutWidth,s.layoutHeight,s.visualScale,s.visualX,s.visualY,s.visualWidth,s.visualHeight,s.reservedHeight,s.scrollX,s.scrollY,v.originX,v.originY,v.width,v.height,v.density,v.scrollX,v.scrollY,v.safeLeft,v.safeRight,v.safeTop,v.safeBottom};
        for(double n:values)if(!Double.isFinite(n))return invalid("non-finite");
        if(s.generation<=0||s.sequence<=0||s.width<=0||s.height<=0||s.layoutWidth<=0||s.layoutHeight<=0||v.width<=0||v.height<=0||v.density<=0||s.visualScale!=1)return invalid("unsupported-viewport");
        double scale=v.width/s.layoutWidth;
        if(scale<0.25||scale>8||Math.abs(v.height-s.layoutHeight*scale)>3||s.height*scale>100*v.density+1||s.width*scale>v.width+1)return invalid("dimension-mismatch");
        if(!validRect(s.slot)||s.slot.width<=0||s.slot.height<=0||Math.abs(s.reservedHeight-s.slot.height)>1/scale||s.reservedHeight>s.layoutHeight*2||s.x<s.slot.x-1/scale||s.y<s.slot.y-1/scale||s.x+s.width>s.slot.x+s.slot.width+1/scale||s.y+s.height>s.slot.y+s.slot.height+1/scale)return invalid("reserved-slot-mismatch");
        if(s.visualX!=0||s.visualY!=0||Math.abs(s.visualWidth-s.layoutWidth)>3||Math.abs(s.visualHeight-s.layoutHeight)>3||s.visualWidth<=0||s.visualHeight<=0||s.occlusions==null||s.occlusions.length>32)return invalid("visual-viewport-mismatch");
        double x=v.originX+s.x*scale-(v.scrollX-s.scrollX*scale), y=v.originY+s.y*scale-(v.scrollY-s.scrollY*scale);
        double w=s.width*scale,h=s.height*scale;
        boolean fit=x>=Math.max(v.originX,v.safeLeft) && x+w<=Math.min(v.originX+v.width,v.safeRight) && y>=Math.max(v.originY,v.safeTop) && y+h<=Math.min(v.originY+v.height,v.safeBottom);
        boolean occluded=false;
        for(Rect r:s.occlusions){
            if(!validRect(r)||r.width<0||r.height<0||r.width>s.layoutWidth*2||r.height>s.layoutHeight*2)return invalid("invalid-occlusion");
            double rx=v.originX+r.x*scale,ry=v.originY+r.y*scale;
            if(r.width>0&&r.height>0&&x<rx+r.width*scale&&x+w>rx&&y<ry+r.height*scale&&y+h>ry)occluded=true;
        }
        boolean visible=s.eligible && fit && !occluded && !v.ime && !(v.scrolling&&v.ageMs>50);
        String reason=visible?"valid":occluded?"occluded":!fit?"offscreen":v.ime?"ime":"suppressed";
        return new Decision(true,visible,(int)Math.round(x),(int)Math.round(y),(int)Math.round(w),(int)Math.round(h),s.height,reason);
    }
    private static boolean validRect(Rect r){return r!=null&&Double.isFinite(r.x)&&Double.isFinite(r.y)&&Double.isFinite(r.width)&&Double.isFinite(r.height);}
    private static Decision invalid(String why){return new Decision(false,false,0,0,0,0,0,why);}
}
