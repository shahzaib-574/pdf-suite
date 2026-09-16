package com.reampdf.mobile;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.*;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.LayerDrawable;
import android.graphics.drawable.RippleDrawable;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.*;
import android.widget.*;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.camera.core.*;
import androidx.camera.core.resolutionselector.*;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.camera.view.transform.*;
import androidx.core.content.ContextCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.exifinterface.media.ExifInterface;
import com.google.common.util.concurrent.ListenableFuture;
import org.json.JSONArray;
import org.json.JSONObject;
import org.opencv.android.OpenCVLoader;
import org.opencv.android.Utils;
import org.opencv.core.CvType;
import org.opencv.core.Mat;
import org.opencv.core.Point;
import java.io.File;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/** Dedicated native camera: independent full-resolution stills and bounded live analysis. */
@androidx.annotation.OptIn(markerClass = androidx.camera.view.TransformExperimental.class)
public class DocumentCameraActivity extends AppCompatActivity {
    private PreviewView preview;
    private DocumentOutlineView outline;
    private TextView status;
    private Button shutter, torch, gallery;
    private ProcessCameraProvider provider;
    private ImageCapture capture;
    private androidx.camera.core.Camera camera;
    private final ExecutorService analysisExecutor = Executors.newSingleThreadExecutor();
    private final ExecutorService photoExecutor = Executors.newSingleThreadExecutor();
    private final DocumentEdges.Tracker tracker = new DocumentEdges.Tracker();
    private DocumentEdges.Detector detector;
    private Mat analysisGray;
    private byte[] luminance = new byte[0], luminanceRow = new byte[0];
    private final ImageProxyTransformFactory transformFactory = new ImageProxyTransformFactory();
    private final AtomicReference<LiveResult> pendingResult = new AtomicReference<>();
    private final AtomicBoolean resultScheduled = new AtomicBoolean();
    private long lastAnalysis;
    private double averageAnalysisMs;
    private int analyzedGeneration = -1;
    private volatile int generation;
    private volatile boolean busy;
    private boolean torchOn;
    private volatile boolean stopped = true;
    private File pendingPhoto;
    private final ActivityResultLauncher<String> permission = registerForActivityResult(
        new ActivityResultContracts.RequestPermission(), granted -> {
            if (granted) startCamera(); else fail("Camera permission was denied. Allow it in Android Settings or choose a gallery photo.");
        });

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (!OpenCVLoader.initLocal()) { fail("The document detector could not start. Please reinstall this APK."); return; }
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(color(R.color.camera_bg));
        preview = new PreviewView(this); preview.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);
        preview.setScaleType(PreviewView.ScaleType.FIT_CENTER);
        root.addView(preview, new FrameLayout.LayoutParams(-1, -1));
        outline = new DocumentOutlineView(this); root.addView(outline, new FrameLayout.LayoutParams(-1, -1));

        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(dp(16), dp(10), dp(16), dp(10));
        top.setBackgroundColor(color(R.color.camera_scrim));
        ImageButton close = iconButton(R.drawable.ic_camera_back, "Close");
        close.setOnClickListener(v -> finish());
        top.addView(close, new LinearLayout.LayoutParams(dp(48), dp(48)));
        TextView title = new TextView(this);
        title.setText("Document camera");
        title.setTextColor(color(R.color.camera_ink));
        title.setTextSize(16);
        title.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));
        title.setLetterSpacing(-0.03f);
        title.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(0, -2, 1);
        titleParams.setMargins(dp(10), 0, dp(10), 0);
        top.addView(title, titleParams);
        torch = iconTextButton(R.drawable.ic_camera_flash, "Light off");
        torch.setEnabled(false);
        torch.setAlpha(0.45f);
        torch.setOnClickListener(v -> {
            if (camera == null || !camera.getCameraInfo().hasFlashUnit()) return;
            torchOn = !torchOn;
            camera.getCameraControl().enableTorch(torchOn);
            torch.setText(torchOn ? "Light on" : "Light off");
            torch.setContentDescription(torchOn ? "Light on" : "Light off");
            torch.setAlpha(1f);
        });
        top.addView(torch);
        root.addView(top, new FrameLayout.LayoutParams(-1, -2, Gravity.TOP));

        LinearLayout bottom = new LinearLayout(this);
        bottom.setOrientation(LinearLayout.VERTICAL);
        bottom.setGravity(Gravity.CENTER_HORIZONTAL);
        bottom.setPadding(dp(20), dp(16), dp(20), dp(16));
        bottom.setBackgroundColor(color(R.color.camera_scrim));
        status = new TextView(this);
        status.setText("Starting camera…");
        status.setTextColor(color(R.color.camera_ink));
        status.setTextSize(14);
        status.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        status.setGravity(Gravity.CENTER);
        status.setLetterSpacing(-0.02f);
        LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(-1, -2);
        statusParams.setMargins(0, 0, 0, dp(14));
        bottom.addView(status, statusParams);

        LinearLayout controls = new LinearLayout(this);
        controls.setGravity(Gravity.CENTER_VERTICAL);
        gallery = iconTextButton(R.drawable.ic_camera_images, "Gallery");
        gallery.setOnClickListener(v -> {
            if (!busy) {
                setResult(RESULT_CANCELED, new Intent().putExtra("gallery", true));
                finish();
            }
        });
        LinearLayout left = new LinearLayout(this);
        left.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        left.addView(gallery, new LinearLayout.LayoutParams(-2, dp(48)));
        controls.addView(left, new LinearLayout.LayoutParams(0, -2, 1));
        shutter = shutterButton();
        shutter.setEnabled(false);
        shutter.setAlpha(0.55f);
        shutter.setOnClickListener(v -> takePhoto());
        LinearLayout.LayoutParams shootParams = new LinearLayout.LayoutParams(dp(72), dp(72));
        shootParams.setMargins(dp(12), 0, dp(12), 0);
        controls.addView(shutter, shootParams);
        View spacer = new View(this);
        controls.addView(spacer, new LinearLayout.LayoutParams(0, dp(48), 1));
        bottom.addView(controls, new LinearLayout.LayoutParams(-1, -2));

        TextView shutterLabel = new TextView(this);
        shutterLabel.setText("Take photo");
        shutterLabel.setTextColor(color(R.color.camera_ink));
        shutterLabel.setTextSize(12);
        shutterLabel.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        shutterLabel.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams labelParams = new LinearLayout.LayoutParams(-1, -2);
        labelParams.setMargins(0, dp(8), 0, dp(6));
        bottom.addView(shutterLabel, labelParams);
        TextView note = new TextView(this);
        note.setText("Tap to focus • Review the crop after capture");
        note.setTextColor(color(R.color.camera_muted));
        note.setTextSize(12);
        note.setGravity(Gravity.CENTER);
        bottom.addView(note);
        root.addView(bottom, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            androidx.core.graphics.Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            top.setPadding(dp(16) + bars.left, dp(10) + bars.top, dp(16) + bars.right, dp(10));
            bottom.setPadding(dp(20) + bars.left, dp(16), dp(20) + bars.right, dp(16) + bars.bottom);
            return insets;
        });
        setContentView(root);
        preview.setOnTouchListener((view, event) -> {
            if (event.getAction() == MotionEvent.ACTION_UP && camera != null && !busy) {
                view.performClick();
                MeteringPoint point = preview.getMeteringPointFactory().createPoint(event.getX(), event.getY());
                camera.getCameraControl().startFocusAndMetering(new FocusMeteringAction.Builder(point).setAutoCancelDuration(4, TimeUnit.SECONDS).build());
                return true;
            }
            return true;
        });
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) startCamera();
        else permission.launch(Manifest.permission.CAMERA);
    }

    private int color(int id) { return ContextCompat.getColor(this, id); }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private void fail(String message) { setResult(RESULT_CANCELED, new Intent().putExtra("error", message)); finish(); }

    private ImageButton iconButton(int icon, String label) {
        ImageButton button = new ImageButton(this);
        button.setImageResource(icon);
        button.setContentDescription(label);
        button.setBackground(ripple(chipShape(dp(16)), color(R.color.camera_ripple)));
        button.setPadding(dp(12), dp(12), dp(12), dp(12));
        button.setScaleType(ImageView.ScaleType.CENTER);
        button.setStateListAnimator(null);
        button.setElevation(0);
        return button;
    }

    private Button iconTextButton(int icon, String label) {
        Button button = new Button(this, null, android.R.attr.borderlessButtonStyle);
        button.setText(label);
        button.setAllCaps(false);
        button.setContentDescription(label);
        button.setTextColor(color(R.color.camera_ink));
        button.setTextSize(13);
        button.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        button.setLetterSpacing(-0.02f);
        button.setCompoundDrawablesRelativeWithIntrinsicBounds(icon, 0, 0, 0);
        button.setCompoundDrawablePadding(dp(8));
        button.setBackground(ripple(chipShape(dp(16)), color(R.color.camera_ripple)));
        button.setPadding(dp(14), dp(10), dp(16), dp(10));
        button.setMinHeight(dp(48));
        button.setStateListAnimator(null);
        button.setElevation(0);
        button.setGravity(Gravity.CENTER);
        return button;
    }

    private Button shutterButton() {
        Button button = new Button(this, null, android.R.attr.borderlessButtonStyle);
        button.setText("");
        button.setContentDescription("Take photo");
        button.setBackground(ripple(shutterShape(), color(R.color.camera_ripple)));
        button.setMinWidth(dp(72));
        button.setMinHeight(dp(72));
        button.setPadding(0, 0, 0, 0);
        button.setStateListAnimator(null);
        button.setElevation(0);
        button.setIncludeFontPadding(false);
        return button;
    }

    private GradientDrawable chipShape(int radius) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(color(R.color.camera_surface));
        shape.setCornerRadius(radius);
        shape.setStroke(Math.max(1, dp(1)), color(R.color.camera_line));
        return shape;
    }

    private LayerDrawable shutterShape() {
        GradientDrawable fill = new GradientDrawable();
        fill.setShape(GradientDrawable.OVAL);
        fill.setColors(new int[] { color(R.color.camera_primary), color(R.color.camera_primary_strong) });
        fill.setOrientation(GradientDrawable.Orientation.TL_BR);
        GradientDrawable ring = new GradientDrawable();
        ring.setShape(GradientDrawable.OVAL);
        ring.setColor(Color.TRANSPARENT);
        ring.setStroke(dp(3), color(R.color.camera_ink));
        LayerDrawable layer = new LayerDrawable(new android.graphics.drawable.Drawable[] { fill, ring });
        layer.setLayerInset(1, dp(7), dp(7), dp(7), dp(7));
        return layer;
    }

    private RippleDrawable ripple(android.graphics.drawable.Drawable content, int rippleColor) {
        return new RippleDrawable(ColorStateList.valueOf(rippleColor), content, content);
    }

    private void startCamera() {
        ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(this);
        future.addListener(() -> {
            if (isFinishing() || isDestroyed()) return;
            try {
                provider = future.get();
                ResolutionSelector stillResolution = new ResolutionSelector.Builder()
                    .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
                    .setResolutionStrategy(ResolutionStrategy.HIGHEST_AVAILABLE_STRATEGY).build();
                Preview stream = new Preview.Builder().setResolutionSelector(new ResolutionSelector.Builder()
                    .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY).build()).build();
                stream.setSurfaceProvider(preview.getSurfaceProvider());
                capture = new ImageCapture.Builder().setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
                    .setJpegQuality(100).setResolutionSelector(stillResolution).build();
                ImageAnalysis analysis = new ImageAnalysis.Builder()
                    .setResolutionSelector(new ResolutionSelector.Builder().setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
                        .setResolutionStrategy(new ResolutionStrategy(new android.util.Size(640, 480), ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER)).build())
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build();
                analysis.setAnalyzer(analysisExecutor, this::analyze);
                provider.unbindAll();
                camera = provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, stream, capture, analysis);
                shutter.setEnabled(true);
                shutter.setAlpha(1f);
                torch.setEnabled(camera.getCameraInfo().hasFlashUnit());
                torch.setAlpha(camera.getCameraInfo().hasFlashUnit() ? 1f : 0.45f);
                setDetectionStatus("Place the whole page in view");
            } catch (Exception error) { fail("This camera could not start preview, photo capture and live detection together. Try the gallery or another device."); }
        }, ContextCompat.getMainExecutor(this));
    }

    private static final class LiveResult {
        final float[] points;
        final OutputTransform source;
        final boolean stable;
        final long started;
        final int generation;
        LiveResult(float[] points, OutputTransform source, boolean stable, long started, int generation) {
            this.points = points; this.source = source; this.stable = stable;
            this.started = started; this.generation = generation;
        }
    }

    private void analyze(ImageProxy image) {
        long started = SystemClock.elapsedRealtime();
        int frameGeneration = generation;
        boolean processed = false;
        try {
            // About 30 analyses/s on fast devices; leave CPU headroom on slow frames.
            long interval = Math.max(33, Math.min(80, Math.round(averageAnalysisMs * 1.4)));
            if (stopped || busy || started - lastAnalysis < interval) return;
            processed = true; lastAnalysis = started;
            if (analyzedGeneration != frameGeneration) { tracker.reset(); analyzedGeneration = frameGeneration; }
            if (detector == null) { detector = new DocumentEdges.Detector(); analysisGray = new Mat(); }
            int width = image.getWidth(), height = image.getHeight();
            ImageProxy.PlaneProxy plane = image.getPlanes()[0];
            if (luminance.length != width * height) luminance = new byte[width * height];
            int rowBytes = (width - 1) * plane.getPixelStride() + 1;
            if (plane.getPixelStride() != 1 && luminanceRow.length < rowBytes) luminanceRow = new byte[rowBytes];
            LumaPlane.copy(plane.getBuffer(), width, height, plane.getRowStride(), plane.getPixelStride(), luminance, luminanceRow);
            analysisGray.create(height, width, CvType.CV_8UC1); analysisGray.put(0, 0, luminance);
            DocumentEdges.Detection found = detector.detect(analysisGray);
            Point[] points = tracker.update(found, started);
            float[] mapped = points == null ? null : new float[8];
            if (points != null) for (int i = 0; i < 4; i++) {
                mapped[i * 2] = (float) (points[i].x * (width - 1));
                mapped[i * 2 + 1] = (float) (points[i].y * (height - 1));
            }
            publish(new LiveResult(mapped, transformFactory.getOutputTransform(image), tracker.stable(started), started, frameGeneration));
        } catch (RuntimeException error) {
            tracker.reset();
            publish(new LiveResult(null, null, false, started, frameGeneration));
        } finally {
            if (processed) {
                double cost = SystemClock.elapsedRealtime() - started;
                averageAnalysisMs = averageAnalysisMs == 0 ? cost : averageAnalysisMs * .8 + cost * .2;
            }
            image.close();
        }
    }

    private void publish(LiveResult result) {
        pendingResult.set(result);
        if (resultScheduled.compareAndSet(false, true)) outline.postOnAnimation(this::showLatestResult);
    }

    private void showLatestResult() {
        resultScheduled.set(false);
        LiveResult result = pendingResult.getAndSet(null);
        if (result == null || stopped || busy || isFinishing() || result.generation != generation) return;
        if (SystemClock.elapsedRealtime() - result.started > 150) { outline.clear(); setDetectionStatus("Hold steady"); return; }
        OutputTransform target = preview.getOutputTransform();
        if (result.points != null && target != null) {
            try {
                new CoordinateTransform(result.source, target).mapPoints(result.points);
                outline.set(result.points, result.stable);
                setDetectionStatus(result.stable ? "Page found — ready to capture" : "Hold steady");
            } catch (RuntimeException error) { outline.clear(); setDetectionStatus("Edges unclear — capture and adjust manually"); }
        } else { outline.clear(); setDetectionStatus("Find all four edges • Use a contrasting background"); }
    }

    private void setDetectionStatus(String message) {
        if (message.contentEquals(status.getText())) return;
        status.setText(message);
        boolean ready = message.startsWith("Page found");
        status.setTextColor(color(ready ? R.color.camera_ready : R.color.camera_ink));
    }

    private void takePhoto() {
        if (busy || capture == null) return;
        busy = true; shutter.setEnabled(false); shutter.setAlpha(0.55f); setDetectionStatus("Taking full-resolution photo…");
        File root = new File(getCacheDir(), "ream-incoming");
        if (!root.isDirectory() && !root.mkdirs()) { fail("Could not create camera storage."); return; }
        String id = UUID.randomUUID().toString(); File file = new File(root, id); pendingPhoto = file;
        capture.setTargetRotation(preview.getDisplay().getRotation());
        capture.takePicture(new ImageCapture.OutputFileOptions.Builder(file).build(), photoExecutor, new ImageCapture.OnImageSavedCallback() {
            @Override public void onImageSaved(@NonNull ImageCapture.OutputFileResults result) {
                if (isFinishing() || isDestroyed()) { file.delete(); return; }
                try {
                    if (file.length() > 128L * 1024 * 1024) throw new IllegalStateException("Photo exceeds 128 MB.");
                    BitmapFactory.Options options = new BitmapFactory.Options(); options.inJustDecodeBounds = true;
                    BitmapFactory.decodeFile(file.getPath(), options); int width = options.outWidth, height = options.outHeight;
                    if (width <= 0 || height <= 0) throw new IllegalStateException("Camera returned an unreadable photograph.");
                    options.inJustDecodeBounds = false; options.inSampleSize = 1;
                    while (Math.max(width, height) / options.inSampleSize > 1000) options.inSampleSize *= 2;
                    Bitmap bitmap = BitmapFactory.decodeFile(file.getPath(), options);
                    if (bitmap == null) throw new IllegalStateException("Could not inspect the photo.");
                    int rotation = new ExifInterface(file).getRotationDegrees();
                    Matrix rotate = new Matrix(); rotate.postRotate(rotation);
                    Bitmap upright = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), rotate, true);
                    Mat mat = new Mat(); DocumentEdges.Detection detection;
                    try { Utils.bitmapToMat(upright, mat); detection = DocumentEdges.detect(mat); }
                    finally { mat.release(); if (upright != bitmap) upright.recycle(); bitmap.recycle(); }
                    JSONArray corners = new JSONArray();
                    if (detection != null) for (Point point : detection.corners) corners.put(new JSONObject().put("x", point.x).put("y", point.y));
                    Intent data = new Intent().putExtra("id", id).putExtra("width", rotation % 180 == 0 ? width : height)
                        .putExtra("height", rotation % 180 == 0 ? height : width).putExtra("corners", corners.toString());
                    runOnUiThread(() -> {
                        if (isFinishing() || isDestroyed()) { file.delete(); return; }
                        pendingPhoto = null; setResult(RESULT_OK, data); finish();
                    });
                } catch (Exception error) { file.delete(); runOnUiThread(() -> fail("Could not read the captured photo. Please try again.")); }
            }
            @Override public void onError(@NonNull ImageCaptureException error) {
                file.delete(); runOnUiThread(() -> { if (!isFinishing()) { busy = false; shutter.setEnabled(true); shutter.setAlpha(1f); setDetectionStatus("Capture failed. Please try again."); } });
            }
        });
    }

    @Override protected void onResume() { super.onResume(); generation++; stopped = false; }
    @Override protected void onPause() { stopped = true; generation++; pendingResult.set(null); if (outline != null) outline.clear(); super.onPause(); }
    @Override protected void onDestroy() {
        stopped = true; if (provider != null) provider.unbindAll();
        analysisExecutor.execute(() -> {
            if (detector != null) detector.close();
            if (analysisGray != null) analysisGray.release();
        });
        analysisExecutor.shutdown(); photoExecutor.shutdown();
        if (pendingPhoto != null && isFinishing()) pendingPhoto.delete();
        super.onDestroy();
    }

}
