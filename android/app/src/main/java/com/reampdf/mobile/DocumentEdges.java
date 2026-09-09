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
        try (Detector detector = new Detector()) { return detector.detect(input); }
    }

    /** One instance per analysis thread; native buffers are reused between frames. */
    static final class Detector implements AutoCloseable {
        private final Mat gray = new Mat(), smooth = new Mat(), edges = new Mat();
        private final Mat edgeBand = new Mat(), binary = new Mat(), hierarchy = new Mat();
        private final Mat kernel = Imgproc.getStructuringElement(Imgproc.MORPH_RECT, new Size(3, 3));
        private final Mat supportKernel = Imgproc.getStructuringElement(Imgproc.MORPH_RECT, new Size(7, 7));
        private final MatOfDouble mean = new MatOfDouble(), deviation = new MatOfDouble();
        private byte[] supportedEdges = new byte[0];
        private byte[] tones = new byte[0];

        Detection detect(Mat input) {
            if (input.empty()) return null;
            double scale = Math.min(1, 640.0 / Math.max(input.cols(), input.rows()));
            if (scale == 1) input.copyTo(gray);
            else Imgproc.resize(input, gray, new Size(Math.round(input.cols() * scale), Math.round(input.rows() * scale)), 0, 0, Imgproc.INTER_AREA);
            if (gray.channels() == 4) Imgproc.cvtColor(gray, gray, Imgproc.COLOR_RGBA2GRAY);
            else if (gray.channels() == 3) Imgproc.cvtColor(gray, gray, Imgproc.COLOR_RGB2GRAY);
            Imgproc.GaussianBlur(gray, smooth, new Size(5, 5), 0);
            Core.meanStdDev(smooth, mean, deviation);
            double high = Math.max(45, Math.min(105, deviation.toArray()[0] * 2.4));
            Imgproc.Canny(smooth, edges, high * .34, high);
            // Same three-pixel boundary tolerance as before, computed once in OpenCV
            // instead of scanning a 7x7 neighborhood for every candidate/sample in Java.
            Imgproc.dilate(edges, edgeBand, supportKernel);
            int pixels = (int) edgeBand.total();
            if (supportedEdges.length != pixels) { supportedEdges = new byte[pixels]; tones = new byte[pixels]; }
            edgeBand.get(0, 0, supportedEdges);
            smooth.get(0, 0, tones);
            Imgproc.morphologyEx(edges, binary, Imgproc.MORPH_CLOSE, kernel);
            Detection best = contours(binary);
            // A large, strongly supported page does not need two more contour passes.
            if (best != null && best.score >= .86) return refine(best);
            Imgproc.threshold(smooth, binary, 0, 255, Imgproc.THRESH_BINARY | Imgproc.THRESH_OTSU);
            Imgproc.morphologyEx(binary, binary, Imgproc.MORPH_CLOSE, kernel);
            Detection bright = contours(binary);
            if (bright != null && (best == null || bright.score > best.score)) best = bright;
            if (best != null && best.score >= .86) return refine(best);
            Core.bitwise_not(binary, binary);
            Detection dark = contours(binary);
            if (dark != null && (best == null || dark.score > best.score)) best = dark;
            return refine(best);
        }

        private Detection contours(Mat mask) {
            List<MatOfPoint> found = new ArrayList<>();
            List<Candidate> candidates = new ArrayList<>();
            Detection best = null;
            try {
                // OpenCV >=3.2 leaves the input intact; cloning every mask is unnecessary.
                Imgproc.findContours(mask, found, hierarchy, Imgproc.RETR_LIST, Imgproc.CHAIN_APPROX_SIMPLE);
                for (MatOfPoint contour : found) {
                    double area = Math.abs(Imgproc.contourArea(contour)) / mask.total();
                    if (area >= .12 && area <= .93) candidates.add(new Candidate(contour, area));
                }
                candidates.sort(Comparator.comparingDouble((Candidate c) -> c.area).reversed());
                for (int n = 0; n < Math.min(16, candidates.size()); n++) {
                    Candidate candidate = candidates.get(n);
                    MatOfPoint2f curve = new MatOfPoint2f(candidate.contour.toArray()), approx = new MatOfPoint2f();
                    try {
                        Imgproc.approxPolyDP(curve, approx, Imgproc.arcLength(curve, true) * .02, true);
                        if (approx.total() != 4) continue;
                        Point[] points = order(approx.toArray());
                        if (!plausible(points, mask.cols(), mask.rows())) continue;
                        double support = edgeSupport(points, supportedEdges, mask.cols(), mask.rows());
                        if (support < .55) continue;
                        // Prefer the paper boundary over a slightly larger, weaker shadow.
                        double score = support * .62 + Math.sqrt(candidate.area) * .18 +
                            boundaryContrast(points) * .20;
                        if (best == null || score > best.score) best = new Detection(points, score);
                    } finally { curve.release(); approx.release(); }
                }
                return best;
            } finally { for (MatOfPoint contour : found) contour.release(); }
        }

        private Detection refine(Detection detection) {
            if (detection == null) return null;
            Point[] points = detection.corners;
            MatOfPoint2f refined = new MatOfPoint2f(points);
            try {
                Imgproc.cornerSubPix(smooth, refined, new Size(5, 5), new Size(-1, -1),
                    new TermCriteria(TermCriteria.EPS | TermCriteria.MAX_ITER, 12, .15));
                Point[] adjusted = refined.toArray();
                boolean nearby = true;
                for (int i = 0; i < 4; i++) nearby &= Double.isFinite(adjusted[i].x) && Double.isFinite(adjusted[i].y) &&
                    Math.hypot(adjusted[i].x - points[i].x, adjusted[i].y - points[i].y) <= 6;
                if (nearby && plausible(adjusted, gray.cols(), gray.rows()) &&
                    edgeSupport(adjusted, supportedEdges, gray.cols(), gray.rows()) >= .55) points = adjusted;
                Point[] normalized = new Point[4];
                for (int i = 0; i < 4; i++) normalized[i] = new Point(points[i].x / (gray.cols() - 1), points[i].y / (gray.rows() - 1));
                return new Detection(normalized, detection.score);
            } finally { refined.release(); }
        }

        private double boundaryContrast(Point[] points) {
            double total = 0;
            int samples = 0, width = gray.cols(), height = gray.rows();
            for (int side = 0; side < 4; side++) {
                Point a = points[side], b = points[(side + 1) % 4];
                double length = Math.hypot(b.x - a.x, b.y - a.y);
                double nx = -(b.y - a.y) * 3 / length, ny = (b.x - a.x) * 3 / length;
                for (int sample = 1; sample <= 10; sample++) {
                    double x = a.x + (b.x - a.x) * sample / 11, y = a.y + (b.y - a.y) * sample / 11;
                    int ax = (int) Math.round(x + nx), ay = (int) Math.round(y + ny);
                    int bx = (int) Math.round(x - nx), by = (int) Math.round(y - ny);
                    if (ax < 0 || ay < 0 || bx < 0 || by < 0 || ax >= width || bx >= width || ay >= height || by >= height) continue;
                    total += Math.abs((tones[ay * width + ax] & 255) - (tones[by * width + bx] & 255)); samples++;
                }
            }
            return samples == 0 ? 0 : total / samples / 255;
        }

        @Override public void close() {
            gray.release(); smooth.release(); edges.release(); edgeBand.release(); binary.release();
            hierarchy.release(); kernel.release(); supportKernel.release(); mean.release(); deviation.release();
        }
    }

    private static final class Candidate {
        final MatOfPoint contour;
        final double area;
        Candidate(MatOfPoint contour, double area) { this.contour = contour; this.area = area; }
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
                if (x >= 0 && y >= 0 && x < width && y < height && pixels[y * width + x] != 0) hits++;
            }
            minimum = Math.min(minimum, hits / 40.0);
        }
        return minimum;
    }

    static final class Tracker {
        static final long LOST_AFTER_MS = 160;
        private Point[] previous, steadyAnchor, pendingJump;
        private long lastSeen, steadySince = -1;
        private boolean fresh;

        void reset() { previous = null; steadyAnchor = null; pendingJump = null; lastSeen = 0; steadySince = -1; fresh = false; }

        Point[] update(Detection detection, long now) {
            if (previous != null && (now < lastSeen || now - lastSeen > LOST_AFTER_MS)) reset();
            fresh = false;
            if (detection == null) { steadySince = -1; steadyAnchor = null; pendingJump = null; return previous; }
            Point[] raw = align(detection.corners, previous);
            double movement = distance(previous, raw);
            // A single far-away contour must not yank the border to another object.
            if (previous != null && movement > .12 && (pendingJump == null || distance(pendingJump, raw) > .025)) {
                pendingJump = raw; steadySince = -1; steadyAnchor = null; return previous;
            }
            pendingJump = null;
            long dt = previous == null ? 33 : Math.max(1, now - lastSeen);
            // A time-window anchor tolerates tiny camera noise at high frame rates,
            // while a page translating steadily cannot become "ready" frame by frame.
            if (detection.score < .7) { steadySince = -1; steadyAnchor = null; }
            else if (steadyAnchor == null || distance(steadyAnchor, raw) > .009) { steadyAnchor = raw; steadySince = now; }
            double tau = movement < .004 ? 85 : Math.max(16, 85 / (1 + movement * 180));
            double alpha = previous == null || movement > .12 ? 1 : 1 - Math.exp(-dt / tau);
            Point[] next = new Point[4];
            for (int i = 0; i < 4; i++) next[i] = previous == null ? new Point(raw[i].x, raw[i].y) :
                new Point(previous[i].x + alpha * (raw[i].x - previous[i].x), previous[i].y + alpha * (raw[i].y - previous[i].y));
            previous = next; lastSeen = now; fresh = true;
            return next;
        }

        boolean stable(long now) { return fresh && previous != null && steadySince >= 0 && now - steadySince >= 220 && now - lastSeen < 100; }

        private static double distance(Point[] a, Point[] b) {
            if (a == null || b == null) return 1;
            double maximum = 0;
            for (int i = 0; i < 4; i++) maximum = Math.max(maximum, Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y));
            return maximum;
        }

        private static Point[] align(Point[] points, Point[] reference) {
            int bestShift = 0; double best = Double.POSITIVE_INFINITY;
            if (reference != null) for (int shift = 0; shift < 4; shift++) {
                double sum = 0;
                for (int i = 0; i < 4; i++) {
                    Point p = points[(i + shift) % 4];
                    sum += Math.pow(reference[i].x - p.x, 2) + Math.pow(reference[i].y - p.y, 2);
                }
                if (sum < best) { best = sum; bestShift = shift; }
            }
            Point[] result = new Point[4];
            for (int i = 0; i < 4; i++) { Point p = points[(i + bestShift) % 4]; result[i] = new Point(p.x, p.y); }
            return result;
        }
    }
}
