package com.reampdf.mobile;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
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
    private final AtomicBoolean pickerInFlight = new AtomicBoolean(false);

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
        execute(() -> {
            try {
                JSArray imported = copyUris(uris, false, "Share up to 200 files at a time.", "The shared file is unavailable.", "Shared files exceed 128 MB. Send a smaller group.");
                synchronized(this) {
                    if(pending.length()>0) throw new IllegalStateException("Finish importing the previous shared files, then share this group again.");
                    pending=imported;pendingError="";
                }
            } catch(Exception error) {
                synchronized(this) { pendingError=error.getMessage()==null?"Could not import shared files.":error.getMessage(); }
            }
            notifyListeners("incoming",new JSObject(),true);
        });
    }

    @PluginMethod
    public void pickImages(PluginCall call) {
        Integer requested = call.getInt("max", DEFAULT_PICK_MAX);
        int max = Math.min(Math.max(requested == null ? DEFAULT_PICK_MAX : requested, 1), pickImagesMaxLimit());
        if (!pickerInFlight.compareAndSet(false, true)) {
            call.reject("Finish the current gallery selection first.");
            return;
        }
        Intent picker = photoPickerIntent(max);
        try {
            startActivityForResult(call, picker, "pickImagesResult");
        } catch (ActivityNotFoundException photoPickerMissing) {
            try {
                startActivityForResult(call, openDocumentIntent(max > 1), "pickImagesResult");
            } catch (ActivityNotFoundException documentsMissing) {
                pickerInFlight.set(false);
                call.reject("No gallery picker is available on this device.");
            }
        } catch (RuntimeException error) {
            pickerInFlight.set(false);
            call.reject("Could not open the gallery.", error);
        }
    }

    @ActivityCallback
    private void pickImagesResult(PluginCall call, ActivityResult result) {
        pickerInFlight.set(false);
        if (call == null) return;
        if (result.getResultCode() == Activity.RESULT_CANCELED) {
            JSObject response = new JSObject();
            response.put("files", new JSArray());
            response.put("cancelled", true);
            response.put("error", "");
            call.resolve(response);
            return;
        }
        if (result.getResultCode() != Activity.RESULT_OK) {
            call.reject("Could not complete the gallery selection.");
            return;
        }
        LinkedHashSet<Uri> uris = new LinkedHashSet<>();
        collectResultUris(result.getData(), uris);
        if (uris.isEmpty()) {
            JSObject response = new JSObject();
            response.put("files", new JSArray());
            response.put("cancelled", true);
            response.put("error", "");
            call.resolve(response);
            return;
        }
        execute(() -> {
            try {
                JSArray imported = copyUris(
                    uris,
                    true,
                    "Choose up to 200 photos at a time.",
                    "Could not read one of the selected photos.",
                    "Those photos exceed 128 MB. Choose a smaller group."
                );
                JSObject response = new JSObject();
                response.put("files", imported);
                response.put("cancelled", false);
                response.put("error", "");
                call.resolve(response);
            } catch (SecurityException error) {
                call.reject("Could not read those photos. Choose them again from the gallery.");
            } catch (Exception error) {
                call.reject(error.getMessage() == null ? "Could not import those photos." : error.getMessage());
            }
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
        String tooLargeMessage
    ) throws Exception {
        JSArray imported = new JSArray();
        ArrayList<File> staged = new ArrayList<>();
        try {
            if (uris.size() > MAX_FILES) throw new IllegalArgumentException(tooManyMessage);
            File root = new File(getContext().getCacheDir(), "ream-incoming");
            if (!root.isDirectory() && !root.mkdirs()) throw new IllegalStateException("Could not prepare local import storage.");
            long total = 0;
            for (Uri uri : uris) {
                if (!"content".equals(uri.getScheme())) throw new IllegalArgumentException("Choose files from an Android document provider.");
                tryPersistRead(uri);
                String mime = getContext().getContentResolver().getType(uri);
                String name = "document";
                try (Cursor cursor = getContext().getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
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
                    if (!mime.startsWith("image/")) throw new IllegalArgumentException("Choose photos from the gallery.");
                } else if (!mime.equals("application/pdf") && !mime.equals("application/vnd.openxmlformats-officedocument.wordprocessingml.document") && !mime.startsWith("image/")) {
                    throw new IllegalArgumentException("Ream accepts PDF, DOCX and image files.");
                }
                String id = UUID.randomUUID().toString();
                File destination = new File(root, id);
                staged.add(destination);
                long size = 0;
                try (InputStream input = getContext().getContentResolver().openInputStream(uri); FileOutputStream output = new FileOutputStream(destination)) {
                    if (input == null) throw new IllegalArgumentException(unavailableMessage);
                    byte[] buffer = new byte[64 * 1024];
                    int length;
                    while ((length = input.read(buffer)) != -1) {
                        size += length;
                        total += length;
                        if (total > MAX_BYTES) throw new IllegalArgumentException(tooLargeMessage);
                        output.write(buffer, 0, length);
                    }
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
}
