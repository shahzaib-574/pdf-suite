package com.reampdf.mobile;

import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

/** Uses the existing chunked FileImporter transport; never sends a full photo over the bridge. */
@CapacitorPlugin(name = "DocumentCamera")
public class DocumentCameraPlugin extends Plugin {
    private static final class Request {
        final String id;final PluginCall call;final NativeCameraSession session=new NativeCameraSession();
        Request(String id,PluginCall call){this.id=id;this.call=call;}
    }
    private static final AtomicReference<Request> active=new AtomicReference<>();
    private Request owned;
    static NativeCameraSession session(String id){Request request=active.get();return request!=null&&request.id.equals(id)?request.session:null;}

    @PluginMethod public void capture(PluginCall call) {
        String id=call.getString("requestId",UUID.randomUUID().toString());
        if(id==null||!id.matches("[A-Za-z0-9_-]{1,80}")){call.reject("Invalid camera request.");return;}
        Request request=new Request(id,call);
        if (!active.compareAndSet(null, request)) { call.reject("Camera is already open or closing."); return; }
        owned=request;
        try {
            startActivityForResult(call, new Intent(getContext(), DocumentCameraActivity.class).putExtra("requestId",id), "captureResult");
        } catch (RuntimeException error) { active.compareAndSet(request,null);owned=null;request.session.finish();call.reject("Could not open the document camera."); }
    }
    @PluginMethod public void cancelCapture(PluginCall call){Request request=owned;if(request!=null&&request.id.equals(call.getString("requestId")))request.session.cancel("");call.resolve();}

    @ActivityCallback private void captureResult(PluginCall call, ActivityResult result) {
        Request request=owned;if(request==null)return;
        if(call!=null&&!call.getCallbackId().equals(request.call.getCallbackId()))return;
        Intent data = result.getData();
        if(data!=null&&data.hasExtra("requestId")&&!request.id.equals(data.getStringExtra("requestId")))return;
        active.compareAndSet(request,null);owned=null;
        call=request.call;
        if(request.session.isCancelled()){
            if(data!=null){String photo=data.getStringExtra("id");if(photo!=null&&photo.matches("[a-f0-9-]{36}"))new File(new File(getContext().getCacheDir(),"ream-incoming"),photo).delete();}
            String reason=request.session.reason();request.session.finish();
            if(!reason.isEmpty())call.reject(reason);else{JSObject cancelled=new JSObject();cancelled.put("cancelled",true);call.resolve(cancelled);}return;
        }
        request.session.finish();
        JSObject response = new JSObject();
        if (data != null && data.hasExtra("error")) { call.reject(data.getStringExtra("error")); return; }
        response.put("gallery", data != null && data.getBooleanExtra("gallery", false));
        if (result.getResultCode() != Activity.RESULT_OK || data == null) {
            response.put("cancelled", true); call.resolve(response); return;
        }
        String id = data.getStringExtra("id");
        if (id == null || !id.matches("[a-f0-9-]{36}")) { call.reject("Invalid camera result."); return; }
        File file = new File(new File(getContext().getCacheDir(), "ream-incoming"), id);
        if (!file.isFile() || file.length() == 0 || file.length() > 128L * 1024 * 1024) {
            file.delete(); call.reject("The captured photo is unavailable or exceeds 128 MB."); return;
        }
        response.put("id", id); response.put("size", file.length());
        response.put("name", "scan-" + System.currentTimeMillis() + ".jpg");
        response.put("mime", "image/jpeg");
        response.put("width", data.getIntExtra("width", 0));
        response.put("height", data.getIntExtra("height", 0));
        try { response.put("corners", new JSArray(data.getStringExtra("corners") == null ? "[]" : data.getStringExtra("corners"))); }
        catch (org.json.JSONException error) { response.put("corners", new JSArray()); }
        call.resolve(response);
    }
    @Override protected void handleOnDestroy(){Request request=owned;owned=null;if(request!=null){request.session.cancel("Camera operation was interrupted.");active.compareAndSet(request,null);request.call.reject("Camera operation was interrupted.");}}
}
