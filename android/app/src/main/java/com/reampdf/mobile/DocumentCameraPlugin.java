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
import java.util.concurrent.atomic.AtomicBoolean;

/** Uses the existing chunked FileImporter transport; never sends a full photo over the bridge. */
@CapacitorPlugin(name = "DocumentCamera")
public class DocumentCameraPlugin extends Plugin {
    private final AtomicBoolean active = new AtomicBoolean(false);

    @PluginMethod public void capture(PluginCall call) {
        if (!active.compareAndSet(false, true)) { call.reject("Camera is already open."); return; }
        try {
            startActivityForResult(call, new Intent(getContext(), DocumentCameraActivity.class), "captureResult");
        } catch (RuntimeException error) { active.set(false); call.reject("Could not open the document camera.", error); }
    }

    @ActivityCallback private void captureResult(PluginCall call, ActivityResult result) {
        active.set(false);
        if (call == null) return;
        Intent data = result.getData();
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
}
