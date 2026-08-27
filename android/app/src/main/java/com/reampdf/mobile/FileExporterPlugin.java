package com.reampdf.mobile;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.text.Normalizer;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

/** Saves an app-scoped staged export through Android's Storage Access Framework. */
@CapacitorPlugin(name = "FileExporter")
public class FileExporterPlugin extends Plugin {

    private static final int MAX_FILENAME_LENGTH = 120;
    private final AtomicBoolean pickerInFlight = new AtomicBoolean(false);

    @PluginMethod
    public void saveFile(PluginCall call) {
        String sourcePath = call.getString("sourcePath");
        String filename = call.getString("filename");
        String requestedMimeType = call.getString("mimeType", "application/octet-stream");

        if (sourcePath == null || filename == null) {
            call.reject("sourcePath and filename are required");
            return;
        }

        final File source;
        try {
            source = validatedSource(sourcePath);
        } catch (IOException | IllegalArgumentException | SecurityException exception) {
            call.reject("Invalid staged export", exception);
            return;
        }

        if (!source.isFile() || !source.canRead()) {
            call.reject("Staged export does not exist");
            return;
        }

        if (!pickerInFlight.compareAndSet(false, true)) {
            call.reject("Another save is already in progress");
            return;
        }

        String safeFilename = safeFilename(filename);
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(safeMimeType(requestedMimeType, safeFilename));
        intent.putExtra(Intent.EXTRA_TITLE, safeFilename);
        try {
            startActivityForResult(call, intent, "saveResult");
        } catch (RuntimeException exception) {
            pickerInFlight.set(false);
            cleanupStagedSource(source);
            call.reject("Could not open the system file picker", exception);
        }
    }

