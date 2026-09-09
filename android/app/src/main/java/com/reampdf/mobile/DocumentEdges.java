package com.reampdf.mobile;

import org.opencv.core.*;
import org.opencv.imgproc.Imgproc;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

/** Small grayscale analysis only. No color transforms are applied to the saved photograph. */
final class DocumentEdges {
    static final class Detection {
        final Point[] corners;
        final double score;
        Detection(Point[] corners, double score) { this.corners = corners; this.score = score; }
    }

    static Detection detect(Mat input) {
        Mat gray = new Mat(), smooth = new Mat(), edges = new Mat(), binary = new Mat();
        Mat kernel = Imgproc.getStructuringElement(Imgproc.MORPH_RECT, new Size(3, 3));
        try {
            double scale = Math.min(1, 640.0 / Math.max(input.cols(), input.rows()));
            Imgproc.resize(input, gray, new Size(Math.round(input.cols() * scale), Math.round(input.rows() * scale)));
            if (gray.channels() == 4) Imgproc.cvtColor(gray, gray, Imgproc.COLOR_RGBA2GRAY);
            else if (gray.channels() == 3) Imgproc.cvtColor(gray, gray, Imgproc.COLOR_RGB2GRAY);
            Imgproc.GaussianBlur(gray, smooth, new Size(5, 5), 0);
            // Gradient evidence rejects filled rectangles with weak/nonexistent boundaries.
            Imgproc.Canny(smooth, edges, 35, 105);
            Imgproc.morphologyEx(edges, binary, Imgproc.MORPH_CLOSE, kernel);
            Detection best = contours(binary, edges);
            // Otsu contributes paper contours even where print breaks up the Canny contour.
            Imgproc.threshold(smooth, binary, 0, 255, Imgproc.THRESH_BINARY | Imgproc.THRESH_OTSU);
            Imgproc.morphologyEx(binary, binary, Imgproc.MORPH_CLOSE, kernel);
            Detection bright = contours(binary, edges);
            if (bright != null && (best == null || bright.score > best.score)) best = bright;
            Core.bitwise_not(binary, binary);
            Detection dark = contours(binary, edges);
            if (dark != null && (best == null || dark.score > best.score)) best = dark;
            return best;
        } finally { gray.release(); smooth.release(); edges.release(); binary.release(); kernel.release(); }
    }

    private static Detection contours(Mat mask, Mat edges) {
        List<MatOfPoint> contours = new ArrayList<>();
        Mat hierarchy = new Mat(), copy = mask.clone();
        Detection best = null;
        byte[] gradient = new byte[(int) edges.total()]; edges.get(0, 0, gradient);
        try {
            Imgproc.findContours(copy, contours, hierarchy, Imgproc.RETR_LIST, Imgproc.CHAIN_APPROX_SIMPLE);
            // Bound work on cluttered frames; larger shapes are the plausible page candidates.
            contours.sort(Comparator.comparingDouble((MatOfPoint c) -> Math.abs(Imgproc.contourArea(c))).reversed());
            for (int n = 0; n < Math.min(40, contours.size()); n++) {
                MatOfPoint contour = contours.get(n);
                double area = Math.abs(Imgproc.contourArea(contour)) / (mask.cols() * (double) mask.rows());
                if (area < .12 || area > .93) continue;
                MatOfPoint2f curve = new MatOfPoint2f(contour.toArray()), approx = new MatOfPoint2f();
                try {
                    Imgproc.approxPolyDP(curve, approx, Imgproc.arcLength(curve, true) * .02, true);
                    if (approx.total() != 4) continue;
                    Point[] points = order(approx.toArray());
                    if (!plausible(points, mask.cols(), mask.rows())) continue;
                    double support = edgeSupport(points, gradient, edges.cols(), edges.rows());
                    if (support < .55) continue;
                    double score = support * .7 + Math.sqrt(area) * .3;
                    if (best == null || score > best.score) {
                        Point[] normalized = Arrays.stream(points).map(p -> new Point(p.x / (mask.cols() - 1), p.y / (mask.rows() - 1))).toArray(Point[]::new);
                        best = new Detection(normalized, score);
                    }
                } finally { curve.release(); approx.release(); }
            }
            return best;
        } finally { copy.release(); hierarchy.release(); for (MatOfPoint c : contours) c.release(); }
    }

    static Point[] order(Point[] points) {
        double cx = Arrays.stream(points).mapToDouble(p -> p.x).average().orElse(0);
        double cy = Arrays.stream(points).mapToDouble(p -> p.y).average().orElse(0);
        Arrays.sort(points, Comparator.comparingDouble(p -> Math.atan2(p.y - cy, p.x - cx)));
        int start = 0;
        for (int i = 1; i < 4; i++) if (points[i].x + points[i].y < points[start].x + points[start].y) start = i;
        Point[] ordered = new Point[4];
        for (int i = 0; i < 4; i++) ordered[i] = points[(i + start) % 4];
        return ordered;
    }

    private static boolean plausible(Point[] p, int width, int height) {
        for (int i = 0; i < 4; i++) {
            Point a = p[i], b = p[(i + 1) % 4], c = p[(i + 2) % 4];
            if (a.x < 3 || a.y < 3 || a.x > width - 4 || a.y > height - 4) return false;
            double ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
            double u = Math.hypot(ux, uy), v = Math.hypot(vx, vy);
            if (u < Math.min(width, height) * .16 || ux * vy - uy * vx <= 0) return false;
            // Permit perspective while rejecting acute slivers and nearly straight corners.
            if (Math.abs((ux * vx + uy * vy) / (u * v)) > .82) return false;
        }
        return true;
    }

    private static double edgeSupport(Point[] points, byte[] pixels, int width, int height) {
        double minimum = 1;
        for (int side = 0; side < 4; side++) {
            Point a = points[side], b = points[(side + 1) % 4]; int hits = 0;
            for (int sample = 1; sample <= 40; sample++) {
                int x = (int) Math.round(a.x + (b.x - a.x) * sample / 41.0);
                int y = (int) Math.round(a.y + (b.y - a.y) * sample / 41.0);
                boolean found = false;
                for (int dy = -3; dy <= 3 && !found; dy++) for (int dx = -3; dx <= 3; dx++) {
                    int xx = x + dx, yy = y + dy;
                    if (xx >= 0 && yy >= 0 && xx < width && yy < height && pixels[yy * width + xx] != 0) { found = true; break; }
                }
                if (found) hits++;
            }
            minimum = Math.min(minimum, hits / 40.0);
        }
        return minimum;
    }

    static final class Tracker {
        private Point[] previous;
        private int steady;
        private long lastSeen;
        Point[] update(Detection detection, long now) {
            if (now - lastSeen > 450) { previous = null; steady = 0; }
            if (detection == null) {
                if (now - lastSeen > 450) { previous = null; steady = 0; }
                return previous;
            }
            double movement = 1;
            if (previous != null) { movement = 0; for (int i = 0; i < 4; i++) movement = Math.max(movement, Math.hypot(previous[i].x - detection.corners[i].x, previous[i].y - detection.corners[i].y)); }
            steady = movement < .018 ? steady + 1 : 0;
            Point[] next = new Point[4];
            for (int i = 0; i < 4; i++) next[i] = previous != null && movement < .08 ? new Point(previous[i].x * .55 + detection.corners[i].x * .45, previous[i].y * .55 + detection.corners[i].y * .45) : detection.corners[i];
            previous = next; lastSeen = now; return next;
        }
        boolean stable(long now) { return previous != null && steady >= 3 && now - lastSeen < 250; }
    }
}
