package com.reampdf.mobile;

import android.content.Context;
import android.content.ContentValues;
import android.graphics.*;
import android.os.Build;
import android.provider.MediaStore;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileInputStream;
import java.io.OutputStream;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class DocumentOutlineViewTest {
    @Test public void thinCornersAreBracketsNotDiscs() {
        assertEquals(2.4f,DocumentOutlineView.BORDER_DP,.0001f);
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            DocumentOutlineView view=new DocumentOutlineView(context);
            view.layout(0,0,640,480);
            view.set(new float[]{120,80,520,80,520,400,120,400},true);
            Bitmap transparent=Bitmap.createBitmap(640,480,Bitmap.Config.ARGB_8888);
            Bitmap review=Bitmap.createBitmap(640,480,Bitmap.Config.ARGB_8888);
            try {
                view.draw(new Canvas(transparent));
                float density=context.getResources().getDisplayMetrics().density;
                int offset=Math.max(2,Math.round(2*density));
                int outsideCornerAlpha=Color.alpha(transparent.getPixel(120-offset,80-offset));
                assertTrue("Bracket follows the top page edge",Color.alpha(transparent.getPixel(120+Math.round(10*density),80))>240);
                assertTrue("Center border stays lighter than corner brackets",Color.alpha(transparent.getPixel(320,80))<200);
                Canvas canvas=new Canvas(review);canvas.drawColor(0xFF1F2937);
                Paint paper=new Paint();paper.setColor(0xFFF3F4F6);canvas.drawRect(120,80,520,400,paper);
                paper.setColor(0xFF475569);paper.setTextSize(20);canvas.drawText("Native outline render",165,145,paper);
                paper.setStrokeWidth(2);for(int y=185;y<355;y+=24)canvas.drawLine(165,y,470,y,paper);
                canvas.drawBitmap(transparent,0,0,null);
                File directory=new File(context.getExternalFilesDir(null),"edge-checks");assertTrue(directory.isDirectory()||directory.mkdirs());
                try(FileOutputStream output=new FileOutputStream(new File(directory,"outline-native.png"))) {assertTrue(review.compress(Bitmap.CompressFormat.PNG,100,output));}
                catch(Exception error){throw new AssertionError(error);}
                // Gradle can uninstall the test target after the suite. Export this
                // synthetic test image through scoped MediaStore so CI can retain it.
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues values=new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME,"outline-native.png");
                    values.put(MediaStore.Downloads.MIME_TYPE,"image/png");
                    values.put(MediaStore.Downloads.RELATIVE_PATH,"Download/ream-edge-checks");
                    values.put(MediaStore.Downloads.IS_PENDING,1);
                    android.net.Uri uri=context.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,values);assertNotNull(uri);
                    try(FileInputStream input=new FileInputStream(new File(directory,"outline-native.png"));OutputStream output=context.getContentResolver().openOutputStream(uri)) {
                        assertNotNull(output);byte[] data=new byte[8192];int count;while((count=input.read(data))!=-1)output.write(data,0,count);
                    } catch(Exception error){throw new AssertionError(error);}
                    values.clear();values.put(MediaStore.Downloads.IS_PENDING,0);context.getContentResolver().update(uri,values,null,null);
                }
                assertTrue("No solid circular handle around the corner (allow an antialiased fringe)",outsideCornerAlpha<40);
                view.clear();transparent.eraseColor(Color.TRANSPARENT);view.draw(new Canvas(transparent));
                assertEquals(0,Color.alpha(transparent.getPixel(320,80)));
            } finally {view.clear();transparent.recycle();review.recycle();}
        });
    }
}
