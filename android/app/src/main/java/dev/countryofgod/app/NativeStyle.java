package dev.countryofgod.app;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

final class NativeStyle {
    static final int RED = 0xff660000;
    final Context context;
    final Typeface heldane;
    final Typeface love;
    final Typeface title;
    final Typeface sans;
    final Typeface script;
    private final Map<String, Bitmap> images = new HashMap<>();

    NativeStyle(Context context) {
        this.context = context;
        heldane = Typeface.createFromAsset(context.getAssets(), "site/heldane.otf");
        love = Typeface.createFromAsset(context.getAssets(), "site/loveletter.ttf");
        title = Typeface.createFromAsset(context.getAssets(), "site/kebensong.ttf");
        sans = Typeface.createFromAsset(context.getAssets(), "site/founders.otf");
        script = Typeface.createFromAsset(context.getAssets(), "site/shorelines.otf");
    }

    int dp(float size) {
        return Math.round(size * context.getResources().getDisplayMetrics().density);
    }

    TextView text(CharSequence value, float size, int color, Typeface font) {
        TextView view = new TextView(context);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        view.setTypeface(font);
        view.setIncludeFontPadding(false);
        view.setLineSpacing(dp(4), 1.1f);
        return view;
    }

    TextView button(String value, String description, int color, Runnable action) {
        TextView view = text(value, 19, color, heldane);
        view.setContentDescription(description);
        view.setGravity(Gravity.CENTER);
        view.setMinHeight(dp(48));
        view.setMinWidth(dp(48));
        view.setPadding(dp(8), dp(6), dp(8), dp(6));
        view.setBackground(new android.graphics.drawable.RippleDrawable(
                android.content.res.ColorStateList.valueOf(color == Color.WHITE ? 0x33ffffff : 0x22000000),
                null, background(Color.WHITE, 0, 0, 0)));
        view.setFocusable(true);
        view.setOnClickListener(ignored -> action.run());
        return view;
    }

    LinearLayout column() {
        LinearLayout view = new LinearLayout(context);
        view.setOrientation(LinearLayout.VERTICAL);
        return view;
    }

    LinearLayout row() {
        LinearLayout view = new LinearLayout(context);
        view.setGravity(Gravity.CENTER_VERTICAL);
        return view;
    }

    void add(LinearLayout parent, View child, int height, int top) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, height < 0 ? height : dp(height));
        params.topMargin = dp(top);
        parent.addView(child, params);
    }

    void heading(LinearLayout parent, String english, String chinese, int color) {
        add(parent, text(english, 16, color, heldane), -2, 0);
        add(parent, text(chinese, 37, color, title), -2, 10);
    }

    Bitmap bitmap(String name) {
        if (!images.containsKey(name)) {
            try (InputStream input = context.getAssets().open("site/" + name)) {
                BitmapFactory.Options options = new BitmapFactory.Options();
                options.inPreferredConfig = name.endsWith(".png") ? Bitmap.Config.ARGB_8888 : Bitmap.Config.RGB_565;
                images.put(name, BitmapFactory.decodeStream(input, null, options));
            } catch (IOException exception) {
                return null;
            }
        }
        return images.get(name);
    }

    ImageView image(String name, String description, ImageView.ScaleType scale) {
        ImageView image = new ImageView(context);
        image.setImageBitmap(bitmap(name));
        image.setContentDescription(description);
        image.setScaleType(scale);
        image.setAdjustViewBounds(true);
        return image;
    }

    static GradientDrawable background(int color, int stroke, int width, float radius) {
        GradientDrawable background = new GradientDrawable();
        background.setColor(color);
        background.setCornerRadius(radius);
        if (width > 0) background.setStroke(width, stroke);
        return background;
    }
}
