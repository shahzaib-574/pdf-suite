package com.reampdf.mobile;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.CancellationSignal;
import android.content.res.AssetFileDescriptor;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Imports user-chosen content URIs without broad storage permissions. Share intents and the
 * system photo picker both copy bytes into app cache before JavaScript reads them.
 */
@CapacitorPlugin(name = "FileImporter")
public class FileImporterPlugin extends Plugin {
    private JSArray pending = new JSArray();
    private String pendingError = "";
    private static final long MAX_BYTES = 128L * 1024 * 1024;
    private static final int MAX_FILES = 200;
    private static final int DEFAULT_PICK_MAX = 100;
    private final NativeImportWorker imports = new NativeImportWorker();
    private final AtomicReference<PickerRequest> picker = new AtomicReference<>();
    private static final class ImportValidationException extends IllegalArgumentException {
        ImportValidationException(String message) { super(message); }
    }
    private String safeImportError(Exception error, String fallback) {
        return error instanceof ImportValidationException ? error.getMessage() : fallback;
    }
    private static final class PickerRequest {
        final String id;
        final PluginCall call;
        final NativeImportWorker.Job job = new NativeImportWorker.Job();
        private boolean settled;
        String phase = "";
        long progressBytes;
        PickerRequest(String id, PluginCall call) { this.id = id; this.call = call; }
        synchronized void respond(JSArray files, boolean cancelled, String error) {
            if (settled) return;
            settled = true;
            JSObject result = new JSObject();
            result.put("files", files);
            result.put("cancelled", cancelled);
            result.put("error", error);
            call.resolve(result);
        }
        synchronized void complete(JSArray files) {
            if (settled) return;
            if (job.publish()) respond(files, false, "");
            else respond(new JSArray(), true, "");
        }
        synchronized void cancel(NativeImportWorker worker) {
            // Publication and cancellation share this lock: delivered files now belong to JS.
            if (settled) return;
            worker.cancel(job);
            respond(new JSArray(), true, "");
        }
    }
    private void progress(PickerRequest request, String phase, long bytes, int count) {
        if (request == null || request.job.isCancelled()) return;
        boolean phaseChanged;
        synchronized (request) {
            phaseChanged = !phase.equals(request.phase);
            // At most128 byte-progress events for the128MB cap, plus phase boundaries.
            if (!phaseChanged && bytes - request.progressBytes < 1024 * 1024) return;
            request.phase = phase;
            request.progressBytes = bytes;
        }
        JSObject event = new JSObject();
        event.put("requestId", request.id);
        event.put("phase", phase);
        event.put("bytes", bytes);
        event.put("files", count);
        notifyListeners("importProgress", event);
        if (BuildConfig.DEBUG && phaseChanged)
            android.util.Log.d("ReamImport", "phase=" + phase + " bytes=" + bytes + " files=" + count);
    }

    @Override public void load() {
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
        collectClipUris(intent, uris);
        if (uris.isEmpty()) return;
        if (uris.size() == 1 && "application/pdf".equalsIgnoreCase(intent.getType())) {
            JSObject opening = new JSObject(); opening.put("openingPdf", true);
            notifyListeners("incoming", opening, true);
        }
        NativeImportWorker.Job job=new NativeImportWorker.Job();
        if(!imports.submit(job,() -> {
            try {
                JSArray imported = copyUris(uris, false, "Share up to 200 files at a time.", "The shared file is unavailable.", "Shared files exceed 128 MB. Send a smaller group.",job,null);
                synchronized(this) {
                    if(pending.length()>0) throw new ImportValidationException("Finish importing the previous shared files, then share this group again.");
                    if(!job.publish())throw new java.io.InterruptedIOException("Import cancelled");
                    pending=imported;pendingError="";
                }
            } catch(Exception error) {
                synchronized(this) { pendingError=safeImportError(error,"Could not import shared files."); }
            }
            notifyListeners("incoming",new JSObject(),true);
        })){synchronized(this){pendingError="Finish the current import before sharing another group.";}notifyListeners("incoming",new JSObject(),true);}
    }

