package com.reampdf.mobile;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.BitmapFactory;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class DocumentCameraActivityTest {
    private Button shutter(View view) {
        if (view instanceof Button && "Take photo".contentEquals(view.getContentDescription() == null ? "" : view.getContentDescription())) return (Button) view;
        if (view instanceof ViewGroup) for (int i=0;i<((ViewGroup)view).getChildCount();i++) {
            Button found = shutter(((ViewGroup)view).getChildAt(i)); if (found != null) return found;
        }
        return null;
    }
    @Test public void nativeShutterReturnsRealJpeg() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        InstrumentationRegistry.getInstrumentation().getUiAutomation().grantRuntimePermission(context.getPackageName(), Manifest.permission.CAMERA);
        try (ActivityScenario<DocumentCameraActivity> scenario = ActivityScenario.launchActivityForResult(new Intent(context, DocumentCameraActivity.class))) {
            AtomicBoolean ready = new AtomicBoolean();
            long deadline = System.currentTimeMillis() + 20000;
            while (!ready.get() && System.currentTimeMillis() < deadline) {
                scenario.onActivity(activity -> { Button button = shutter(activity.getWindow().getDecorView()); ready.set(button != null && button.isEnabled()); });
                if (!ready.get()) Thread.sleep(200);
            }
            assertTrue("Camera preview and still capture must bind", ready.get());
            scenario.onActivity(activity -> shutter(activity.getWindow().getDecorView()).performClick());
            // ActivityScenario waits for completion; the camera returns a private file reference.
            android.app.Instrumentation.ActivityResult result = scenario.getResult();
            assertEquals(Activity.RESULT_OK, result.getResultCode());
            String id = result.getResultData().getStringExtra("id"); assertNotNull(id);
            File photo = new File(new File(context.getCacheDir(),"ream-incoming"),id);
            try {
                assertTrue(photo.length() > 1000);
                BitmapFactory.Options options = new BitmapFactory.Options(); options.inJustDecodeBounds = true;
                BitmapFactory.decodeFile(photo.getPath(),options);
                assertEquals("image/jpeg",options.outMimeType); assertTrue(Math.max(options.outWidth,options.outHeight) >= 640); assertTrue(Math.min(options.outWidth,options.outHeight) >= 480);
                assertNotNull(result.getResultData().getStringExtra("corners"));
            } finally { photo.delete(); }
        }
    }
}
