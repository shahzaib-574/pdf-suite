package com.reampdf.mobile;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.UUID;

/** Receives user-shared content URIs without broad storage permissions. */
@CapacitorPlugin(name = "FileImporter")
public class FileImporterPlugin extends Plugin {
    private JSArray pending = new JSArray();
    private String pendingError = "";
    private static final long MAX_BYTES = 128L * 1024 * 1024;

    @Override public void load() {
        // Remove abandoned imports older than one day, never unrelated cache files.
        File root = new File(getContext().getCacheDir(), "ream-incoming");
        File[] files = root.listFiles();
        if (files != null) for (File file : files) if (file.isFile() && file.lastModified() < System.currentTimeMillis() - 86400000L) file.delete();
        receive(getActivity().getIntent());
    }
    @Override protected void handleOnNewIntent(Intent intent) { receive(intent); }

    @SuppressWarnings("deprecation")
    private void receive(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        LinkedHashSet<Uri> uris = new LinkedHashSet<>();
        if (Intent.ACTION_VIEW.equals(action) && intent.getData() != null) uris.add(intent.getData());
        else if (Intent.ACTION_SEND.equals(action)) { Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM); if (uri != null) uris.add(uri); }
        else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) { ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM); if (list != null) uris.addAll(list); }
        else return;
        if (intent.getClipData() != null) for (int i=0; i<intent.getClipData().getItemCount(); i++) { Uri uri=intent.getClipData().getItemAt(i).getUri(); if(uri!=null) uris.add(uri); }
        if (uris.isEmpty()) return;
        execute(() -> {
            JSArray imported = new JSArray();
            ArrayList<File> staged = new ArrayList<>();
            try {
                if (uris.size() > 200) throw new IllegalArgumentException("Share up to 200 files at a time.");
                File root = new File(getContext().getCacheDir(), "ream-incoming");
                if (!root.isDirectory() && !root.mkdirs()) throw new IllegalStateException("Could not prepare local import storage.");
                long total=0;
                for (Uri uri : uris) {
                    if (!"content".equals(uri.getScheme())) throw new IllegalArgumentException("Choose files from an Android document provider.");
                    String mime=getContext().getContentResolver().getType(uri);
                    String name="document";
                    try(Cursor cursor=getContext().getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)) { if(cursor!=null&&cursor.moveToFirst()) name=cursor.getString(0); }
                    if(name==null) name="document";
                    name=name.replaceAll("[\\\\/\\p{Cc}]", "_");
                    String lower=name.toLowerCase(Locale.ROOT);
                    if(mime==null||"application/octet-stream".equals(mime)) mime=lower.endsWith(".pdf")?"application/pdf":lower.endsWith(".docx")?"application/vnd.openxmlformats-officedocument.wordprocessingml.document":lower.endsWith(".png")?"image/png":lower.endsWith(".webp")?"image/webp":lower.endsWith(".jpg")||lower.endsWith(".jpeg")?"image/jpeg":"";
                    if (!mime.equals("application/pdf")&&!mime.equals("application/vnd.openxmlformats-officedocument.wordprocessingml.document")&&!mime.startsWith("image/")) throw new IllegalArgumentException("Ream accepts PDF, DOCX and image files.");
                    String id=UUID.randomUUID().toString(); File destination=new File(root,id); staged.add(destination);
                    long size=0;
                    try(InputStream input=getContext().getContentResolver().openInputStream(uri);FileOutputStream output=new FileOutputStream(destination)) {
                        if(input==null) throw new IllegalArgumentException("The shared file is unavailable.");
                        byte[] buffer=new byte[64*1024]; int length;
                        while((length=input.read(buffer))!=-1) { size+=length;total+=length;if(total>MAX_BYTES)throw new IllegalArgumentException("Shared files exceed 128 MB. Send a smaller group.");output.write(buffer,0,length); }
                    }
                    JSObject item=new JSObject();item.put("id",id);item.put("name",name);item.put("mime",mime);item.put("size",size); imported.put(item);
                }
                synchronized(this) {
                    if(pending.length()>0) throw new IllegalStateException("Finish importing the previous shared files, then share this group again.");
                    pending=imported;pendingError="";
                }
            } catch(Exception error) {
                for(File file:staged) file.delete();
                synchronized(this) { pendingError=error.getMessage()==null?"Could not import shared files.":error.getMessage(); }
            }
            notifyListeners("incoming",new JSObject(),true);
        });
    }
    @PluginMethod public synchronized void takeFiles(PluginCall call) {
        JSObject result=new JSObject(); result.put("files",pending);result.put("error",pendingError);pending=new JSArray();pendingError="";call.resolve(result);
    }
    @PluginMethod public void readChunk(PluginCall call) {
        String id=call.getString("id", "");
        Integer offset=call.getInt("offset",0);
        if(!id.matches("[a-f0-9-]{36}")||offset<0) {call.reject("Invalid import reference");return;}
        execute(() -> {
            File file=new File(new File(getContext().getCacheDir(),"ream-incoming"),id);
            try(FileInputStream input=new FileInputStream(file)) {
                if(offset>file.length())throw new IllegalArgumentException("Invalid import offset");
                input.getChannel().position(offset);byte[] buffer=new byte[192*1024];int size=input.read(buffer);JSObject result=new JSObject();result.put("data",size<0?"":Base64.encodeToString(buffer,0,size,Base64.NO_WRAP));call.resolve(result);
            } catch(Exception error) {call.reject("Could not read the shared file",error);}
        });
    }
    @PluginMethod public void release(PluginCall call) {
        String id=call.getString("id", "");
        if(!id.matches("[a-f0-9-]{36}")) {call.reject("Invalid import reference");return;}
        new File(new File(getContext().getCacheDir(),"ream-incoming"),id).delete();call.resolve();
    }
}