    @PluginMethod
    public void pickImages(PluginCall call) {
        Integer requested = call.getInt("max", DEFAULT_PICK_MAX);
        int max = Math.min(Math.max(requested == null ? DEFAULT_PICK_MAX : requested, 1), pickImagesMaxLimit());
        String id=call.getString("requestId",UUID.randomUUID().toString());
        if(id==null||!id.matches("[A-Za-z0-9_-]{1,80}")){call.reject("Invalid gallery request.");return;}
        PickerRequest request=new PickerRequest(id,call);
        if (imports.isBusy()||!picker.compareAndSet(null,request)) {
            call.reject("Finish the current gallery selection first.");
            return;
        }
        Intent intent = photoPickerIntent(max);progress(request,"selecting",0,0);
        try {
            startActivityForResult(call, intent, "pickImagesResult");
        } catch (ActivityNotFoundException photoPickerMissing) {
            try {
                startActivityForResult(call, openDocumentIntent(max > 1), "pickImagesResult");
            } catch (RuntimeException documentsMissing) {
                picker.compareAndSet(request,null);
                request.respond(new JSArray(),false,"No gallery picker is available on this device.");
            }
        } catch (RuntimeException error) {
            picker.compareAndSet(request,null);
            request.respond(new JSArray(),false,"Could not open the gallery.");
        }
    }
    @PluginMethod public void cancelPickImages(PluginCall call){PickerRequest request=picker.get();if(request!=null&&request.id.equals(call.getString("requestId"))){request.cancel(imports);}call.resolve();}

    @ActivityCallback
    private void pickImagesResult(PluginCall call, ActivityResult result) {
        PickerRequest request=picker.get();
        if(request==null)return;
        if(call!=null && !call.getCallbackId().equals(request.call.getCallbackId()))return;
        if(request.job.isCancelled()){picker.compareAndSet(request,null);request.respond(new JSArray(),true,"");return;}
        if (result.getResultCode() == Activity.RESULT_CANCELED) {
            picker.compareAndSet(request,null);request.respond(new JSArray(),true,"");
            return;
        }
        if (result.getResultCode() != Activity.RESULT_OK) {
            picker.compareAndSet(request,null);request.respond(new JSArray(),false,"Could not complete the gallery selection.");
            return;
        }
        LinkedHashSet<Uri> uris = new LinkedHashSet<>();
        try{collectResultUris(result.getData(), uris);}catch(RuntimeException error){picker.compareAndSet(request,null);request.respond(new JSArray(),false,"Could not read the gallery result.");return;}
        if (uris.isEmpty()) {
            picker.compareAndSet(request,null);request.respond(new JSArray(),true,"");
            return;
        }
        progress(request,"importing",0,0);
        if(!imports.submit(request.job,() -> {
            try {
                JSArray imported = copyUris(
                    uris,
                    true,
                    "Choose up to 200 photos at a time.",
                    "Could not read one of the selected photos.",
                    "Those photos exceed 128 MB. Choose a smaller group.",request.job,request
                );
                progress(request,"reading",0,imported.length());
                request.complete(imported);
            } catch (SecurityException error) {
                request.respond(new JSArray(),false,"Could not read those photos. Choose them again from the gallery.");
            } catch (Exception error) {
                request.respond(new JSArray(),request.job.isCancelled(),request.job.isCancelled()?"":safeImportError(error,"Could not import those photos. Choose them again from the gallery."));
            }
            finally{picker.compareAndSet(request,null);}
        })){picker.compareAndSet(request,null);request.respond(new JSArray(),false,"Another import is still finishing. Try again.");}
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

    @SuppressLint("NewApi")
    private Intent photoPickerIntent(int max) {
        Intent intent = new Intent(MediaStore.ACTION_PICK_IMAGES);
        intent.setType("image/*");
        if (max > 1) intent.putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, max);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        return intent;
    }