    @ActivityCallback
    private void saveResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            pickerInFlight.set(false);
            return;
        }
        // Activity state restoration can recreate this plugin while the picker is open.
        pickerInFlight.set(true);

        if (result.getResultCode() == Activity.RESULT_CANCELED) {
            cleanupStagedSourceFromCall(call);
            pickerInFlight.set(false);
            JSObject response = new JSObject();
            response.put("cancelled", true);
            call.resolve(response);
            return;
        }

        if (result.getResultCode() != Activity.RESULT_OK) {
            cleanupStagedSourceFromCall(call);
            pickerInFlight.set(false);
            call.reject("The system file picker returned an unexpected result");
            return;
        }

        final File source;
        try {
            source = validatedSource(call.getString("sourcePath"));
        } catch (IOException | IllegalArgumentException | SecurityException exception) {
            pickerInFlight.set(false);
            call.reject("Invalid staged export", exception);
            return;
        }

        Intent data = result.getData();
        Uri destination = data == null ? null : data.getData();
        if (destination == null) {
            cleanupStagedSource(source);
            pickerInFlight.set(false);
            call.reject("The selected destination is unavailable");
            return;
        }

        if (!source.isFile() || !source.canRead()) {
            cleanupStagedSource(source);
            pickerInFlight.set(false);
            call.reject("The staged export is no longer available");
            return;
        }

        try {
            execute(() -> {
                try (
                    InputStream input = new FileInputStream(source);
                    OutputStream output = getContext().getContentResolver().openOutputStream(destination, "wt")
                ) {
                    if (output == null) throw new IOException("Could not open the selected destination");
                    byte[] buffer = new byte[64 * 1024];
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        output.write(buffer, 0, count);
                    }
                    output.flush();
                } catch (IOException | IllegalArgumentException | SecurityException exception) {
                    cleanupStagedSource(source);
                    pickerInFlight.set(false);
                    call.reject("Could not save the export", exception);
                    return;
                }

                // Some document providers commit only when their stream closes, so resolve afterward.
                cleanupStagedSource(source);
                pickerInFlight.set(false);
                JSObject response = new JSObject();
                response.put("cancelled", false);
                response.put("uri", destination.toString());
                call.resolve(response);
            });
        } catch (RuntimeException exception) {
            cleanupStagedSource(source);
            pickerInFlight.set(false);
            call.reject("Could not start the export copy", exception);
        }
    }

    private File validatedSource(String sourcePath) throws IOException {
        if (sourcePath == null || sourcePath.trim().isEmpty()) {
            throw new IllegalArgumentException("Missing source path");
        }
        if (new File(sourcePath).isAbsolute()) {
            throw new IllegalArgumentException("Only relative staged paths are accepted");
        }
        File root = new File(getContext().getCacheDir(), "ream-exports").getCanonicalFile();
        File source = new File(getContext().getCacheDir(), sourcePath).getCanonicalFile();
        String rootPath = root.getPath() + File.separator;
        if (!source.getPath().startsWith(rootPath)) {
            throw new IllegalArgumentException("Source is outside the export directory");
        }
        return source;
    }

    private String safeFilename(String filename) {
        String cleaned = Normalizer
            .normalize(filename, Normalizer.Form.NFKC)
            .replaceAll("[\\\\/:*?\"<>|\\p{Cc}\\p{Cf}]", "_")
            .trim()
            .replaceAll("[. ]+$", "");
        if (cleaned.equals(".") || cleaned.equals("..") || cleaned.isEmpty()) return "Ream export";
        if (cleaned.length() <= MAX_FILENAME_LENGTH) return cleaned;

        int extensionAt = cleaned.lastIndexOf('.');
        if (extensionAt <= 0 || extensionAt < cleaned.length() - 16) {
            return cleaned.substring(0, MAX_FILENAME_LENGTH);
        }
        String extension = cleaned.substring(extensionAt);
        return cleaned.substring(0, Math.max(1, MAX_FILENAME_LENGTH - extension.length())) + extension;
    }

    private String safeMimeType(String requestedMimeType, String filename) {
        String fromFilename = mimeTypeFromFilename(filename);
        if (fromFilename != null) return fromFilename;

        String candidate = requestedMimeType == null
            ? ""
            : requestedMimeType.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
        switch (candidate) {
            case "application/pdf":
            case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            case "application/msword":
            case "application/zip":
            case "image/png":
            case "image/jpeg":
            case "image/webp":
            case "image/avif":
            case "image/gif":
            case "image/bmp":
            case "image/tiff":
            case "image/heic":
            case "image/heif":
            case "image/svg+xml":
            case "text/plain":
                return candidate;
            default:
                return "application/octet-stream";
        }
    }

    private String mimeTypeFromFilename(String filename) {
        String lower = filename.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".pdf")) return "application/pdf";
        if (lower.endsWith(".docx")) {
            return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        }
        if (lower.endsWith(".doc")) return "application/msword";
        if (lower.endsWith(".zip")) return "application/zip";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".avif")) return "image/avif";
        if (lower.endsWith(".gif")) return "image/gif";
        if (lower.endsWith(".bmp")) return "image/bmp";
        if (lower.endsWith(".tif") || lower.endsWith(".tiff")) return "image/tiff";
        if (lower.endsWith(".heic")) return "image/heic";
        if (lower.endsWith(".heif")) return "image/heif";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".txt")) return "text/plain";
        return null;
    }

    private void cleanupStagedSource(File source) {
        if (source == null) return;
        try {
            if (source.exists()) source.delete();
            File root = new File(getContext().getCacheDir(), "ream-exports").getCanonicalFile();
            File parent = source.getParentFile();
            if (
                parent != null &&
                parent.getCanonicalFile().getParentFile() != null &&
                parent.getCanonicalFile().getParentFile().equals(root)
            ) {
                String[] children = parent.list();
                if (children != null && children.length == 0) parent.delete();
            }
        } catch (IOException | SecurityException ignored) {
            // Cache pruning provides a bounded fallback if immediate cleanup is unavailable.
        }
    }

    private void cleanupStagedSourceFromCall(PluginCall call) {
        try {
            cleanupStagedSource(validatedSource(call.getString("sourcePath")));
        } catch (IOException | IllegalArgumentException | SecurityException ignored) {
            // Invalid paths are never deleted; the TypeScript layer also removes its UUID directory.
        }
    }
}
