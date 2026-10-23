package dev.countryofgod.app;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;
import android.text.TextUtils;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.ViewParent;
import android.view.accessibility.AccessibilityEvent;
import android.widget.Button;
import android.widget.FrameLayout;

import java.io.IOException;
import java.io.InputStream;

public final class NativeIpodView extends FrameLayout {
    public interface Listener {
        void onCategory(String category);
        void onTransport(String action);
    }

    private static final float DESIGN_WIDTH = 460f;
    private static final float DESIGN_HEIGHT = 1015f;
    private static final float ROW_HEIGHT = 64f;
    private static final String[] CATEGORIES = {"music", "article", "poem"};
    private static final String[] ACTIONS = {"menu", "prev", "next", "play", "center"};
    private static final float[][] WHEEL_CENTERS = {
            {0.5f, 1f / 6f}, {1f / 6f, 0.5f}, {5f / 6f, 0.5f},
            {0.5f, 5f / 6f}, {0.5f, 0.5f}
    };
    private static final float[][] WHEEL_SIZES = {
            {0.5f, 0.3334f}, {0.3333f, 0.3334f}, {0.3333f, 0.3334f},
            {0.5f, 0.3333f}, {0.4608f, 0.4606f}
    };

    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final TextPaint textPaint = new TextPaint(Paint.ANTI_ALIAS_FLAG);
    private final RectF bodyBounds = new RectF(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    private final RectF screenBounds = new RectF(
            DESIGN_WIDTH * 0.0995f, DESIGN_HEIGHT * 0.0589f,
            DESIGN_WIDTH * (0.0995f + 0.8021f), DESIGN_HEIGHT * (0.0589f + 0.448f));
    private final RectF wheelBounds = new RectF(
            DESIGN_WIDTH * 0.1644f, DESIGN_HEIGHT * 0.5785f,
            DESIGN_WIDTH * (0.1644f + 0.6817f), DESIGN_HEIGHT * (0.5785f + 0.3071f));
    private final RectF backgroundBounds = new RectF();
    private final RectF drawingBounds = new RectF();
    private final Path screenClip = new Path();
    private final Button[] menuButtons = new Button[CATEGORIES.length];
    private final Button[] wheelButtons = new Button[ACTIONS.length];
    private final Bitmap bodyBitmap;
    private final Bitmap backgroundBitmap;
    private final Bitmap screenFrameBitmap;
    private final float density;
    private final int touchSlop;

    private Listener listener;
    private int selectedIndex = 1;
    private String currentCategory = "article";
    private boolean musicScreen;
    private String musicName = "";
    private String musicTime = "";
    private float musicProgress;
    private StaticLayout musicNameLayout;
    private float scale;
    private float offsetX;
    private float offsetY;
    private boolean menuTouch;
    private int pointerId = MotionEvent.INVALID_POINTER_ID;
    private float downX;
    private float downY;
    private int dragSteps;

    public NativeIpodView(Context context) {
        super(context);
        density = getResources().getDisplayMetrics().density;
        touchSlop = ViewConfiguration.get(context).getScaledTouchSlop();
        setWillNotDraw(false);
        setClipChildren(true);
        setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        setDescendantFocusability(FOCUS_AFTER_DESCENDANTS);
        bodyBitmap = loadBitmap("site/ipod-clean.webp");
        backgroundBitmap = loadBitmap("site/ipod_background.webp");
        screenFrameBitmap = loadBitmap("site/ipod_screen_frame.webp");
        Typeface typeface;
        try {
            typeface = Typeface.createFromAsset(context.getAssets(), "site/heldane.otf");
        } catch (RuntimeException exception) {
            typeface = Typeface.SERIF;
        }
        textPaint.setTypeface(typeface);
        screenClip.addRoundRect(screenBounds, 12f, 12f, Path.Direction.CW);
        if (backgroundBitmap != null) {
            float cover = Math.max(screenBounds.width() / backgroundBitmap.getWidth(),
                    screenBounds.height() / backgroundBitmap.getHeight());
            float halfWidth = backgroundBitmap.getWidth() * cover / 2f;
            float halfHeight = backgroundBitmap.getHeight() * cover / 2f;
            backgroundBounds.set(screenBounds.centerX() - halfWidth,
                    screenBounds.centerY() - halfHeight, screenBounds.centerX() + halfWidth,
                    screenBounds.centerY() + halfHeight);
        }
        for (int row = 0; row < menuButtons.length; row++) {
            final int menuRow = row;
            menuButtons[row] = createButton("");
            menuButtons[row].setOnClickListener(view -> selectCategory(categoryAtRow(menuRow)));
        }
        for (int index = 0; index < wheelButtons.length; index++) {
            final String action = ACTIONS[index];
            wheelButtons[index] = createButton("menu".equals(action) ? "MENU" : action);
            wheelButtons[index].setOnClickListener(view -> handleAction(action));
        }
        updateMenuButtons();
        rebuildMusicName();
    }

    public void setListener(Listener listener) {
        this.listener = listener;
    }

    public void setMusic(String name, String time, float progress) {
        musicName = name == null ? "" : name;
        musicTime = time == null ? "" : time;
        musicProgress = Float.isNaN(progress) ? 0f : Math.max(0f, Math.min(1f, progress));
        rebuildMusicName();
        invalidate();
    }

    public boolean back() {
        if (!musicScreen) {
            return false;
        }
        musicScreen = false;
        updateMenuButtons();
        invalidate();
        sendAccessibilityEvent(AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED);
        return true;
    }

    public String getCurrentCategory() {
        return currentCategory;
    }

    public void setCategory(String category) {
        for (int index = 0; index < CATEGORIES.length; index++) {
            if (CATEGORIES[index].equals(category)) {
                selectCategory(index);
                return;
            }
        }
    }

    private Bitmap loadBitmap(String assetPath) {
        try (InputStream stream = getContext().getAssets().open(assetPath)) {
            return BitmapFactory.decodeStream(stream);
        } catch (IOException exception) {
            return null;
        }
    }

    private Button createButton(String description) {
        Button button = "center".equals(description) ? new Button(getContext()) {
            @Override
            public boolean dispatchTouchEvent(MotionEvent event) {
                if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
                    float horizontal = (event.getX() - getWidth() / 2f) / (getWidth() / 2f);
                    float vertical = (event.getY() - getHeight() / 2f) / (getHeight() / 2f);
                    if (horizontal * horizontal + vertical * vertical > 1f) {
                        return false;
                    }
                }
                return super.dispatchTouchEvent(event);
            }
        } : new Button(getContext());
        button.setText("");
        button.setContentDescription(description);
        button.setBackgroundColor(Color.TRANSPARENT);
        button.setBackgroundTintList(null);
        button.setStateListAnimator(null);
        button.setMinWidth(0);
        button.setMinHeight(0);
        button.setMinimumWidth(0);
        button.setMinimumHeight(0);
        button.setPadding(0, 0, 0, 0);
        button.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);
        addView(button, new FrameLayout.LayoutParams(0, 0));
        return button;
    }

    @Override
    protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
        int width = Math.min(Math.round(220f * density),
                MeasureSpec.getMode(widthMeasureSpec) == MeasureSpec.UNSPECIFIED
                        ? Integer.MAX_VALUE : MeasureSpec.getSize(widthMeasureSpec));
        int height = Math.round(width * DESIGN_HEIGHT / DESIGN_WIDTH);
        if (MeasureSpec.getMode(heightMeasureSpec) != MeasureSpec.UNSPECIFIED
                && height > MeasureSpec.getSize(heightMeasureSpec)) {
            height = MeasureSpec.getSize(heightMeasureSpec);
            width = Math.min(width, (int) (height * DESIGN_WIDTH / DESIGN_HEIGHT));
        }
        setMeasuredDimension(width, height);
        updateGeometry(width, height);
        int minimumTarget = (int) Math.ceil(44f * density);
        int menuHeight = Math.max(minimumTarget, Math.round(ROW_HEIGHT * scale));
        for (Button button : menuButtons) {
            button.measure(MeasureSpec.makeMeasureSpec(Math.max(minimumTarget,
                            Math.round(screenBounds.width() * scale)), MeasureSpec.EXACTLY),
                    MeasureSpec.makeMeasureSpec(menuHeight, MeasureSpec.EXACTLY));
        }
        for (int index = 0; index < wheelButtons.length; index++) {
            wheelButtons[index].measure(MeasureSpec.makeMeasureSpec(Math.max(minimumTarget,
                            Math.round(wheelBounds.width() * WHEEL_SIZES[index][0] * scale)),
                            MeasureSpec.EXACTLY),
                    MeasureSpec.makeMeasureSpec(Math.max(minimumTarget,
                            Math.round(wheelBounds.height() * WHEEL_SIZES[index][1] * scale)),
                            MeasureSpec.EXACTLY));
        }
    }

    @Override
    protected void onSizeChanged(int width, int height, int oldWidth, int oldHeight) {
        super.onSizeChanged(width, height, oldWidth, oldHeight);
        updateGeometry(width, height);
    }

    private void updateGeometry(int width, int height) {
        scale = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
        offsetX = (width - DESIGN_WIDTH * scale) / 2f;
        offsetY = (height - DESIGN_HEIGHT * scale) / 2f;
    }

    @Override
    protected void onLayout(boolean changed, int left, int top, int right, int bottom) {
        float menuCenter = offsetY + screenBounds.centerY() * scale;
        int rowHeight = menuButtons[0].getMeasuredHeight();
        for (int row = 0; row < menuButtons.length; row++) {
            layoutButton(menuButtons[row], offsetX + screenBounds.centerX() * scale,
                    menuCenter + (row - 1) * rowHeight);
        }
        for (int index = 0; index < wheelButtons.length; index++) {
            layoutButton(wheelButtons[index], offsetX + (wheelBounds.left
                            + WHEEL_CENTERS[index][0] * wheelBounds.width()) * scale,
                    offsetY + (wheelBounds.top
                            + WHEEL_CENTERS[index][1] * wheelBounds.height()) * scale);
        }
    }

    private void layoutButton(Button button, float centerX, float centerY) {
        int left = Math.round(centerX - button.getMeasuredWidth() / 2f);
        int top = Math.round(centerY - button.getMeasuredHeight() / 2f);
        button.layout(left, top, left + button.getMeasuredWidth(), top + button.getMeasuredHeight());
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (scale <= 0f) {
            return;
        }
        int bodySave = canvas.save();
        canvas.translate(offsetX, offsetY);
        canvas.scale(scale, scale);
        paint.setAlpha(255);
        if (bodyBitmap != null) {
            canvas.drawBitmap(bodyBitmap, null, bodyBounds, paint);
        }
        int screenSave = canvas.save();
        canvas.clipPath(screenClip);
        paint.setColor(Color.WHITE);
        canvas.drawRect(screenBounds, paint);
        if (backgroundBitmap != null) {
            canvas.drawBitmap(backgroundBitmap, null, backgroundBounds, paint);
        }
        if (screenFrameBitmap != null) {
            canvas.drawBitmap(screenFrameBitmap, null, screenBounds, paint);
        }
        if (musicScreen) {
            drawMusic(canvas);
        } else {
            drawMenu(canvas);
        }
        canvas.restoreToCount(screenSave);
        canvas.restoreToCount(bodySave);
    }

    private void drawMenu(Canvas canvas) {
        float centerY = screenBounds.centerY();
        float rowHeight = menuButtons[0].getMeasuredHeight() / scale;
        drawingBounds.set(screenBounds.left, centerY - rowHeight / 2f,
                screenBounds.right, centerY + rowHeight / 2f);
        paint.setColor(0x0A000000);
        canvas.drawRect(drawingBounds, paint);
        paint.setColor(0x29000000);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(2f);
        canvas.drawRect(drawingBounds, paint);
        paint.setStyle(Paint.Style.FILL);
        textPaint.setTextAlign(Paint.Align.CENTER);
        textPaint.setTextSize(36f);
        for (int row = 0; row < CATEGORIES.length; row++) {
            float rowCenter = centerY + (row - 1) * rowHeight;
            textPaint.setColor(row == 1 ? Color.BLACK : 0xFF999999);
            canvas.drawText(CATEGORIES[categoryAtRow(row)], screenBounds.centerX(),
                    rowCenter - (textPaint.ascent() + textPaint.descent()) / 2f, textPaint);
            paint.setColor(0x12000000);
            canvas.drawRect(screenBounds.left, rowCenter + rowHeight / 2f - 2f,
                    screenBounds.right, rowCenter + rowHeight / 2f, paint);
        }
    }

    private void rebuildMusicName() {
        textPaint.setTextAlign(Paint.Align.LEFT);
        textPaint.setTextSize(30f);
        musicNameLayout = StaticLayout.Builder.obtain(musicName, 0, musicName.length(),
                        textPaint, Math.max(1, (int) (screenBounds.width() - 48f)))
                .setAlignment(Layout.Alignment.ALIGN_CENTER)
                .setIncludePad(false)
                .setLineSpacing(0f, 1.4f)
                .setMaxLines(6)
                .setEllipsize(TextUtils.TruncateAt.END)
                .build();
    }

    private void drawMusic(Canvas canvas) {
        float groupHeight = musicNameLayout.getHeight() + 14f + 22f + 12f + 6f;
        float nameTop = screenBounds.centerY() - groupHeight / 2f;
        textPaint.setTextAlign(Paint.Align.LEFT);
        textPaint.setTextSize(30f);
        textPaint.setColor(Color.BLACK);
        int nameSave = canvas.save();
        canvas.translate(screenBounds.left + 24f, nameTop);
        musicNameLayout.draw(canvas);
        canvas.restoreToCount(nameSave);
        float timeTop = nameTop + musicNameLayout.getHeight() + 14f;
        textPaint.setTextSize(22f);
        textPaint.setTextAlign(Paint.Align.CENTER);
        textPaint.setColor(0xFF999999);
        canvas.drawText(musicTime, screenBounds.centerX(), timeTop - textPaint.ascent(), textPaint);
        float barTop = timeTop + 22f + 12f;
        drawingBounds.set(screenBounds.left + 24f, barTop, screenBounds.right - 24f, barTop + 6f);
        paint.setColor(0x1F000000);
        canvas.drawRoundRect(drawingBounds, 4f, 4f, paint);
        int progressSave = canvas.save();
        canvas.clipRect(drawingBounds.left, drawingBounds.top,
                drawingBounds.left + drawingBounds.width() * musicProgress, drawingBounds.bottom);
        paint.setColor(Color.BLACK);
        canvas.drawRoundRect(drawingBounds, 4f, 4f, paint);
        canvas.restoreToCount(progressSave);
    }

    private int categoryAtRow(int row) {
        return (selectedIndex + row - 1 + CATEGORIES.length) % CATEGORIES.length;
    }

    private void updateMenuButtons() {
        for (int row = 0; row < menuButtons.length; row++) {
            menuButtons[row].setContentDescription(CATEGORIES[categoryAtRow(row)]);
            menuButtons[row].setSelected(row == 1);
            menuButtons[row].setVisibility(musicScreen ? GONE : VISIBLE);
        }
    }

    private void moveSelection(int direction) {
        selectedIndex = (selectedIndex + direction % CATEGORIES.length
                + CATEGORIES.length) % CATEGORIES.length;
        updateMenuButtons();
        invalidate();
    }

    private void selectCategory(int index) {
        selectedIndex = index;
        currentCategory = CATEGORIES[index];
        musicScreen = "music".equals(currentCategory);
        updateMenuButtons();
        invalidate();
        sendAccessibilityEvent(AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED);
        if (listener != null) {
            listener.onCategory(currentCategory);
        }
    }

    private void handleAction(String action) {
        if ("menu".equals(action)) {
            back();
        } else if ("center".equals(action)) {
            selectCategory(selectedIndex);
        } else if ("play".equals(action) || musicScreen) {
            if (listener != null) {
                listener.onTransport(action);
            }
        } else {
            moveSelection("prev".equals(action) ? -1 : 1);
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (!musicScreen && (event.getKeyCode() == KeyEvent.KEYCODE_DPAD_UP
                || event.getKeyCode() == KeyEvent.KEYCODE_DPAD_DOWN)) {
            if (event.getAction() == KeyEvent.ACTION_DOWN) {
                moveSelection(event.getKeyCode() == KeyEvent.KEYCODE_DPAD_UP ? -1 : 1);
            }
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public boolean onInterceptTouchEvent(MotionEvent event) {
        if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
            downX = event.getX();
            downY = event.getY();
            pointerId = event.getPointerId(0);
            menuTouch = !musicScreen && scale > 0f && screenBounds.contains(
                    (downX - offsetX) / scale, (downY - offsetY) / scale);
            dragSteps = 0;
            if (menuTouch) {
                disallowParentIntercept(true);
            }
        } else if (event.getActionMasked() == MotionEvent.ACTION_MOVE && menuTouch) {
            int pointerIndex = event.findPointerIndex(pointerId);
            if (pointerIndex >= 0) {
                float deltaY = event.getY(pointerIndex) - downY;
                if (Math.abs(deltaY) > touchSlop
                        && Math.abs(deltaY) > Math.abs(event.getX(pointerIndex) - downX)) {
                    return true;
                }
            }
        } else if (event.getActionMasked() == MotionEvent.ACTION_UP
                || event.getActionMasked() == MotionEvent.ACTION_CANCEL) {
            finishTouch();
        }
        return false;
    }

    @Override
    @SuppressLint("ClickableViewAccessibility")
    public boolean onTouchEvent(MotionEvent event) {
        if (!menuTouch) {
            return false;
        }
        if (event.getActionMasked() == MotionEvent.ACTION_MOVE) {
            int pointerIndex = event.findPointerIndex(pointerId);
            if (pointerIndex >= 0) {
                float deltaY = event.getY(pointerIndex) - downY;
                if (Math.abs(deltaY) > touchSlop && Math.abs(deltaY) > Math.abs(
                        event.getX(pointerIndex) - downX)) {
                    int steps = Math.round(-deltaY / Math.max(44f * density, ROW_HEIGHT * scale));
                    if (steps != dragSteps) {
                        moveSelection(steps - dragSteps);
                        dragSteps = steps;
                    }
                }
            }
        } else if (event.getActionMasked() == MotionEvent.ACTION_UP
                || event.getActionMasked() == MotionEvent.ACTION_CANCEL) {
            finishTouch();
        }
        return true;
    }

    private void disallowParentIntercept(boolean disallow) {
        ViewParent parent = getParent();
        if (parent != null) {
            parent.requestDisallowInterceptTouchEvent(disallow);
        }
    }

    private void finishTouch() {
        menuTouch = false;
        pointerId = MotionEvent.INVALID_POINTER_ID;
        disallowParentIntercept(false);
    }
}