    private Intent openDocumentIntent(boolean multiple) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        if (multiple) intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        return intent;
    }

    @SuppressLint("NewApi")
    private int pickImagesMaxLimit() {
        if (Build.VERSION.SDK_INT >= 33) {
            try {
                return Math.max(2, MediaStore.getPickImagesMaxLimit());
            } catch (RuntimeException ignored) {
                return DEFAULT_PICK_MAX;
            }
        }
        return DEFAULT_PICK_MAX;
    }

    private void collectClipUris(Intent intent, LinkedHashSet<Uri> uris) {
        ClipData clip = intent.getClipData();
        if (clip == null) return;
        for (int i = 0; i < clip.getItemCount(); i++) {
            Uri uri = clip.getItemAt(i).getUri();
            if (uri != null) uris.add(uri);
        }
    }

    @SuppressWarnings("deprecation")
    private void collectResultUris(Intent intent, LinkedHashSet<Uri> uris) {
        if (intent == null) return;
        if (intent.getData() != null) uris.add(intent.getData());
        collectClipUris(intent, uris);
        ArrayList<Uri> stream = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
        if (stream != null) uris.addAll(stream);
    }

    private JSArray copyUris(
        LinkedHashSet<Uri> uris,
        boolean imagesOnly,
        String tooManyMessage,
        String unavailableMessage,
        String tooLargeMessage,NativeImportWorker.Job job,PickerRequest request
    ) throws Exception {
        JSArray imported = new JSArray();
        ArrayList<File> staged = new ArrayList<>();
        try {
            if (uris.size() > MAX_FILES) throw new ImportValidationException(tooManyMessage);
            File root = new File(getContext().getCacheDir(), "ream-incoming");
            if (!root.isDirectory() && !root.mkdirs()) throw new IllegalStateException("Could not prepare local import storage.");
            long total = 0;
            for (Uri uri : uris) {
                job.check();CancellationSignal signal=new CancellationSignal();job.onCancel(signal::cancel);
                if (!"content".equals(uri.getScheme())) throw new ImportValidationException("Choose files from an Android document provider.");
                tryPersistRead(uri);
                String mime = getContext().getContentResolver().getType(uri);
                String name = "document";
                try (Cursor cursor = getContext().getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null,signal)) {
                    if (cursor != null && cursor.moveToFirst()) name = cursor.getString(0);
                } catch (SecurityException error) {
                    throw new SecurityException(unavailableMessage, error);
                }
                if (name == null) name = "document";
                name = name.replaceAll("[\\\\/\\p{Cc}]", "_");
                String lower = name.toLowerCase(Locale.ROOT);
                if (mime == null || "application/octet-stream".equals(mime)) {
                    mime = lower.endsWith(".pdf") ? "application/pdf"
                        : lower.endsWith(".docx") ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        : lower.endsWith(".png") ? "image/png"
                        : lower.endsWith(".webp") ? "image/webp"
                        : lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "image/jpeg"
                        : lower.endsWith(".heic") ? "image/heic"
                        : lower.endsWith(".heif") ? "image/heif"
                        : "";
                }
                if (imagesOnly) {
                    if (!mime.startsWith("image/")) throw new ImportValidationException("Choose photos from the gallery.");
                } else if (!mime.equals("application/pdf") && !mime.equals("application/vnd.openxmlformats-officedocument.wordprocessingml.document") && !mime.startsWith("image/")) {
                    throw new ImportValidationException("Ream accepts PDF, DOCX and image files.");
                }
                String id = UUID.randomUUID().toString();
                File destination = new File(root, id);
                staged.add(destination);job.stage(destination);
                long size = 0;
                try (AssetFileDescriptor descriptor=getContext().getContentResolver().openAssetFileDescriptor(uri,"r",signal)) {
                    if(descriptor==null)throw new ImportValidationException(unavailableMessage);job.own(descriptor);
                    try(InputStream input=descriptor.createInputStream();FileOutputStream output=new FileOutputStream(destination)){
                    job.own(input);
                    if (input == null) throw new ImportValidationException(unavailableMessage);
                    byte[] buffer = new byte[64 * 1024];
                    int length;
                    while ((length = input.read(buffer)) != -1) {
                        job.check();
                        size += length;
                        total += length;
                        if (total > MAX_BYTES) throw new ImportValidationException(tooLargeMessage);
                        output.write(buffer, 0, length);
                        progress(request,"importing",total,imported.length());
                    }
                    job.check();if(size==0)throw new ImportValidationException(unavailableMessage);}
                } catch (SecurityException error) {
                    throw new SecurityException(unavailableMessage, error);
                }
                JSObject item = new JSObject();
                item.put("id", id);
                item.put("name", name);
                item.put("mime", mime);
                item.put("size", size);
                imported.put(item);
            }
            return imported;
        } catch (Exception error) {
            for (File file : staged) file.delete();
            throw error;
        }
    }

    private void tryPersistRead(Uri uri) {
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (SecurityException ignored) {
            // Photo-picker grants are temporary; the copy below uses the grant from the result intent.
        }
    }
    @Override protected void handleOnDestroy(){PickerRequest request=picker.getAndSet(null);if(request!=null){request.cancel(imports);}imports.close();}
}
