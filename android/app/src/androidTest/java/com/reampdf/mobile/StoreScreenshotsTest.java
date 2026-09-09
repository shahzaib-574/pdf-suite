package com.reampdf.mobile;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.net.Uri;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.core.content.FileProvider;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.*;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Captures real, signed-release Android framebuffer pixels using a synthetic PDF. */
@RunWith(AndroidJUnit4.class)
public class StoreScreenshotsTest {
    private ActivityScenario<Activity> scenario;
    private File directory;
    private final JSONArray screenshots = new JSONArray();

    private WebView webView(View node) {
        if (node instanceof WebView) return (WebView) node;
        if (node instanceof ViewGroup) for (int i=0;i<((ViewGroup)node).getChildCount();i++) {
            WebView found=webView(((ViewGroup)node).getChildAt(i)); if(found!=null)return found;
        }
        return null;
    }
    private String js(String expression) throws Exception {
        CountDownLatch latch=new CountDownLatch(1); AtomicReference<String> result=new AtomicReference<>("null");
        scenario.onActivity(activity -> {
            WebView web=webView(activity.getWindow().getDecorView());
            if(web==null){latch.countDown();return;}
            web.evaluateJavascript(expression,value->{result.set(value);latch.countDown();});
        });
        assertTrue("WebView evaluation timed out",latch.await(8,TimeUnit.SECONDS));
        return result.get();
    }
    private void until(String expression) throws Exception {
        long deadline=System.currentTimeMillis()+90000;
        while(System.currentTimeMillis()<deadline){if("true".equals(js("Boolean("+expression+")")))return;Thread.sleep(200);}
        throw new AssertionError("App state did not become ready: "+expression+"; visible text="+js("document.body.innerText"));
    }
    private void clickText(String text) throws Exception {
        String quoted=JSONObject.quote(text);
        until("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==="+quoted+"&&!b.disabled)");
        js("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==="+quoted+"&&!b.disabled).click()");
    }
    private static String sha(byte[] data) throws Exception {
        StringBuilder out=new StringBuilder(); for(byte b:MessageDigest.getInstance("SHA-256").digest(data))out.append(String.format("%02x",b&255)); return out.toString();
    }
    private static String fileSha(File file) throws Exception {
        MessageDigest digest=MessageDigest.getInstance("SHA-256");
        try(InputStream input=new FileInputStream(file)){byte[] buffer=new byte[65536];int count;while((count=input.read(buffer))!=-1)digest.update(buffer,0,count);}
        StringBuilder out=new StringBuilder();for(byte b:digest.digest())out.append(String.format("%02x",b&255));return out.toString();
    }
    private void capture(String name) throws Exception {
        until("document.fonts.status==='loaded'"); Thread.sleep(700);
        Bitmap bitmap=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
        assertNotNull(bitmap);assertEquals(1080,bitmap.getWidth());assertEquals(1920,bitmap.getHeight());
        File file=new File(directory,name);assertFalse("Capture must not overwrite an image",file.exists());
        try(OutputStream output=new FileOutputStream(file)){assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG,100,output));}
        finally{bitmap.recycle();}
        screenshots.put(new JSONObject().put("fileName",name).put("capturedAtUtc",Instant.now().toString()).put("sha256",fileSha(file)));
    }

    @Test public void captureSignedReleaseListing() throws Exception {
        Assume.assumeTrue("true".equals(InstrumentationRegistry.getArguments().getString("captureStoreScreenshots")));
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("com.reampdf.mobile",context.getPackageName());assertEquals(36,Build.VERSION.SDK_INT);
        assertEquals("Store captures must use the signed, non-debuggable release",0,context.getApplicationInfo().flags&ApplicationInfo.FLAG_DEBUGGABLE);
        directory=new File(context.getExternalFilesDir(null),"store-screenshots");assertTrue(directory.isDirectory()||directory.mkdirs());
        File export=new File(context.getCacheDir(),"ream-exports");assertTrue(export.isDirectory()||export.mkdirs());
        File fixture=new File(export,"Ream sample document.pdf");
        try(InputStream input=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("ream-screenshot-fixture.pdf");OutputStream output=new FileOutputStream(fixture)){byte[] b=new byte[8192];int n;while((n=input.read(b))!=-1)output.write(b,0,n);}
        File scan=new File(export,"Ream sample scan.png");
        try(ParcelFileDescriptor descriptor=ParcelFileDescriptor.open(fixture,ParcelFileDescriptor.MODE_READ_ONLY);PdfRenderer renderer=new PdfRenderer(descriptor);PdfRenderer.Page sample=renderer.openPage(0)) {
            Bitmap image=Bitmap.createBitmap(1200,Math.round(1200f*sample.getHeight()/sample.getWidth()),Bitmap.Config.ARGB_8888);
            image.eraseColor(Color.WHITE);sample.render(image,null,null,PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
            try(OutputStream output=new FileOutputStream(scan)){assertTrue(image.compress(Bitmap.CompressFormat.PNG,100,output));}finally{image.recycle();}
        }
        Intent launch=context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());assertNotNull(launch);
        scenario=ActivityScenario.launch(launch);
        try {
            until("document.querySelector('.ps-home')");
            capture("01-tools-home-1080x1920.png");
            Uri scanUri=FileProvider.getUriForFile(context,context.getPackageName()+".fileprovider",scan);
            Intent review=new Intent(Intent.ACTION_SEND).setClassName(context,context.getPackageName()+".MainActivity").setType("image/png")
                .putExtra(Intent.EXTRA_STREAM,scanUri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP);
            context.startActivity(review); clickText("Review images");
            until("document.querySelector('.ps-scan-editor__image img')?.naturalWidth>0");
            capture("02-scan-intake-1080x1920.png");
            Uri uri=FileProvider.getUriForFile(context,context.getPackageName()+".fileprovider",fixture);
            Intent open=new Intent(Intent.ACTION_VIEW).setClassName(context,context.getPackageName()+".MainActivity")
                .setDataAndType(uri,"application/pdf").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP);
            context.startActivity(open);
            until("document.querySelector('.ps-reader-page__surface img')?.naturalWidth>0");
            capture("04-pdf-reader-1080x1920.png");
            clickText("Organize"); until("document.querySelectorAll('.ps-organize-card').length===5");
            capture("05-organize-pages-1080x1920.png");
            js("history.back()");until("document.querySelector('.ps-reader-page__surface img')?.naturalWidth>0");
            clickText("Word");until("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Convert to Word'&&!b.disabled)");
            capture("03-pdf-to-word-1080x1920.png");
            clickText("Convert to Word");until("location.hash==='#/result'");
            until("document.body.innerText.includes('Local copy kept in Recents')");
            js("location.hash='#/recents'");until("document.querySelectorAll('.ps-library-item').length>=2");
            capture("06-recents-1080x1920.png");
            PackageInfo info=context.getPackageManager().getPackageInfo(context.getPackageName(),android.content.pm.PackageManager.GET_SIGNING_CERTIFICATES);
            JSONObject manifest=new JSONObject().put("schemaVersion",1).put("packageName",context.getPackageName())
                .put("versionCode",info.getLongVersionCode()).put("versionName",info.versionName).put("androidApiLevel",Build.VERSION.SDK_INT)
                .put("device",new JSONObject().put("manufacturer",Build.MANUFACTURER).put("model",Build.MODEL).put("name",Build.DEVICE))
                .put("serial",InstrumentationRegistry.getArguments().getString("deviceSerial")).put("signingCertificateSha256",sha(info.signingInfo.getApkContentsSigners()[0].toByteArray()))
                .put("installedApkSha256",fileSha(new File(context.getApplicationInfo().sourceDir)))
                .put("generatedAtUtc",Instant.now().toString()).put("screenshots",screenshots);
            try(Writer writer=new FileWriter(new File(directory,"capture-provenance.json"))){writer.write(manifest.toString(2));}
        } finally {scenario.close();}
    }
}
