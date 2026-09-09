package com.reampdf.mobile;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.View;

/** Frame-synchronized page outline; no allocations in the draw loop. */
final class DocumentOutlineView extends View {
    static final float BORDER_DP = 3f * .8f;
    private static final long TWEEN_MS = 32, EXPIRE_MS = 180;
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path border = new Path(), corners = new Path();
    private final float[] from = new float[8], target = new float[8], current = new float[8];
    private final float density;
    private boolean visible, stable, animate = true, expiryPending;
    private long updatedAt;
    private long settingsReadAt = -1000;
    private final Runnable expire = new Runnable() {
        @Override public void run() {
            expiryPending = false;
            if (!visible) return;
            long remaining = EXPIRE_MS - (SystemClock.uptimeMillis() - updatedAt);
            if (remaining <= 0) clear();
            else { expiryPending = true; postDelayed(this, remaining); }
        }
    };

    DocumentOutlineView(Context context) {
        super(context);
        density = getResources().getDisplayMetrics().density;
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(BORDER_DP * density);
        paint.setStrokeJoin(Paint.Join.MITER);
        paint.setStrokeCap(Paint.Cap.ROUND);
        setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
    }

    void set(float[] points, boolean isStable) {
        if (points == null) { clear(); return; }
        long now = SystemClock.uptimeMillis();
        advance(now);
        if (!visible) System.arraycopy(points, 0, current, 0, 8);
        System.arraycopy(current, 0, from, 0, 8);
        System.arraycopy(points, 0, target, 0, 8);
        if (now - settingsReadAt >= 1000) {
            animate = Settings.Global.getFloat(getContext().getContentResolver(), Settings.Global.ANIMATOR_DURATION_SCALE, 1f) != 0;
            settingsReadAt = now;
        }
        updatedAt = now; visible = true; stable = isStable;
        if (!expiryPending) { expiryPending = true; postDelayed(expire, EXPIRE_MS); }
        postInvalidateOnAnimation();
    }

    void clear() {
        visible = false; stable = false;
        removeCallbacks(expire); expiryPending = false; invalidate();
    }

    private float advance(long now) {
        float fraction = animate ? Math.min(1f, Math.max(0, now - updatedAt) / (float) TWEEN_MS) : 1f;
        if (visible) for (int i = 0; i < 8; i++) current[i] = from[i] + (target[i] - from[i]) * fraction;
        return fraction;
    }

    @Override protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (!visible) return;
        float progress = advance(SystemClock.uptimeMillis());
        border.rewind(); corners.rewind();
        border.moveTo(current[0], current[1]);
        for (int i = 1; i < 4; i++) border.lineTo(current[2 * i], current[2 * i + 1]);
        border.close();
        for (int i = 0; i < 4; i++) {
            int before = (i + 3) % 4, after = (i + 1) % 4;
            float x = current[2 * i], y = current[2 * i + 1];
            float ax = current[2 * before] - x, ay = current[2 * before + 1] - y;
            float bx = current[2 * after] - x, by = current[2 * after + 1] - y;
            float a = (float) Math.hypot(ax, ay), b = (float) Math.hypot(bx, by);
            if (a < 1 || b < 1) continue;
            float length = Math.min(20 * density, Math.min(a, b) * .2f);
            corners.moveTo(x + ax * length / a, y + ay * length / a);
            corners.lineTo(x, y);
            corners.lineTo(x + bx * length / b, y + by * length / b);
        }
        paint.setColor(stable ? 0xFF62E5A5 : 0xFFFFD16A);
        paint.setAlpha(165); canvas.drawPath(border, paint);
        paint.setAlpha(255); canvas.drawPath(corners, paint);
        if (progress < 1) postInvalidateOnAnimation();
    }

    @Override protected void onDetachedFromWindow() { clear(); super.onDetachedFromWindow(); }
}
