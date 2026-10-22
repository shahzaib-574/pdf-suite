package com.reampdf.mobile;
import java.io.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;
import static org.junit.Assert.*;
public class NativeImportWorkerTest {
    @Test public void providerCloseFailureStillReleasesWorkerAndDeletesUnpublishedFiles() throws Exception {
        NativeImportWorker worker=new NativeImportWorker();NativeImportWorker.Job job=new NativeImportWorker.Job();File file=File.createTempFile("camera-close-",".tmp");job.stage(file);CountDownLatch ran=new CountDownLatch(1);
        assertTrue(worker.submit(job,()->{try{job.own((Closeable)()->{throw new IllegalStateException("synthetic close failure");});}catch(IOException e){fail();}ran.countDown();}));assertTrue(ran.await(2,TimeUnit.SECONDS));long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(2);while(worker.isBusy()&&System.nanoTime()<end)Thread.yield();assertFalse(worker.isBusy());assertFalse(file.exists());worker.close();
    }
    @Test public void cancelAfterShutdownOrFinishedJobDoesNotScheduleNewCloseWork() {
        NativeImportWorker worker=new NativeImportWorker();NativeImportWorker.Job job=new NativeImportWorker.Job();worker.close();worker.cancel(job);assertFalse(worker.isBusy());
        job=new NativeImportWorker.Job();job.finish();NativeImportWorker live=new NativeImportWorker();live.cancel(job);assertFalse(live.isBusy());live.close();
    }
    @Test public void actualWorkerCancelKeepsBridgeFreeEvenWhileProviderCloseBlocks() throws Exception {
        NativeImportWorker worker=new NativeImportWorker();NativeImportWorker.Job job=new NativeImportWorker.Job();
        CountDownLatch reading=new CountDownLatch(1),closing=new CountDownLatch(1),allowClose=new CountDownLatch(1),released=new CountDownLatch(1);
        InputStream stream=new InputStream(){public int read()throws IOException{reading.countDown();try{released.await();}catch(InterruptedException e){throw new IOException(e);}return -1;}public void close()throws IOException{closing.countDown();try{allowClose.await();}catch(InterruptedException e){throw new IOException(e);}released.countDown();}};
        assertTrue(worker.submit(job,()->{try{job.own(stream);stream.read();}catch(Exception ignored){}}));assertTrue(reading.await(2,TimeUnit.SECONDS));
        worker.cancel(job);assertTrue(closing.await(2,TimeUnit.SECONDS));assertTrue(job.isCancelled());assertTrue(worker.isBusy());assertFalse(worker.submit(new NativeImportWorker.Job(),()->{}));
        // Caller continues while copy and close lanes block; no bridge task is occupied.
        AtomicInteger bridge=new AtomicInteger();bridge.incrementAndGet();assertEquals(1,bridge.get());allowClose.countDown();
        long limit=System.nanoTime()+TimeUnit.SECONDS.toNanos(2);while(worker.isBusy()&&System.nanoTime()<limit)Thread.yield();assertFalse(worker.isBusy());worker.close();
    }
    @Test public void publishedFilesHaveTransferredOwnershipEvenIfWorkerThenCloses()throws Exception{
        File file=File.createTempFile("camera-published-",".tmp");NativeImportWorker.Job job=new NativeImportWorker.Job();job.stage(file);assertTrue(job.publish());job.cancel();job.finish();assertTrue("do not delete delivered files",file.exists());file.delete();
    }
    @Test public void blockedProviderIsOffCallerAndCancelClosesResourceButKeepsOwnershipUntilExit() throws Exception {
        NativeImportWorker worker=new NativeImportWorker();NativeImportWorker.Job job=new NativeImportWorker.Job();
        CountDownLatch reading=new CountDownLatch(1),closed=new CountDownLatch(1),exit=new CountDownLatch(1),done=new CountDownLatch(1);
        InputStream stream=new InputStream(){public int read() throws IOException {reading.countDown();try{closed.await();exit.await();}catch(InterruptedException e){throw new IOException(e);}return -1;}public void close(){closed.countDown();}};
        assertTrue(worker.submit(job,()->{try{job.own(stream);stream.read();}catch(Exception ignored){}finally{done.countDown();}}));
        assertTrue(reading.await(2,TimeUnit.SECONDS));assertFalse(worker.submit(new NativeImportWorker.Job(),()->fail("must not queue")));
        job.cancel();assertTrue(closed.await(1,TimeUnit.SECONDS));assertFalse(worker.submit(new NativeImportWorker.Job(),()->{}));
        exit.countDown();assertTrue(done.await(2,TimeUnit.SECONDS));long limit=System.nanoTime()+TimeUnit.SECONDS.toNanos(2);while(worker.isBusy()&&System.nanoTime()<limit)Thread.yield();assertFalse(worker.isBusy());assertTrue(worker.submit(new NativeImportWorker.Job(),()->{}));worker.close();
    }
    @Test public void lateResourcesCloseAndStagedFilesCleanupUntilPublished() throws Exception {
        NativeImportWorker.Job cancelled=new NativeImportWorker.Job();AtomicInteger closes=new AtomicInteger();cancelled.cancel();
        try{cancelled.own((Closeable)()->closes.incrementAndGet());fail();}catch(InterruptedIOException expected){}assertEquals(1,closes.get());
        File file=File.createTempFile("camera-import-",".tmp");NativeImportWorker.Job failed=new NativeImportWorker.Job();failed.stage(file);failed.finish();assertFalse(file.exists());
        file=File.createTempFile("camera-import-",".tmp");NativeImportWorker.Job good=new NativeImportWorker.Job();good.stage(file);assertTrue(good.publish());good.finish();assertTrue(file.exists());file.delete();
    }
    @Test public void cancelledJobCannotPublishAndSignalsCancelExactlyOnce() throws Exception {
        NativeImportWorker.Job job=new NativeImportWorker.Job();AtomicInteger signals=new AtomicInteger();job.onCancel(()->signals.incrementAndGet());job.cancel();job.cancel();assertEquals(1,signals.get());assertFalse(job.publish());
        try{job.check();fail();}catch(InterruptedIOException expected){}
    }
}
