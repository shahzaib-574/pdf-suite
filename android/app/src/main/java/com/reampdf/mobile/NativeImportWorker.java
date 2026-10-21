package com.reampdf.mobile;

import java.io.Closeable;
import java.io.File;
import java.io.IOException;
import java.io.InterruptedIOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** One copy and one close lane; no queued copies or work on Capacitor's bridge handler. */
public final class NativeImportWorker implements AutoCloseable {
    private final ExecutorService copy = Executors.newSingleThreadExecutor();
    private final ExecutorService closer = Executors.newSingleThreadExecutor();
    private Job active;
    private boolean closed;
    private int closing;

    public synchronized boolean isBusy() { return active != null || closing > 0; }

    public synchronized boolean submit(Job job, Runnable work) {
        if (closed || isBusy()) return false;
        active = job;
        copy.execute(() -> {
            try { work.run(); }
            finally {
                try { job.finish(); }
                finally { synchronized (this) { if (active == job) active = null; } }
            }
        });
        return true;
    }

    public synchronized void cancel(Job job) {
        if (closed || !job.markCancelled()) return;
        closing++;
        closer.execute(() -> {
            try { job.closeOwned(); }
            finally { synchronized (this) { closing--; } }
        });
    }

    @Override public synchronized void close() {
        if (closed) return;
        if (active != null) cancel(active);
        closed = true;
        copy.shutdown();
        closer.shutdown();
    }

    public static final class Job {
        private boolean cancelled, published, finished;
        private final Set<Closeable> resources = Collections.newSetFromMap(new IdentityHashMap<>());
        private final List<Runnable> signals = new ArrayList<>();
        private final List<File> files = new ArrayList<>();

        public synchronized void check() throws InterruptedIOException {
            if (cancelled) throw new InterruptedIOException("Import cancelled");
        }
        public synchronized boolean isCancelled() { return cancelled; }

        public void own(Closeable resource) throws IOException {
            synchronized (this) {
                if (!cancelled) { resources.add(resource); return; }
            }
            resource.close();
            throw new InterruptedIOException("Import cancelled");
        }

        public void onCancel(Runnable signal) {
            synchronized (this) {
                if (!cancelled) { signals.add(signal); return; }
            }
            signal.run();
        }

        public synchronized void stage(File file) throws IOException { check(); files.add(file); }
        public synchronized boolean publish() {
            if (cancelled) return false;
            published = true;
            return true;
        }
        private synchronized boolean markCancelled() {
            if (cancelled || finished) return false;
            cancelled = true;
            return true;
        }
        public void cancel() { if (markCancelled()) closeOwned(); }

        private void closeOwned() {
            List<Closeable> owned;
            List<Runnable> callbacks;
            synchronized (this) {
                owned = new ArrayList<>(resources);
                resources.clear();
                callbacks = new ArrayList<>(signals);
                signals.clear();
            }
            for (Runnable signal : callbacks) {
                try { signal.run(); } catch (RuntimeException ignored) { }
            }
            for (Closeable resource : owned) {
                try { resource.close(); } catch (IOException | RuntimeException ignored) { }
            }
        }

        public void finish() {
            closeOwned();
            synchronized (this) {
                // Publication transfers file ownership to the JS consumer; shutdown cannot delete it.
                if (!published) for (File file : files) file.delete();
                files.clear();
                finished = true;
            }
        }
    }
}
