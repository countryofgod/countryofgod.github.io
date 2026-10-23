package dev.countryofgod.app;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.RenderEffect;
import android.graphics.Shader;
import android.os.Build;
import android.renderscript.Allocation;
import android.renderscript.Element;
import android.renderscript.RenderScript;
import android.renderscript.ScriptIntrinsicBlur;
import android.view.View;
import android.widget.ImageView;

final class NativeBlur {
    private NativeBlur() { }

    @SuppressWarnings("deprecation")
    static void show(Context context, View content, ImageView snapshot, float density) {
        if (Build.VERSION.SDK_INT >= 31) {
            content.setRenderEffect(RenderEffect.createBlurEffect(12 * density, 12 * density, Shader.TileMode.CLAMP));
            return;
        }
        if (content.getWidth() == 0 || content.getHeight() == 0) return;
        Bitmap bitmap = Bitmap.createBitmap(Math.max(1, content.getWidth() / 5),
                Math.max(1, content.getHeight() / 5), Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.scale(0.2f, 0.2f);
        content.draw(canvas);
        RenderScript script = RenderScript.create(context);
        Allocation source = Allocation.createFromBitmap(script, bitmap);
        Allocation destination = Allocation.createTyped(script, source.getType());
        ScriptIntrinsicBlur blur = ScriptIntrinsicBlur.create(script, Element.U8_4(script));
        blur.setRadius(Math.min(25f, 2.4f * density));
        blur.setInput(source);
        blur.forEach(destination);
        destination.copyTo(bitmap);
        blur.destroy();
        destination.destroy();
        source.destroy();
        script.destroy();
        snapshot.setImageBitmap(bitmap);
        snapshot.setVisibility(View.VISIBLE);
    }

    static void hide(View content, ImageView snapshot) {
        if (Build.VERSION.SDK_INT >= 31) content.setRenderEffect(null);
        snapshot.setImageDrawable(null);
        snapshot.setVisibility(View.GONE);
    }
}
