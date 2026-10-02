package com.reampdf.mobile;

import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewTreeObserver;
import android.webkit.WebView;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.graphics.Insets;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.ads.AdListener;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.RequestConfiguration;
import com.google.android.ump.UserMessagingPlatform;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;
import org.json.JSONArray;

/** Protocol-1 proof host. IDs/mode come only from native active-bundle authority. */
@CapacitorPlugin(name="ToolsBanner")
public final class ToolsBannerPlugin extends Plugin {
    private final ToolsBannerSession session=new ToolsBannerSession();
    private ToolsBannerHost host;
    private AdView ad;
    private ViewGroup parent;
    private ToolsBannerGeometry.Snapshot snapshot;
    private ViewTreeObserver.OnPreDrawListener drawListener;
    private long generation,receivedAt,lastScrollAt;
    private int lastScrollX,lastScrollY,measuredHeight,measuredWidth;
    private boolean foreground=true,loaded,displayed;
    private String sourceRoot;
    private String lastVisibilityReason;

    private void ui(Runnable task){getActivity().runOnUiThread(task);}
    private static String text(JSONObject j,String key)throws Exception{Object v=j.get(key);if(!(v instanceof String))throw new IllegalArgumentException(key);return (String)v;}
    private static boolean bool(JSONObject j,String key)throws Exception{Object v=j.get(key);if(!(v instanceof Boolean))throw new IllegalArgumentException(key);return (Boolean)v;}
    private static double number(JSONObject j,String key)throws Exception{Object v=j.get(key);if(!(v instanceof Number)||!Double.isFinite(((Number)v).doubleValue()))throw new IllegalArgumentException("invalid-"+key);return ((Number)v).doubleValue();}
    private static long owner(JSONObject j,String key)throws Exception{double v=number(j,key);if(v<=0||v!=Math.floor(v)||v>9007199254740991d)throw new IllegalArgumentException("invalid-"+key);return (long)v;}
    private static ToolsBannerGeometry.Rect rect(JSONObject j)throws Exception{return new ToolsBannerGeometry.Rect(number(j,"x"),number(j,"y"),number(j,"width"),number(j,"height"));}
    private ToolsBannerAuthority.Metadata read(InputStream stream)throws Exception{
        try(InputStream in=stream;ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] b=new byte[1024];int n;while((n=in.read(b))!=-1){out.write(b,0,n);if(out.size()>8192)throw new IllegalArgumentException("metadata-size");}
            JSONObject m=new JSONObject(out.toString(StandardCharsets.UTF_8.name()));Object schema=m.get("schemaVersion");
            if(!(schema instanceof Number)||((Number)schema).doubleValue()!=4)throw new IllegalArgumentException("metadata-schema");
            JSONObject a=m.getJSONObject("ads");Object geo=a.get("debugGeography");if(geo!=JSONObject.NULL&&!(geo instanceof String))throw new IllegalArgumentException("geography-type");
            return new ToolsBannerAuthority.Metadata(4,text(m,"mode"),bool(m,"advertising"),text(a,"provider"),text(a,"appId"),text(a,"bannerId"),bool(a,"isTesting"),text(a,"consent"),text(a,"maxAdContentRating"),bool(a,"tagForUnderAgeOfConsent"),geo==JSONObject.NULL?null:(String)geo);
        }
    }
    private ToolsBannerAuthority.Metadata activeMetadata()throws Exception{
        String root=ToolsBannerAuthority.resolveRoot(getBridge().getServerBasePath(),getContext().getFilesDir(),getBridge().getServerUrl());
        if(root==null)throw new IllegalArgumentException("unknown-active-source");
        if(sourceRoot!=null&&!sourceRoot.equals(root))throw new IllegalArgumentException("active-source-changed");
        ToolsBannerAuthority.Metadata installed=read(getContext().getAssets().open("public/release-metadata.json"));
        ToolsBannerAuthority.Metadata active="public".equals(root)?installed:read(new FileInputStream(new File(root,"release-metadata.json")));
        ToolsBannerAuthority.Result result=ToolsBannerAuthority.validate(active,installed,BuildConfig.DEBUG,BuildConfig.TOOLS_INLINE_BANNER_PRODUCTION_VERIFIED);
        if(!result.allowed)throw new IllegalArgumentException(result.reason);
        return active;
    }
    private boolean requestAllowed(){
        RequestConfiguration config=MobileAds.getRequestConfiguration();
        return ToolsBannerAuthority.requestAllowed(foreground,UserMessagingPlatform.getConsentInformation(getContext()).canRequestAds(),MobileAds.getInitializationStatus()!=null,config.getTagForUnderAgeOfConsent(),config.getMaxAdContentRating());
    }
    private boolean home(){return ToolsBannerAuthority.isHomeUrl(getBridge().getWebView().getUrl(),getBridge().getLocalUrl());}
    @PluginMethod public void getCapabilities(PluginCall call){ui(()->{
        JSObject r=new JSObject();r.put("protocol",1);r.put("supported",true);
        try{ToolsBannerAuthority.Metadata m=activeMetadata();r.put("mode",m.mode);r.put("canRequest",requestAllowed());r.put("nextGeneration",session.allocateGeneration());}
        catch(Exception e){r.put("mode","disabled");r.put("canRequest",false);r.put("reason",e.getMessage());}
        call.resolve(r);
    });}
    @PluginMethod public void prepare(PluginCall call){ui(()->{
        long preparingOwner=0;
        try{
            ToolsBannerAuthority.Metadata meta=activeMetadata();
            if(!Boolean.TRUE.equals(call.getBoolean("eligible"))||!home()||!requestAllowed())throw new IllegalArgumentException("ineligible");
            Long next=owner(call.getData(),"generation");Double width=number(call.getData(),"widthCss"),layout=number(call.getData(),"layoutWidth");
            WebView web=getBridge().getWebView();
            if(next==null||!session.issued(next)||width==null||layout==null||!Double.isFinite(width)||!Double.isFinite(layout)||width<=0||layout<=0||width>layout||web.getWidth()<=0)throw new IllegalArgumentException("invalid-width-or-owner");
            double scale=web.getWidth()/layout;int widthPx=(int)Math.floor(width*scale);int widthDp=(int)Math.floor(widthPx/getContext().getResources().getDisplayMetrics().density);
            if(!Double.isFinite(scale)||scale<0.25||scale>8)throw new IllegalArgumentException("unsupported-css-scale");
            if(!session.begin(next,widthDp,SystemClock.elapsedRealtime()))throw new IllegalArgumentException("stale-or-backoff");
            preparingOwner=next;
            disposeView();generation=next;sourceRoot=ToolsBannerAuthority.resolveRoot(getBridge().getServerBasePath(),getContext().getFilesDir(),getBridge().getServerUrl());
            cssScale=scale;
            parent=(ViewGroup)web.getParent();host=new ToolsBannerHost(getContext(),web);parent.addView(host);
            ViewGroup.LayoutParams hp=host.getLayoutParams();hp.width=widthPx;hp.height=ViewGroup.LayoutParams.WRAP_CONTENT;host.setLayoutParams(hp);
            final AdView created=new AdView(getContext());ad=created;created.setAdUnitId(meta.bannerId);created.setAdSize(AdSize.getInlineAdaptiveBannerAdSize(widthDp,100));
            host.addView(created,new ViewGroup.LayoutParams(widthPx,ViewGroup.LayoutParams.WRAP_CONTENT));
            created.addOnLayoutChangeListener((v,l,t,r,b,ol,ot,or,ob)->{if(ad==created&&session.current(next)&&loaded)measure(next);});
            created.setAdListener(new AdListener(){
                @Override public void onAdLoaded(){if(ad!=created||!session.current(next))return;loaded=true;created.post(()->{if(ad==created&&session.current(next))measure(next);});}
                @Override public void onAdFailedToLoad(LoadAdError error){if(ad!=created||!session.current(next))return;session.failed(next,SystemClock.elapsedRealtime());emit("failed","ad-load-"+error.getCode(),0);disposeView();}
            });
            drawListener=()->{applyFrame();return true;};web.getViewTreeObserver().addOnPreDrawListener(drawListener);
            lastScrollX=web.getScrollX();lastScrollY=web.getScrollY();emit("loading",null,0);
            created.loadAd(new AdRequest.Builder().build());call.resolve();
        }catch(Exception e){if(preparingOwner>0&&session.current(preparingOwner)){session.retire(preparingOwner);disposeView();}call.reject("Tools banner preparation refused: "+e.getMessage());}
    });}
    private void measure(long owner){
        if(!session.current(owner)||ad==null||host==null)return;
        int h=ad.getMeasuredHeight(),w=ad.getMeasuredWidth();float d=getContext().getResources().getDisplayMetrics().density;
        if(h<=0||w<=0)return;
        if(h>100*d+1){session.retire(owner);emit("failed","invalid-measured-height",0);disposeView();return;}
        if(measuredHeight==h&&measuredWidth==w)return;
        measuredHeight=h;measuredWidth=w;invalidateGeometry("measurement-change",false);
        emit("measured",null,0);
    }
    @PluginMethod public void updateGeometry(PluginCall call){ui(()->{
        long seq=0;boolean accepted=false;
        Long packetOwner=call.getLong("generation");
        try{
            activeMetadata();JSONObject p=call.getData();long owned=owner(p,"generation");seq=owner(p,"sequence");
            if(!session.current(owned)||!loaded||measuredHeight<=0||!home()||!requestAllowed())throw new IllegalArgumentException("inactive");
            JSONObject visual=p.getJSONObject("visual");ToolsBannerGeometry.Rect creative=rect(p.getJSONObject("creative"));
            double layoutWidth=number(p,"layoutWidth"),scale=getBridge().getWebView().getWidth()/layoutWidth;
            if(!Double.isFinite(scale)||scale<=0||Math.abs(creative.height*scale-measuredHeight)>1||Math.abs(creative.width*scale-measuredWidth)>1)throw new IllegalArgumentException("slot-measurement-mismatch");
            JSONArray hidden=p.getJSONArray("occlusions");if(hidden.length()>32)throw new IllegalArgumentException("too-many-occlusions");
            ToolsBannerGeometry.Rect[] occlusions=new ToolsBannerGeometry.Rect[hidden.length()];for(int i=0;i<hidden.length();i++)occlusions[i]=rect(hidden.getJSONObject(i));
            ToolsBannerGeometry.Snapshot next=new ToolsBannerGeometry.Snapshot(owned,seq,rect(p.getJSONObject("slot")),creative,layoutWidth,number(p,"layoutHeight"),number(visual,"scale"),number(visual,"offsetLeft"),number(visual,"offsetTop"),number(visual,"width"),number(visual,"height"),number(p,"scrollX"),number(p,"scrollY"),number(p,"reservedHeight"),bool(p,"eligible"),occlusions);
            if(!session.accept(owned,seq))throw new IllegalArgumentException("stale-geometry");
            snapshot=next;receivedAt=SystemClock.elapsedRealtime();accepted=applyFrame();
        }catch(Exception e){if(packetOwner!=null&&session.current(packetOwner))invalidateGeometry("invalid-geometry",true);}
        JSObject result=new JSObject();result.put("accepted",accepted);result.put("sequence",seq);call.resolve(result);
    });}
    private boolean applyFrame(){
        if(host==null||snapshot==null||!session.geometryAcknowledged(generation))return false;
        try{
            activeMetadata();WebView web=getBridge().getWebView();
            if(!home()||!requestAllowed()){invalidateGeometry("eligibility-change",false);return false;}
            int[] wp=new int[2],pp=new int[2];web.getLocationOnScreen(wp);parent.getLocationOnScreen(pp);
            long now=SystemClock.elapsedRealtime();if(lastScrollX!=web.getScrollX()||lastScrollY!=web.getScrollY()){lastScrollAt=now;lastScrollX=web.getScrollX();lastScrollY=web.getScrollY();}
            WindowInsetsCompat insets=ViewCompat.getRootWindowInsets(web);boolean ime=insets!=null&&insets.isVisible(WindowInsetsCompat.Type.ime());
            if(ime){invalidateGeometry("ime",false);return false;}
            int[] rootOrigin=new int[2];View root=web.getRootView();root.getLocationOnScreen(rootOrigin);
            Insets bars=insets==null?Insets.NONE:insets.getInsets(WindowInsetsCompat.Type.systemBars()|WindowInsetsCompat.Type.displayCutout());
            double top=Math.max(wp[1]-pp[1],rootOrigin[1]+bars.top-pp[1]);
            double bottom=Math.min(wp[1]-pp[1]+web.getHeight(),rootOrigin[1]+root.getHeight()-bars.bottom-pp[1]);
            double left=Math.max(wp[0]-pp[0],rootOrigin[0]+bars.left-pp[0]);
            double right=Math.min(wp[0]-pp[0]+web.getWidth(),rootOrigin[0]+root.getWidth()-bars.right-pp[0]);
            ToolsBannerGeometry.NativeViewport viewport=new ToolsBannerGeometry.NativeViewport(wp[0]-pp[0],wp[1]-pp[1],web.getWidth(),web.getHeight(),getContext().getResources().getDisplayMetrics().density,web.getScrollX(),web.getScrollY(),left,right,top,bottom,ime,now-lastScrollAt<100,now-receivedAt);
            ToolsBannerGeometry.Decision decision=ToolsBannerGeometry.map(snapshot,viewport);
            if(!decision.valid){invalidateGeometry("invalid-geometry",true);return false;}
            if(decision.valid){ViewGroup.LayoutParams lp=host.getLayoutParams();if(lp.width!=decision.widthPx||lp.height!=decision.heightPx){lp.width=decision.widthPx;lp.height=decision.heightPx;host.setLayoutParams(lp);}host.setX(decision.xPx);host.setY(decision.yPx);}
            setDisplayed(decision.visible,decision.reason,snapshot.sequence);
            if(!decision.visible&&now-lastScrollAt<100)web.postDelayed(web::invalidate,110);
            return decision.valid;
        }catch(Exception e){invalidateGeometry("source-or-viewport-change",true);return false;}
    }
    private void emit(String status,String reason,long sequence){
        JSObject event=new JSObject();event.put("generation",generation);event.put("sequence",sequence);event.put("status",status);event.put("widthPx",measuredWidth);event.put("heightPx",measuredHeight);
        // prepare records CSS scale before a measured event (see cssScale).
        event.put("heightCss",measuredHeight/cssScale);event.put("widthCss",measuredWidth/cssScale);if(reason!=null)event.put("reason",reason);notifyListeners("stateChanged",event);
    }
    private double cssScale=1;
    private void setDisplayed(boolean visible,String reason,long seq){if(host!=null)host.setInteractive(visible);if(displayed!=visible||!java.util.Objects.equals(lastVisibilityReason,reason)){displayed=visible;lastVisibilityReason=reason;emit(visible?"visible":"hidden",reason,seq);}}
    private void invalidateGeometry(String reason,boolean failure){session.invalidateGeometry(generation);snapshot=null;if(host!=null)host.cancelInteraction();setDisplayed(false,reason,0);if(failure){session.geometryFailed(generation,SystemClock.elapsedRealtime());long owned=generation;getBridge().getWebView().postDelayed(()->{if(session.shouldCollapseGeometry(owned,SystemClock.elapsedRealtime())){session.retire(owned);emit("failed","geometry-timeout",0);disposeView();}},1000);}}
    @PluginMethod public void hide(PluginCall call){ui(()->{Long owner=call.getLong("generation");if(owner!=null&&session.current(owner))invalidateGeometry("client-hidden",false);call.resolve();});}
    @PluginMethod public void destroy(PluginCall call){ui(()->{Long owner=call.getLong("generation");if(owner!=null&&session.current(owner)){session.retire(owner);emit("destroyed",null,0);disposeView();}call.resolve();});}
    private void disposeView(){
        if(host!=null){host.cancelInteraction();if(parent!=null)parent.removeView(host);host=null;}
        if(drawListener!=null&&getBridge()!=null){ViewTreeObserver tree=getBridge().getWebView().getViewTreeObserver();if(tree.isAlive())tree.removeOnPreDrawListener(drawListener);drawListener=null;}
        if(ad!=null){ad.setAdListener(null);ad.destroy();ad=null;}snapshot=null;loaded=false;displayed=false;lastVisibilityReason=null;measuredHeight=0;measuredWidth=0;sourceRoot=null;
    }
    @Override protected void handleOnPause(){foreground=false;ui(()->{invalidateGeometry("background",false);if(ad!=null)ad.pause();});}
    @Override protected void handleOnResume(){foreground=true;ui(()->{if(ad!=null)ad.resume();});}
    @Override protected void handleOnDestroy(){foreground=false;session.retire(generation);ui(this::disposeView);}
}
