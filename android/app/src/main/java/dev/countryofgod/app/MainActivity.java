package dev.countryofgod.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.BitmapDrawable;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Html;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ClickableSpan;
import android.text.style.ForegroundColorSpan;
import android.text.method.LinkMovementMethod;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.inputmethod.InputMethodManager;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.IOException;
import java.io.InputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

public final class MainActivity extends Activity {
    private static final String[] LABELS = {"Introduction", "exposition", "développement", "récapitulation", "cadenza", "coda"};
    final Handler handler = new Handler(Looper.getMainLooper());
    NativeStyle style;
    NativeRepository repository;
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final ExecutorService images = Executors.newFixedThreadPool(2);
    private final FrameLayout[] pages = new FrameLayout[6];
    private final ScrollView[] scrolls = new ScrollView[6];
    private final int[] savedScroll = new int[6];
    private final ArrayDeque<Integer> history = new ArrayDeque<>();
    private final Map<String, DailyEntry> dailyEntries = new HashMap<>();
    private final List<Publication> publications = new ArrayList<>();
    private final List<JSONObject> articles = new ArrayList<>();
    private final android.util.LruCache<String, Bitmap> imageCache = new android.util.LruCache<String, Bitmap>(12 * 1024 * 1024) {
        @Override protected int sizeOf(String key, Bitmap bitmap) { return bitmap.getByteCount(); }
    };
    private FrameLayout root;
    private FrameLayout content;
    private FrameLayout overlay;
    private ImageView blurSnapshot;
    private TextView menuToggle;
    private LinearLayout navigation;
    private boolean menuOpen;
    private boolean destroyed;
    private int current;
    private NativeIpodView ipod;
    private LinearLayout dailyBody;
    private String dailyCategory = "article";
    private LinearLayout publicationBody;
    private int publicationIndex;
    private boolean publicationExpanded;
    private JSONArray archiveGroups;
    private LinearLayout archiveBody;
    private int archiveYear = 2026;
    private int archiveMonth = 10;
    private int archivePage;
    private NativeForm guestForm;
    private NativeForm imageTarget;
    private Dialog drawer;
    private LinearLayout guestWall;
    private int guestPage = 1;
    private int guestGeneration;
    private int readerGeneration;
    private FrameLayout reader;
    private String readerHref;
    private NativeForm echoForm;
    private MediaPlayer player;
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;
    private List<DailyText.Track> tracks = Collections.emptyList();
    private int trackIndex;
    private boolean prepared;
    private boolean playWhenPrepared;
    private String playingSource;
    private Runnable readerProgress;
    private Runnable galleryAnimation;
    private Runnable filmAnimation;
    private boolean activityVisible;
    private final Runnable musicProgress = new Runnable() {
        @Override public void run() {
            updateMusic();
            if (activityVisible) handler.postDelayed(this, 500);
        }
    };

    @Override public void onCreate(Bundle state) {
        setTheme(R.style.AppTheme);
        super.onCreate(state);
        style = new NativeStyle(this);
        repository = new NativeRepository(this);
        audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);
        focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
                .setOnAudioFocusChangeListener(change -> {
                    if (change < 0 && player != null && prepared) {
                        player.pause();
                        playWhenPrepared = false;
                    }
                }, handler).build();
        getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        else getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.WHITE);
        content = new FrameLayout(this);
        root.addView(content, new FrameLayout.LayoutParams(-1, -1));
        overlay = new FrameLayout(this);
        overlay.setVisibility(View.GONE);
        blurSnapshot = new ImageView(this);
        blurSnapshot.setScaleType(ImageView.ScaleType.FIT_XY);
        blurSnapshot.setVisibility(View.GONE);
        overlay.addView(blurSnapshot, new FrameLayout.LayoutParams(-1, -1));
        View shade = new View(this);
        shade.setBackgroundColor(0x55eeeeee);
        shade.setOnClickListener(ignored -> setMenu(false));
        overlay.addView(shade, new FrameLayout.LayoutParams(-1, -1));
        ScrollView menuScroll = new ScrollView(this);
        menuScroll.setClipToPadding(false);
        navigation = style.column();
        navigation.setPadding(style.dp(18), style.dp(12), style.dp(18), style.dp(12));
        navigation.setBackground(NativeStyle.background(0xfaffffff, 0xffcccccc, style.dp(1), style.dp(2)));
        menuScroll.addView(navigation);
        for (int index = 0; index < LABELS.length; index++) {
            final int destination = index;
            TextView item = style.button(LABELS[index], LABELS[index], Color.BLACK, () -> {
                setMenu(false);
                showPage(destination, true);
            });
            item.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
            item.setTextSize(22);
            style.add(navigation, item, 52, 0);
        }
        FrameLayout.LayoutParams menuParams = new FrameLayout.LayoutParams(style.dp(290), -2, Gravity.END | Gravity.BOTTOM);
        menuParams.setMargins(style.dp(16), style.dp(12), style.dp(20), style.dp(86));
        overlay.addView(menuScroll, menuParams);
        root.addView(overlay, new FrameLayout.LayoutParams(-1, -1));
        menuToggle = style.button("☰", "章节导航", Color.BLACK, () -> setMenu(!menuOpen));
        menuToggle.setTextSize(25);
        menuToggle.setElevation(style.dp(5));
        menuToggle.setBackground(NativeStyle.background(0xfaffffff, 0xffcccccc, style.dp(1), style.dp(30)));
        FrameLayout.LayoutParams toggleParams = new FrameLayout.LayoutParams(style.dp(54), style.dp(54), Gravity.END | Gravity.BOTTOM);
        toggleParams.setMargins(0, 0, style.dp(20), style.dp(20));
        root.addView(menuToggle, toggleParams);
        setContentView(root);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            int top;
            int bottom;
            int left;
            int right;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                top = bars.top;
                left = bars.left;
                right = bars.right;
                bottom = Math.max(bars.bottom, insets.getInsets(WindowInsets.Type.ime()).bottom);
            } else {
                top = insets.getSystemWindowInsetTop();
                bottom = insets.getSystemWindowInsetBottom();
                left = insets.getSystemWindowInsetLeft();
                right = insets.getSystemWindowInsetRight();
            }
            root.setPadding(left, top, right, bottom);
            menuScroll.getLayoutParams().height = Math.min(style.dp(336), Math.max(style.dp(60), root.getHeight() - top - bottom - style.dp(108)));
            menuScroll.requestLayout();
            return insets;
        });
        if (state != null) {
            current = Math.max(0, Math.min(5, state.getInt("page")));
            int[] offsets = state.getIntArray("scrolls");
            if (offsets != null && offsets.length == 6) System.arraycopy(offsets, 0, savedScroll, 0, 6);
            dailyCategory = state.getString("category", "article");
            publicationIndex = state.getInt("publication");
            archiveYear = state.getInt("archiveYear", 2026);
            archiveMonth = state.getInt("archiveMonth", 10);
        }
        showPage(current, false);
        if (state != null && state.getString("reader") != null) openReader(state.getString("reader"));
    }

    interface Work<Result> { Result run() throws Exception; }

    <Result> void load(Work<Result> work, Consumer<Result> success, Consumer<Exception> failure) {
        if (destroyed) return;
        network.execute(() -> {
            try {
                Result result = work.run();
                handler.post(() -> { if (!destroyed) success.accept(result); });
            } catch (Exception error) {
                handler.post(() -> { if (!destroyed) failure.accept(error); });
            }
        });
    }

    private <Result> void load(Work<Result> work, Consumer<Result> success) { load(work, success, this::error); }
    private void error(Exception error) {
        Toast.makeText(this, error.getMessage() == null ? "请求失败" : error.getMessage(), Toast.LENGTH_LONG).show();
    }
    String encode(String text) { return Uri.encode(text); }

    private LinearLayout page(int index, int background) {
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(background);
        pages[index] = frame;
        content.addView(frame, new FrameLayout.LayoutParams(-1, -1));
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setClipToPadding(false);
        scrolls[index] = scroll;
        frame.addView(scroll, new FrameLayout.LayoutParams(-1, -1));
        FrameLayout centered = new FrameLayout(this);
        scroll.addView(centered, new ScrollView.LayoutParams(-1, -2));
        LinearLayout body = style.column();
        body.setPadding(style.dp(24), style.dp(30), style.dp(24), style.dp(112));
        centered.addView(body, new FrameLayout.LayoutParams(-1, -2, Gravity.TOP | Gravity.CENTER_HORIZONTAL));
        centered.addOnLayoutChangeListener((view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> {
            int width = Math.min(right - left, style.dp(720));
            if (body.getLayoutParams().width != width) { body.getLayoutParams().width = width; body.requestLayout(); }
        });
        scroll.setOnTouchListener(new View.OnTouchListener() {
            float startX;
            float startY;
            @Override public boolean onTouch(View view, MotionEvent event) {
                if (event.getActionMasked() == MotionEvent.ACTION_DOWN) { startX = event.getX(); startY = event.getY(); }
                else if (event.getActionMasked() == MotionEvent.ACTION_UP) {
                    float distance = event.getX() - startX;
                    if (Math.abs(distance) > style.dp(48) && Math.abs(distance) > Math.abs(event.getY() - startY) * 1.25f) {
                        int next = current + (distance < 0 ? 1 : -1);
                        if (next >= 0 && next < 6) showPage(next, true);
                    }
                }
                return false;
            }
        });
        scroll.post(() -> scroll.scrollTo(0, savedScroll[index]));
        return body;
    }

    private void showPage(int index, boolean remember) {
        closeDrawer();
        closeReader();
        if (remember && current != index) history.push(current);
        current = index;
        if (pages[index] == null) {
            switch (index) {
                case 0 -> introduction();
                case 1 -> daily();
                case 2 -> latest();
                case 3 -> archive();
                case 4 -> museum();
                case 5 -> coda();
                default -> throw new IllegalArgumentException();
            }
        }
        for (int offset = 0; offset < pages.length; offset++) {
            if (pages[offset] != null) pages[offset].setVisibility(offset == index ? View.VISIBLE : View.GONE);
            ((TextView) navigation.getChildAt(offset)).setTextColor(offset == index ? NativeStyle.RED : Color.BLACK);
            navigation.getChildAt(offset).setSelected(offset == index);
        }
        updateBars(index == 5);
        content.setAlpha(0.6f);
        content.animate().alpha(1).setDuration(180).start();
        ((InputMethodManager) getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(root.getWindowToken(), 0);
    }

    private void updateBars(boolean dark) {
        root.setBackgroundColor(dark ? Color.BLACK : Color.WHITE);
        if (Build.VERSION.SDK_INT >= 30) {
            int appearance = android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                    | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            getWindow().getInsetsController().setSystemBarsAppearance(dark ? 0 : appearance, appearance);
        }
        else {
            int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
            if (!dark) flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            getWindow().getDecorView().setSystemUiVisibility(flags);
        }
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
    }

    private void setMenu(boolean open) {
        menuOpen = open;
        if (open) {
            ((InputMethodManager) getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(root.getWindowToken(), 0);
            NativeBlur.show(this, content, blurSnapshot, getResources().getDisplayMetrics().density);
            content.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
            overlay.setVisibility(View.VISIBLE);
            navigation.getChildAt(current).requestFocus();
        } else {
            NativeBlur.hide(content, blurSnapshot);
            overlay.setVisibility(View.GONE);
            content.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
        }
        menuToggle.setText(open ? "×" : "☰");
        menuToggle.setContentDescription(open ? "收起章节导航" : "章节导航");
        menuToggle.setSelected(open);
    }

    private void introduction() {
        LinearLayout body = page(0, Color.WHITE);
        style.add(body, style.image("795.webp", "墙上装框画作，画中写着 La Vie est ailleurs", ImageView.ScaleType.CENTER_CROP), 280, 0);
        TextView title = style.text("Einmal\nist keinmal.", 50, Color.BLACK, style.love);
        SpannableString phrase = new SpannableString(title.getText());
        phrase.setSpan(new ForegroundColorSpan(NativeStyle.RED), 7, 10, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        title.setText(phrase);
        title.setLineSpacing(0, 1.02f);
        title.setMaxLines(2);
        title.setAutoSizeTextTypeUniformWithConfiguration(28, 50, 1, android.util.TypedValue.COMPLEX_UNIT_SP);
        style.add(body, title, -2, 30);
        TextView chinese = style.text("上帝之國", 38, Color.BLACK, style.title);
        SpannableString name = new SpannableString("上帝之國");
        name.setSpan(new ClickableSpan() {
            @Override public void onClick(View view) { external(repository.absolute("/admin")); }
            @Override public void updateDrawState(android.text.TextPaint paint) { paint.setColor(NativeStyle.RED); paint.setUnderlineText(false); }
        }, 2, 3, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        chinese.setText(name);
        chinese.setMovementMethod(LinkMovementMethod.getInstance());
        style.add(body, chinese, -2, 25);
    }

    private static final class DailyEntry {
        final DailyText.Entry entry;
        final LocalDate date;
        final String file;
        DailyEntry(DailyText.Entry entry, LocalDate date, String file) { this.entry = entry; this.date = date; this.file = file; }
    }

    private DailyEntry readDaily(String category, LocalDate date) throws Exception {
        String base = date.getYear() + "_" + date.getMonthValue() + "_" + date.getDayOfMonth();
        try {
            return new DailyEntry(DailyText.parse(repository.text("/daily/" + category + "/" + base + ".txt"), category), date, base);
        } catch (IOException first) {
            String padded = date.format(DateTimeFormatter.ofPattern("yyyy_MM_dd"));
            if (base.equals(padded)) throw first;
            return new DailyEntry(DailyText.parse(repository.text("/daily/" + category + "/" + padded + ".txt"), category), date, padded);
        }
    }

    private DailyEntry nearestDaily(String category) throws Exception {
        JSONArray manifest = repository.array("/daily-manifest.json");
        LocalDate today = LocalDate.now();
        LocalDate selected = null;
        for (int index = 0; index < manifest.length(); index++) {
            JSONObject item = manifest.getJSONObject(index);
            if (!category.equals(item.optString("category"))) continue;
            LocalDate date = LocalDate.parse(item.getString("date"));
            if (!date.isAfter(today) && date.isAfter(today.minusDays(60)) && (selected == null || date.isAfter(selected))) selected = date;
        }
        if (selected != null) return readDaily(category, selected);
        throw new IOException(category.equals("music") ? "没有歌单" : "暂无内容");
    }

    private void daily() {
        LinearLayout body = page(1, Color.WHITE);
        style.heading(body, "Exposition", "呈示部", Color.BLACK);
        ipod = new NativeIpodView(this);
        LinearLayout.LayoutParams ipodParams = new LinearLayout.LayoutParams(style.dp(170), style.dp(375));
        ipodParams.gravity = Gravity.CENTER_HORIZONTAL;
        ipodParams.topMargin = style.dp(24);
        body.addView(ipod, ipodParams);
        ipod.setListener(new NativeIpodView.Listener() {
            @Override public void onCategory(String category) { selectDaily(category); }
            @Override public void onTransport(String command) {
                switch (command) {
                    case "play" -> toggleMusic();
                    case "prev" -> switchTrack(-1);
                    case "next" -> switchTrack(1);
                    default -> { }
                }
            }
        });
        dailyBody = style.column();
        style.add(body, dailyBody, -2, 26);
        ipod.setCategory(dailyCategory);
        if (!"music".equals(dailyCategory)) load(() -> nearestDaily("music"), entry -> {
            dailyEntries.put("music", entry);
            if (tracks.isEmpty()) tracks = entry.entry.tracks;
            updateMusic();
        }, ignored -> { });
    }

    private void selectDaily(String category) {
        dailyCategory = category;
        DailyEntry cached = dailyEntries.get(category);
        if (cached != null) { renderDaily(cached, category); return; }
        dailyBody.removeAllViews();
        load(() -> nearestDaily(category), entry -> {
            dailyEntries.put(category, entry);
            if ("music".equals(category) && tracks.isEmpty()) tracks = entry.entry.tracks;
            if (dailyCategory.equals(category)) renderDaily(entry, category);
        });
    }

    private void renderDaily(DailyEntry daily, String category) {
        dailyBody.removeAllViews();
        DailyText.Entry entry = daily.entry;
        String title = entry.title;
        String body = entry.body;
        if ("music".equals(category) && !entry.tracks.isEmpty()) {
            DailyText.Track track = entry.tracks.get(Math.min(trackIndex, entry.tracks.size() - 1));
            title = track.name;
            body = track.lyrics;
            ImageView cover = new ImageView(this);
            cover.setScaleType(ImageView.ScaleType.CENTER_CROP);
            cover.setContentDescription(track.name);
            style.add(dailyBody, cover, 230, 0);
            remoteImage(cover, "/daily/music/" + daily.file + ".jpg", true);
        }
        style.add(dailyBody, style.text(title, 29, Color.BLACK, style.title), -2, 10);
        if (!entry.author.isEmpty() && !category.equals("music")) style.add(dailyBody, style.text(entry.author, 16, 0xff555555, style.heldane), -2, 14);
        TextView text = prose(body);
        text.setMaxLines(18);
        text.setTextIsSelectable(true);
        style.add(dailyBody, text, -2, 20);
        TextView fold = style.button("↓", "展开或收起", Color.BLACK, () -> {
            boolean expanded = text.getMaxLines() == Integer.MAX_VALUE;
            text.setMaxLines(expanded ? 18 : Integer.MAX_VALUE);
            ((TextView) dailyBody.getChildAt(dailyBody.getChildCount() - 1)).setText(expanded ? "↓" : "↑");
            if (expanded) scrolls[1].smoothScrollTo(0, dailyBody.getTop());
        });
        fold.setVisibility(View.GONE);
        style.add(dailyBody, fold, 48, 8);
        text.post(() -> { if (text.getLayout() != null && text.getLayout().getLineCount() > 18) fold.setVisibility(View.VISIBLE); });
    }

    private TextView prose(CharSequence value) {
        TextView text = style.text(value, 18, Color.BLACK, Typeface.SERIF);
        text.setLineSpacing(style.dp(8), 1.22f);
        if (Build.VERSION.SDK_INT >= 29) text.setBreakStrategy(android.graphics.text.LineBreaker.BREAK_STRATEGY_HIGH_QUALITY);
        return text;
    }

    private void toggleMusic() {
        if (tracks.isEmpty()) {
            load(() -> nearestDaily("music"), entry -> {
                dailyEntries.put("music", entry);
                tracks = entry.entry.tracks;
                if (!tracks.isEmpty()) startTrack(tracks.get(trackIndex).src, true);
            });
            return;
        }
        String source = tracks.get(trackIndex).src;
        if (player == null || !source.equals(playingSource)) startTrack(source, true);
        else if (!prepared) playWhenPrepared = !playWhenPrepared;
        else if (player.isPlaying()) { player.pause(); playWhenPrepared = false; }
        else play();
        updateMusic();
    }

    private void startTrack(String source, boolean autoplay) {
        releasePlayer();
        playWhenPrepared = autoplay;
        playingSource = source;
        player = new MediaPlayer();
        player.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
        player.setOnPreparedListener(media -> {
            prepared = true;
            if (playWhenPrepared && activityVisible) play();
            updateMusic();
        });
        player.setOnCompletionListener(media -> {
            if (trackIndex + 1 < tracks.size() && source.equals(tracks.get(trackIndex).src)) {
                trackIndex++;
                startTrack(tracks.get(trackIndex).src, true);
                renderMusicIfVisible();
            } else playWhenPrepared = false;
        });
        player.setOnErrorListener((media, what, extra) -> {
            releasePlayer();
            if (ipod != null) ipod.setMusic("无法播放", "--:-- / --:--", 0);
            return true;
        });
        try {
            player.setDataSource(this, Uri.parse(repository.absolute(source)));
            player.prepareAsync();
        } catch (IOException | IllegalArgumentException | SecurityException exception) {
            releasePlayer();
            if (ipod != null) ipod.setMusic("无法播放", "--:-- / --:--", 0);
        }
    }

    private void play() {
        if (audioManager.requestAudioFocus(focusRequest) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED && player != null && prepared) {
            player.start();
            playWhenPrepared = true;
        }
    }

    private void switchTrack(int step) {
        int next = trackIndex + step;
        if (next < 0 || next >= tracks.size()) return;
        boolean playing = player != null && (prepared ? player.isPlaying() : playWhenPrepared);
        trackIndex = next;
        startTrack(tracks.get(trackIndex).src, playing);
        renderMusicIfVisible();
    }

    private void renderMusicIfVisible() {
        if (dailyBody != null && dailyCategory.equals("music") && dailyEntries.containsKey("music")) renderDaily(dailyEntries.get("music"), "music");
    }

    private String time(int milliseconds) { return String.format(Locale.ROOT, "%d:%02d", milliseconds / 60000, milliseconds / 1000 % 60); }

    private void updateMusic() {
        if (ipod == null) return;
        int position = player != null && prepared ? player.getCurrentPosition() : 0;
        int duration = player != null && prepared ? player.getDuration() : 0;
        ipod.setMusic(tracks.isEmpty() ? "没有歌单" : tracks.get(Math.min(trackIndex, tracks.size() - 1)).name,
                time(position) + " / " + (duration > 0 ? time(duration) : "--:--"), duration > 0 ? (float) position / duration : 0);
    }

    private void releasePlayer() {
        prepared = false;
        if (player != null) { player.release(); player = null; }
        audioManager.abandonAudioFocusRequest(focusRequest);
    }

    private static final class Publication {
        final String title;
        final String author;
        final String meta;
        final CharSequence body;
        final String excerpt;
        Publication(String title, String author, String meta, CharSequence body, String excerpt) {
            this.title = title;
            this.author = author;
            this.meta = meta;
            this.body = body;
            this.excerpt = excerpt;
        }
    }

    private void latest() {
        LinearLayout body = page(2, Color.WHITE);
        style.heading(body, "Développement", "展開部", Color.BLACK);
        LinearLayout actions = style.row();
        TextView directory = style.button("›", "展开本期目录", Color.BLACK, this::publicationDirectory);
        directory.setBackground(NativeStyle.background(Color.WHITE, 0xffcccccc, style.dp(1), style.dp(24)));
        actions.addView(directory, new LinearLayout.LayoutParams(style.dp(48), style.dp(48)));
        View space = new View(this);
        actions.addView(space, new LinearLayout.LayoutParams(0, 1, 1));
        TextView next = style.button("→", "下一篇", Color.BLACK, () -> {
            if (publications.isEmpty()) return;
            publicationIndex = (publicationIndex + 1) % publications.size();
            publicationExpanded = false;
            renderPublication();
            scrolls[2].smoothScrollTo(0, 0);
        });
        next.setBackground(NativeStyle.background(Color.WHITE, 0xffcccccc, style.dp(1), style.dp(24)));
        actions.addView(next, new LinearLayout.LayoutParams(style.dp(48), style.dp(48)));
        style.add(body, actions, 48, 26);
        publicationBody = style.column();
        publicationBody.setPadding(style.dp(20), style.dp(22), style.dp(20), style.dp(16));
        publicationBody.setBackground(NativeStyle.background(Color.WHITE, 0xffcccccc, style.dp(1), 0));
        publicationBody.setOnClickListener(ignored -> { publicationExpanded = !publicationExpanded; renderPublication(); });
        style.add(body, publicationBody, -2, 18);
        TextView progress = style.text("", 12, 0xff999999, style.heldane);
        progress.setGravity(Gravity.END);
        progress.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        style.add(body, progress, 20, 12);
        scrolls[2].setOnScrollChangeListener((view, x, y, oldX, oldY) -> {
            int range = Math.max(1, body.getHeight() - scrolls[2].getHeight());
            int step = Math.min(9, Math.max(1, Math.round(9f * y / range)));
            StringBuilder marks = new StringBuilder();
            for (int index = 0; index < 9; index++) marks.append(index < step ? '━' : '─');
            progress.setText(marks);
        });
        load(() -> {
            List<Publication> result = new ArrayList<>();
            JSONArray data = repository.array("/api/articles");
            for (int index = 0; index < data.length(); index++) {
                JSONObject item = data.getJSONObject(index);
                CharSequence full = Html.fromHtml(item.optString("content"), Html.FROM_HTML_MODE_COMPACT);
                result.add(new Publication(item.optString("title"), item.optString("author"), item.optString("meta"),
                        item.optString("excerpt") + "\n\n" + full, item.optString("excerpt")));
            }
            JSONArray entries = repository.array("/daily/pub/manifest.json");
            for (int index = 0; index < entries.length(); index++) {
                JSONObject item = entries.getJSONObject(index);
                String file = item.getString("file");
                if (!file.matches("[0-9_]+\\.txt")) continue;
                DailyText.Entry entry = DailyText.parse(repository.text("/daily/pub/" + file), "pub");
                String excerpt = entry.body.split("\\r?\\n\\s*\\r?\\n", 2)[0];
                result.add(new Publication(entry.title, entry.author, item.optString("date").replace('-', '.'), entry.body, excerpt));
            }
            return result;
        }, result -> {
            publications.clear();
            publications.addAll(result);
            renderPublication();
        });
    }

    private void renderPublication() {
        publicationBody.removeAllViews();
        if (publications.isEmpty()) return;
        publicationIndex = Math.floorMod(publicationIndex, publications.size());
        Publication item = publications.get(publicationIndex);
        ImageView logo = style.image("logo.webp", "上帝之国", ImageView.ScaleType.FIT_CENTER);
        LinearLayout.LayoutParams logoParams = new LinearLayout.LayoutParams(style.dp(60), style.dp(60));
        logoParams.gravity = Gravity.END;
        publicationBody.addView(logo, logoParams);
        style.add(publicationBody, style.text(item.title, 27, Color.BLACK, style.title), -2, 14);
        style.add(publicationBody, style.text("— " + item.author, 16, 0xff555555, style.heldane), -2, 15);
        style.add(publicationBody, style.text(item.meta, 13, 0xff999999, style.heldane), -2, 10);
        style.add(publicationBody, prose(publicationExpanded ? item.body : item.excerpt), -2, 24);
        TextView arrow = style.text(publicationExpanded ? "↑" : "↓", 23, Color.BLACK, style.heldane);
        arrow.setGravity(Gravity.CENTER);
        style.add(publicationBody, arrow, 44, 12);
        publicationBody.setContentDescription(item.title + (publicationExpanded ? "，收起" : "，展开"));
        publicationBody.setFocusable(true);
        publicationBody.setAlpha(0.5f);
        publicationBody.animate().alpha(1).setDuration(160).start();
    }

    private void publicationDirectory() {
        LinearLayout list = style.column();
        list.setPadding(style.dp(20), style.dp(16), style.dp(20), style.dp(24));
        style.add(list, style.text("目录", 28, Color.BLACK, style.title), -2, 0);
        for (int index = 0; index < publications.size(); index++) {
            final int selected = index;
            TextView item = style.button(publications.get(index).title, publications.get(index).title,
                    publicationIndex == index ? NativeStyle.RED : Color.BLACK, () -> {
                        publicationIndex = selected;
                        publicationExpanded = false;
                        renderPublication();
                        scrolls[2].smoothScrollTo(0, 0);
                        closeDrawer();
                    });
            item.setTypeface(style.title);
            item.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
            style.add(list, item, -2, 12);
        }
        showDrawer(list, false);
    }

    private void archive() {
        LinearLayout body = page(3, Color.WHITE);
        BitmapDrawable backdrop = new BitmapDrawable(getResources(), style.bitmap("archive.webp"));
        backdrop.setGravity(Gravity.FILL);
        pages[3].setBackground(backdrop);
        style.heading(body, "Récapitulation", "再現部", Color.BLACK);
        TextView random = style.button("random →", "random", Color.BLACK, this::randomArticle);
        random.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        style.add(body, random, 48, 12);
        archiveBody = style.column();
        style.add(body, archiveBody, -2, 28);
        load(() -> repository.array("/api/archive"), groups -> { archiveGroups = groups; renderArchive(); });
    }

    private void renderArchive() {
        archiveBody.removeAllViews();
        if (archiveGroups == null) return;
        for (int index = 0; index < archiveGroups.length(); index++) {
            JSONObject group = archiveGroups.optJSONObject(index);
            if (group == null) continue;
            int year = group.optInt("year");
            TextView yearControl = style.button(year + (archiveYear == year ? " −" : " +"), String.valueOf(year), Color.BLACK, () -> {
                archiveYear = archiveYear == year ? 0 : year;
                archiveMonth = 0;
                archivePage = 0;
                renderArchive();
            });
            yearControl.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
            yearControl.setTextSize(32);
            style.add(archiveBody, yearControl, 60, 12);
            if (archiveYear != year) continue;
            JSONArray months = group.optJSONArray("months");
            if (months == null) continue;
            JSONArray selectedPosts = null;
            for (int row = 0; row < 3; row++) {
                LinearLayout strip = style.row();
                for (int column = 0; column < 4; column++) {
                    int monthNumber = row * 4 + column + 1;
                    JSONObject month = months.optJSONObject(monthNumber - 1);
                    JSONArray posts = month == null ? null : month.optJSONArray("posts");
                    if (monthNumber == archiveMonth) selectedPosts = posts;
                    boolean available = month != null && month.optBoolean("hasPosts");
                    TextView number = style.button(String.format(Locale.ROOT, "%02d", monthNumber), String.valueOf(monthNumber),
                            monthNumber == archiveMonth ? NativeStyle.RED : available ? Color.BLACK : 0xff888888, () -> {
                                archiveMonth = archiveMonth == monthNumber ? 0 : monthNumber;
                                archivePage = 0;
                                renderArchive();
                            });
                    number.setEnabled(available);
                    number.setTextSize(24);
                    strip.addView(number, new LinearLayout.LayoutParams(0, style.dp(56), 1));
                }
                style.add(archiveBody, strip, 56, 0);
            }
            if (archiveMonth > 0 && selectedPosts != null && selectedPosts.length() > 0) {
                JSONArray posts = selectedPosts;
                int count = (posts.length() + 7) / 8;
                archivePage = Math.min(archivePage, count - 1);
                LinearLayout panel = style.column();
                panel.setPadding(style.dp(10), style.dp(12), style.dp(10), style.dp(12));
                panel.setBackground(NativeStyle.background(0xd9ffffff, 0xffbbbbbb, style.dp(1), 0));
                for (int offset = archivePage * 8; offset < Math.min(posts.length(), archivePage * 8 + 8); offset++) {
                    JSONObject post = posts.optJSONObject(offset);
                    if (post == null) continue;
                    TextView item = style.button(post.optString("date") + "   " + post.optString("title"), post.optString("title"), Color.BLACK,
                            () -> openReader(post.optString("href")));
                    item.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
                    item.setTypeface(style.title);
                    item.setTextSize(18);
                    style.add(panel, item, -2, 6);
                }
                if (count > 1) {
                    LinearLayout pagination = style.row();
                    TextView previous = style.button("‹", "上一页", Color.BLACK, () -> { archivePage--; renderArchive(); });
                    previous.setEnabled(archivePage > 0);
                    pagination.addView(previous, new LinearLayout.LayoutParams(0, style.dp(48), 1));
                    TextView number = style.text((archivePage + 1) + " / " + count, 16, Color.BLACK, style.heldane);
                    number.setGravity(Gravity.CENTER);
                    pagination.addView(number, new LinearLayout.LayoutParams(0, style.dp(48), 2));
                    TextView next = style.button("›", "下一页", Color.BLACK, () -> { archivePage++; renderArchive(); });
                    next.setEnabled(archivePage + 1 < count);
                    pagination.addView(next, new LinearLayout.LayoutParams(0, style.dp(48), 1));
                    style.add(panel, pagination, 48, 12);
                }
                style.add(archiveBody, panel, -2, 14);
            }
        }
    }

    private void randomArticle() {
        load(() -> repository.array("/api/articles"), data -> {
            articles.clear();
            for (int index = 0; index < data.length(); index++) {
                JSONObject item = data.optJSONObject(index);
                if (item != null) articles.add(item);
            }
            if (!articles.isEmpty()) openReader("/p/" + Uri.encode(articles.get(new Random().nextInt(articles.size())).optString("slug")) + "?r=1");
        });
    }

    private void museum() {
        LinearLayout body = page(4, Color.WHITE);
        ImageView background = style.image("museum.jpeg", "", ImageView.ScaleType.CENTER_CROP);
        pages[4].addView(background, 0, new FrameLayout.LayoutParams(-1, -1));
        style.heading(body, "Cadenza", "華彩段", Color.BLACK);
        HorizontalScrollView film = new HorizontalScrollView(this);
        film.setHorizontalScrollBarEnabled(false);
        film.setClipToPadding(false);
        LinearLayout strip = style.row();
        strip.setGravity(Gravity.BOTTOM);
        int width = Math.min(style.dp(300), getResources().getDisplayMetrics().widthPixels - style.dp(72));
        int stride = width + style.dp(16);
        for (int repeat = 0; repeat < 3; repeat++) {
            for (int index = 1; index <= 4; index++) {
                LinearLayout work = style.column();
                ImageView poster = style.image("museum-" + index + ".jpg", "作品 0" + index, ImageView.ScaleType.FIT_CENTER);
                style.add(work, poster, index % 2 == 0 ? 280 : 330, 0);
                style.add(work, style.text("作品 0" + index, 18, Color.BLACK, style.sans), -2, 12);
                style.add(work, style.text("作品　待填", 13, 0xff555555, style.sans), -2, 6);
                LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(width, -2);
                cardParams.setMarginEnd(style.dp(16));
                strip.addView(work, cardParams);
            }
        }
        film.addView(strip);
        FrameLayout stage = new FrameLayout(this);
        ImageView lower = style.image("museum.jpeg", "", ImageView.ScaleType.CENTER_CROP);
        stage.addView(lower, new FrameLayout.LayoutParams(-1, -1));
        stage.addView(film, new FrameLayout.LayoutParams(-1, -2, Gravity.CENTER_VERTICAL));
        ImageView upper = style.image("museum_upper.png", "", ImageView.ScaleType.CENTER_CROP);
        upper.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        stage.addView(upper, new FrameLayout.LayoutParams(-1, -1));
        style.add(body, stage, 390, 30);
        film.post(() -> film.scrollTo(4 * stride, 0));
        TextView batch = style.text("SYLVAPPLE\n藝術會", 25, Color.BLACK, style.heldane);
        TextView detail = style.text("暂无", 16, Color.BLACK, style.sans);
        LinearLayout arrows = style.row();
        TextView previous = style.button("‹", "上一组", Color.BLACK, () -> film.smoothScrollBy(-stride, 0));
        TextView next = style.button("›", "下一组", Color.BLACK, () -> film.smoothScrollBy(stride, 0));
        arrows.addView(previous, new LinearLayout.LayoutParams(style.dp(54), style.dp(48)));
        arrows.addView(next, new LinearLayout.LayoutParams(style.dp(54), style.dp(48)));
        style.add(body, arrows, 48, 16);
        style.add(body, batch, -2, 26);
        style.add(body, detail, -2, 18);
        film.setOnScrollChangeListener((view, x, y, oldX, oldY) -> {
            if (x < stride * 2) film.scrollTo(x + stride * 4, 0);
            else if (x > stride * 8) film.scrollTo(x - stride * 4, 0);
        });
        boolean[] touching = {false};
        film.setOnTouchListener((view, event) -> {
            if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
                touching[0] = true;
                batch.setText("作品 0" + (Math.floorMod(Math.round((float) film.getScrollX() / stride), 4) + 1));
            } else if (event.getActionMasked() == MotionEvent.ACTION_UP || event.getActionMasked() == MotionEvent.ACTION_CANCEL) {
                touching[0] = false;
                batch.setText("SYLVAPPLE\n藝術會");
            }
            return false;
        });
        galleryAnimation = new Runnable() {
            @Override public void run() {
                if (android.animation.ValueAnimator.areAnimatorsEnabled() && activityVisible && current == 4 && reader == null && !menuOpen && drawer == null && !touching[0]) film.scrollBy(1, 0);
                if (!destroyed && activityVisible) handler.postDelayed(this, 70);
            }
        };
        handler.post(galleryAnimation);
        TextView credit = style.text("Introductory Chapter of", 16, Color.BLACK, style.heldane);
        style.add(body, credit, -2, 38);
        TextView signature = style.button("SylvApple.", "SylvApple", Color.BLACK, () -> scrolls[4].smoothScrollTo(0, 0));
        signature.setTypeface(style.script);
        signature.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        style.add(body, signature, -2, 12);
    }

    private void coda() {
        LinearLayout body = page(5, Color.BLACK);
        ImageView title = style.image("coda-bw.png", "coda", ImageView.ScaleType.FIT_CENTER);
        style.add(body, title, 46, 20);
        guestForm = new NativeForm(this, null, true, () -> {
            if (guestWall != null) { guestPage = 1; loadGuests(); }
        });
        style.add(body, guestForm.view, -2, 32);
        TextView guests = style.button("›", "留言", Color.WHITE, this::guestDrawer);
        guests.setBackground(NativeStyle.background(Color.BLACK, 0xff666666, style.dp(1), style.dp(24)));
        LinearLayout.LayoutParams guestParams = new LinearLayout.LayoutParams(style.dp(48), style.dp(48));
        guestParams.gravity = Gravity.END;
        guestParams.topMargin = style.dp(16);
        body.addView(guests, guestParams);
        HorizontalScrollView film = new HorizontalScrollView(this);
        film.setHorizontalScrollBarEnabled(false);
        film.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        film.setOnTouchListener((view, event) -> true);
        LinearLayout strip = style.row();
        for (int repeat = 0; repeat < 3; repeat++) {
            for (String name : new String[] {"lamp.webp", "still-1.webp", "still-2.webp"}) {
                ImageView image = style.image(name, "", ImageView.ScaleType.CENTER_CROP);
                strip.addView(image, new LinearLayout.LayoutParams(style.dp(190), style.dp(220)));
            }
        }
        film.addView(strip);
        style.add(body, film, 220, 34);
        filmAnimation = new Runnable() {
            @Override public void run() {
                if (android.animation.ValueAnimator.areAnimatorsEnabled() && activityVisible && current == 5 && !menuOpen && drawer == null && reader == null) {
                    film.scrollBy(1, 0);
                    if (film.getScrollX() >= style.dp(570)) film.scrollTo(film.getScrollX() - style.dp(570), 0);
                }
                if (!destroyed && activityVisible) handler.postDelayed(this, 60);
            }
        };
        handler.post(filmAnimation);
        TextView submit = style.button("投稿", "投稿", Color.WHITE, () -> external("mailto:afterrainnn@outlook.com"));
        submit.setTypeface(style.title);
        submit.setTextSize(25);
        style.add(body, submit, 52, 28);
        TextView signature = style.text("Einmal ist keinmal.", 26, Color.WHITE, style.love);
        signature.setGravity(Gravity.CENTER);
        style.add(body, signature, -2, 32);
        style.add(body, style.image("bottom-inv.webp", "© 2026 上帝之国", ImageView.ScaleType.FIT_CENTER), 35, 16);
        TextView socials = style.button("‹", "社交链接", Color.WHITE, this::socialDrawer);
        FrameLayout.LayoutParams socialParams = new FrameLayout.LayoutParams(style.dp(48), style.dp(48), Gravity.START | Gravity.BOTTOM);
        socialParams.bottomMargin = style.dp(22);
        pages[5].addView(socials, socialParams);
        load(() -> repository.object("/api/guestbook/mine"), mine -> {
            if (!mine.isNull("nickname")) guestForm.rememberName(mine.optString("nickname", ""));
        }, ignored -> { });
    }

    private void showDrawer(LinearLayout body, boolean dark) {
        closeDrawer();
        Dialog dialog = new Dialog(this);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(dark ? Color.BLACK : Color.WHITE);
        scroll.addView(body);
        dialog.setContentView(scroll);
        dialog.setOnDismissListener(ignored -> {
            if (drawer == dialog) { drawer = null; guestWall = null; guestGeneration++; }
        });
        drawer = dialog;
        dialog.show();
        Window window = dialog.getWindow();
        if (window != null) {
            window.setBackgroundDrawableResource(android.R.color.transparent);
            window.setLayout(Math.min(root.getWidth() - style.dp(32), style.dp(640)), Math.max(style.dp(120), root.getHeight() * 4 / 5));
            window.setGravity(Gravity.CENTER);
            window.setDimAmount(0.45f);
        }
    }

    private void closeDrawer() {
        if (drawer != null) {
            Dialog previous = drawer;
            drawer = null;
            previous.dismiss();
        }
        guestWall = null;
        guestGeneration++;
    }

    private void guestDrawer() {
        LinearLayout wall = style.column();
        wall.setPadding(style.dp(22), style.dp(22), style.dp(22), style.dp(24));
        showDrawer(wall, true);
        guestWall = wall;
        loadGuests();
    }

    private void loadGuests() {
        if (guestWall == null) return;
        int generation = ++guestGeneration;
        LinearLayout wall = guestWall;
        load(() -> {
            JSONObject result = repository.object("/api/guestbook?limit=5&page=" + guestPage);
            result.put("mine", repository.object("/api/guestbook/mine").optJSONArray("ids"));
            return result;
        }, result -> {
            if (generation != guestGeneration || guestWall != wall) return;
            guestPage = result.optInt("page", 1);
            wall.removeAllViews();
            JSONArray notes = result.optJSONArray("items");
            JSONArray mine = result.optJSONArray("mine");
            if (notes == null) return;
            if (notes.length() == 0) style.add(wall, style.text("还没有留言", 17, Color.WHITE, style.title), -2, 0);
            for (int index = 0; index < notes.length(); index++) {
                JSONObject note = notes.optJSONObject(index);
                if (note == null) continue;
                style.add(wall, style.text(note.optString("name") + "    " + note.optString("date"), 15, 0xffaaaaaa, style.heldane), -2, 18);
                if (!note.optString("body").isEmpty()) style.add(wall, style.text(note.optString("body"), 18, Color.WHITE, Typeface.SERIF), -2, 12);
                String image = note.optString("imageUrl", "");
                if (!image.isEmpty() && !image.equals("null")) {
                    ImageView photo = new ImageView(this);
                    photo.setScaleType(ImageView.ScaleType.FIT_CENTER);
                    photo.setContentDescription("留言图片");
                    style.add(wall, photo, 200, 12);
                    remoteImage(photo, image, true);
                }
                if (contains(mine, note.optString("id"))) {
                    TextView withdraw = style.button("撤回", "撤回", Color.WHITE, () -> confirm("撤回这条留言？", () -> {
                        load(() -> repository.request("DELETE", "/api/guestbook/" + note.optString("id"), null), ignored -> loadGuests());
                    }));
                    withdraw.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
                    style.add(wall, withdraw, 48, 4);
                }
                View rule = new View(this);
                rule.setBackgroundColor(0xff333333);
                style.add(wall, rule, 1, 20);
            }
            int count = result.optInt("pages", 1);
            if (count > 1) {
                HorizontalScrollView pagination = new HorizontalScrollView(this);
                LinearLayout numbers = style.row();
                for (int index = 1; index <= count; index++) {
                    final int selected = index;
                    TextView number = style.button(String.valueOf(index), "第" + index + "页", index == guestPage ? Color.WHITE : 0xff999999,
                            () -> { guestPage = selected; loadGuests(); });
                    numbers.addView(number, new LinearLayout.LayoutParams(style.dp(48), style.dp(48)));
                }
                pagination.addView(numbers);
                style.add(wall, pagination, 48, 16);
            }
        });
    }

    private boolean contains(JSONArray values, String target) {
        if (values == null) return false;
        for (int index = 0; index < values.length(); index++) if (target.equals(values.optString(index))) return true;
        return false;
    }

    private void confirm(String message, Runnable action) {
        new AlertDialog.Builder(this).setMessage(message)
                .setNegativeButton(android.R.string.cancel, null)
                .setPositiveButton(android.R.string.ok, (dialog, which) -> action.run()).show();
    }

    private void socialDrawer() {
        LinearLayout social = style.row();
        social.setGravity(Gravity.CENTER);
        social.setPadding(style.dp(16), style.dp(20), style.dp(16), style.dp(20));
        String[] labels = {"QQ", "小红书", "微信", "GitHub"};
        int[] icons = {R.drawable.social_0, R.drawable.social_1, R.drawable.social_2, R.drawable.social_3};
        for (int index = 0; index < labels.length; index++) {
            ImageView icon = new ImageView(this);
            icon.setImageResource(icons[index]);
            icon.setPadding(style.dp(12), style.dp(12), style.dp(12), style.dp(12));
            icon.setContentDescription(labels[index]);
            icon.setFocusable(true);
            icon.setOnClickListener(ignored -> { closeDrawer(); scrolls[5].smoothScrollTo(0, 0); });
            social.addView(icon, new LinearLayout.LayoutParams(style.dp(56), style.dp(56)));
        }
        LinearLayout body = style.column();
        body.addView(social);
        showDrawer(body, true);
        if (drawer != null && drawer.getWindow() != null) drawer.getWindow().setLayout(Math.min(root.getWidth() - style.dp(32), style.dp(320)), style.dp(104));
    }

    private void openReader(String href) {
        Uri address = Uri.parse(href);
        String path = address.getPath();
        if (path == null || !(path.startsWith("/d/") || path.startsWith("/p/"))) return;
        closeDrawer();
        closeReader();
        int generation = ++readerGeneration;
        readerHref = href;
        reader = new FrameLayout(this);
        reader.setBackgroundColor(Color.WHITE);
        content.addView(reader, new FrameLayout.LayoutParams(-1, -1));
        pages[current].setVisibility(View.GONE);
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        reader.addView(scroll, new FrameLayout.LayoutParams(-1, -1));
        LinearLayout body = style.column();
        body.setPadding(style.dp(24), style.dp(28), style.dp(24), style.dp(112));
        scroll.addView(body, new ScrollView.LayoutParams(-1, -2));
        LinearLayout links = style.row();
        TextView home = style.button("上帝之国 · 再现部", "上帝之国 · 再现部", Color.BLACK, () -> showPage(3, true));
        home.setTextSize(16);
        home.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        links.addView(home, new LinearLayout.LayoutParams(0, style.dp(48), 1));
        TextView next = style.button("next →", "next", Color.BLACK, this::randomArticle);
        links.addView(next, new LinearLayout.LayoutParams(style.dp(90), style.dp(48)));
        style.add(body, links, 48, 0);
        LinearLayout articleBody = style.column();
        style.add(body, articleBody, -2, 24);
        style.add(articleBody, style.text("读取中…", 17, 0xff777777, style.heldane), -2, 12);
        updateBars(false);
        List<String> segments = address.getPathSegments();
        if (path.startsWith("/d/") && segments.size() == 3) {
            String category = segments.get(2);
            if (!Arrays.asList("article", "poem", "music", "pub").contains(category)) return;
            load(() -> readDaily(category, LocalDate.parse(segments.get(1))), daily -> {
                if (readerGeneration != generation) return;
                articleBody.removeAllViews();
                DailyText.Entry entry = daily.entry;
                style.add(articleBody, style.text(entry.title, 31, Color.BLACK, style.title), -2, 0);
                if (!entry.author.isEmpty()) style.add(articleBody, style.text(entry.author, 17, 0xff666666, style.heldane), -2, 18);
                if (category.equals("music")) {
                    for (DailyText.Track track : entry.tracks) readerTrack(articleBody, track, generation);
                } else {
                    TextView text = prose(entry.body);
                    text.setTextIsSelectable(true);
                    style.add(articleBody, text, -2, 30);
                }
                echoes(body, "daily:" + daily.date + ":" + category, generation);
            });
        } else if (path.startsWith("/p/") && segments.size() == 2) {
            load(() -> repository.object("/api/articles/" + Uri.encode(segments.get(1))), article -> {
                if (readerGeneration != generation) return;
                articleBody.removeAllViews();
                style.add(articleBody, style.text("过刊 / ARTICLE", 14, 0xff777777, style.heldane), -2, 0);
                style.add(articleBody, style.text(article.optString("title"), 31, Color.BLACK, style.title), -2, 20);
                style.add(articleBody, style.text(article.optString("author"), 17, 0xff666666, style.heldane), -2, 18);
                style.add(articleBody, style.text(article.optString("meta"), 14, 0xff999999, style.heldane), -2, 10);
                boolean archived = false;
                LocalDate archiveDate = null;
                try {
                    LocalDate published = LocalDate.parse(article.optString("publishedAt"));
                    archiveDate = published.withDayOfMonth(1).plusMonths(6).plusDays(published.getDayOfMonth() - 1);
                    archived = !LocalDate.now().isBefore(archiveDate);
                } catch (RuntimeException ignored) { }
                if (archived && !"1".equals(address.getQueryParameter("r"))) {
                    style.add(articleBody, prose(article.optString("excerpt")), -2, 30);
                    style.add(articleBody, style.text("这篇已于 " + archiveDate.format(DateTimeFormatter.ofPattern("yyyy.MM")) + " 沉入档案馆。", 16, 0xff666666, style.heldane), -2, 30);
                    style.add(articleBody, style.button("next", "next", Color.BLACK, this::randomArticle), 48, 16);
                } else {
                    TextView text = prose(Html.fromHtml(article.optString("content"), Html.FROM_HTML_MODE_COMPACT));
                    text.setTextIsSelectable(true);
                    style.add(articleBody, text, -2, 30);
                }
                echoes(body, article.optString("id"), generation);
            });
        }
    }

    private void readerTrack(LinearLayout body, DailyText.Track track, int generation) {
        style.add(body, style.text(track.name, 23, Color.BLACK, style.title), -2, 24);
        style.add(body, prose(track.lyrics), -2, 16);
        LinearLayout controls = style.row();
        TextView toggle = style.button("▶", "播放或暂停", Color.BLACK, () -> {
            if (player == null || !track.src.equals(playingSource)) startTrack(track.src, true);
            else if (!prepared) playWhenPrepared = !playWhenPrepared;
            else if (player.isPlaying()) { player.pause(); playWhenPrepared = false; }
            else play();
        });
        controls.addView(toggle, new LinearLayout.LayoutParams(style.dp(48), style.dp(48)));
        SeekBar progress = new SeekBar(this);
        progress.setContentDescription(track.name + " 播放进度");
        progress.setMax(1000);
        controls.addView(progress, new LinearLayout.LayoutParams(0, style.dp(48), 1));
        style.add(body, controls, 48, 14);
        progress.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar bar, int value, boolean fromUser) {
                if (fromUser && prepared && player != null && track.src.equals(playingSource)) player.seekTo(player.getDuration() * value / 1000);
            }
            @Override public void onStartTrackingTouch(SeekBar bar) { }
            @Override public void onStopTrackingTouch(SeekBar bar) { }
        });
        Runnable update = new Runnable() {
            @Override public void run() {
                if (destroyed || reader == null || generation != readerGeneration) return;
                boolean active = player != null && prepared && track.src.equals(playingSource);
                toggle.setText(active && player.isPlaying() ? "Ⅱ" : "▶");
                progress.setProgress(active && player.getDuration() > 0 ? (int) ((long) player.getCurrentPosition() * 1000 / player.getDuration()) : 0);
                if (activityVisible) handler.postDelayed(this, 500);
            }
        };
        readerProgress = update;
        handler.post(update);
    }

    private void echoes(LinearLayout body, String key, int generation) {
        style.add(body, style.text("回声", 27, Color.BLACK, style.title), -2, 48);
        LinearLayout list = style.column();
        style.add(body, list, -2, 18);
        NativeForm form = new NativeForm(this, key, false, () -> refreshEchoes(key, list, generation));
        echoForm = form;
        style.add(body, form.view, -2, 26);
        refreshEchoes(key, list, generation);
    }

    private void refreshEchoes(String key, LinearLayout list, int generation) {
        NativeForm form = echoForm;
        load(() -> {
            JSONObject result = repository.object("/api/echoes?article=" + encode(key));
            result.put("mine", repository.object("/api/echoes/mine?article=" + encode(key)).optJSONObject("echo"));
            return result;
        }, result -> {
            if (generation != readerGeneration || reader == null || form != echoForm) return;
            list.removeAllViews();
            JSONObject mine = result.optJSONObject("mine");
            form.view.setVisibility(mine == null ? View.VISIBLE : View.GONE);
            JSONArray items = result.optJSONArray("items");
            if (items == null) return;
            if (items.length() == 0 && !key.startsWith("daily:")) style.add(list, style.text("还没有回声", 16, 0xff777777, style.heldane), -2, 0);
            for (int index = 0; index < items.length(); index++) {
                JSONObject item = items.optJSONObject(index);
                if (item == null) continue;
                style.add(list, style.text(item.optString("name") + "    " + item.optString("date"), 14, 0xff777777, style.heldane), -2, 16);
                style.add(list, prose(item.optString("body")), -2, 10);
                if (mine != null && mine.optString("id").equals(item.optString("id"))) {
                    style.add(list, style.button("撤回", "撤回", Color.BLACK, () -> confirm("撤回这条回声？撤完可以重留。", () -> {
                        load(() -> repository.request("DELETE", "/api/echoes/" + item.optString("id") + "?article=" + encode(key), null),
                                ignored -> refreshEchoes(key, list, generation));
                    })), 48, 8);
                }
            }
        });
    }

    private void closeReader() {
        readerGeneration++;
        if (reader != null) {
            content.removeView(reader);
            reader = null;
            pages[current].setVisibility(View.VISIBLE);
        }
        echoForm = null;
        readerHref = null;
        readerProgress = null;
    }

    void pickImage(NativeForm form) {
        if (!form.submit.isEnabled()) return;
        imageTarget = form;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.setType("image/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {"image/png", "image/jpeg", "image/gif", "image/webp"});
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        try { startActivityForResult(intent, 41); }
        catch (ActivityNotFoundException exception) { imageTarget = null; error(exception); }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != 41) return;
        NativeForm form = imageTarget;
        imageTarget = null;
        if (result == RESULT_OK && form != null && data != null && data.getData() != null) {
            Uri uri = data.getData();
            if (!"content".equals(uri.getScheme())) return;
            try { getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION); }
            catch (SecurityException ignored) { }
            form.selectImage(uri);
        }
    }

    void localImage(ImageView image, Uri uri) {
        images.execute(() -> {
            try {
                BitmapFactory.Options bounds = new BitmapFactory.Options();
                bounds.inJustDecodeBounds = true;
                try (InputStream input = getContentResolver().openInputStream(uri)) { BitmapFactory.decodeStream(input, null, bounds); }
                bounds.inSampleSize = sample(bounds.outWidth, bounds.outHeight);
                bounds.inJustDecodeBounds = false;
                Bitmap bitmap;
                try (InputStream input = getContentResolver().openInputStream(uri)) { bitmap = BitmapFactory.decodeStream(input, null, bounds); }
                handler.post(() -> { if (!destroyed) image.setImageBitmap(bitmap); });
            } catch (IOException | SecurityException exception) {
                handler.post(() -> { if (!destroyed) { image.setVisibility(View.GONE); error(exception); } });
            }
        });
    }

    private int sample(int width, int height) {
        int sample = 1;
        while (Math.max(width, height) / sample > 1600) sample *= 2;
        return sample;
    }

    private void remoteImage(ImageView image, String path, boolean hideOnFailure) {
        image.setTag(path);
        Bitmap cached = imageCache.get(path);
        if (cached != null) { image.setImageBitmap(cached); return; }
        images.execute(() -> {
            try {
                byte[] bytes = repository.imageBytes(path);
                BitmapFactory.Options bounds = new BitmapFactory.Options();
                bounds.inJustDecodeBounds = true;
                BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
                bounds.inJustDecodeBounds = false;
                bounds.inSampleSize = sample(bounds.outWidth, bounds.outHeight);
                Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
                if (bitmap == null) throw new IOException("图片无法读取");
                imageCache.put(path, bitmap);
                handler.post(() -> { if (!destroyed && path.equals(image.getTag())) image.setImageBitmap(bitmap); });
            } catch (IOException | IllegalArgumentException exception) {
                handler.post(() -> { if (!destroyed && hideOnFailure && path.equals(image.getTag())) image.setVisibility(View.GONE); });
            }
        });
    }

    private void external(String address) {
        if (new SitePolicy(BuildConfig.SITE_URL).classify(address) == SitePolicy.Destination.BLOCKED) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(address))); }
        catch (ActivityNotFoundException exception) { error(exception); }
    }

    @Override public void onBackPressed() {
        if (menuOpen) { setMenu(false); return; }
        if (drawer != null) { closeDrawer(); return; }
        if (reader != null) { closeReader(); updateBars(current == 5); return; }
        if (current == 1 && ipod != null && ipod.back()) return;
        if (!history.isEmpty()) { showPage(history.pop(), false); return; }
        super.onBackPressed();
    }

    @Override public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        root.requestApplyInsets();
        if (drawer != null && drawer.getWindow() != null) drawer.getWindow().setLayout(Math.min(getResources().getDisplayMetrics().widthPixels - style.dp(32), style.dp(640)), getResources().getDisplayMetrics().heightPixels * 3 / 4);
    }

    @Override protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        for (int index = 0; index < scrolls.length; index++) if (scrolls[index] != null) savedScroll[index] = scrolls[index].getScrollY();
        state.putInt("page", current);
        state.putIntArray("scrolls", savedScroll);
        state.putString("category", dailyCategory);
        state.putInt("publication", publicationIndex);
        state.putInt("archiveYear", archiveYear);
        state.putInt("archiveMonth", archiveMonth);
        state.putString("reader", readerHref);
    }

    @Override protected void onStart() {
        super.onStart();
        activityVisible = true;
        handler.post(musicProgress);
        if (galleryAnimation != null) handler.post(galleryAnimation);
        if (filmAnimation != null) handler.post(filmAnimation);
        if (readerProgress != null) handler.post(readerProgress);
    }

    @Override protected void onStop() {
        activityVisible = false;
        handler.removeCallbacks(musicProgress);
        if (galleryAnimation != null) handler.removeCallbacks(galleryAnimation);
        if (filmAnimation != null) handler.removeCallbacks(filmAnimation);
        if (player != null && prepared && player.isPlaying()) player.pause();
        playWhenPrepared = false;
        audioManager.abandonAudioFocusRequest(focusRequest);
        super.onStop();
    }

    @Override protected void onDestroy() {
        destroyed = true;
        closeDrawer();
        handler.removeCallbacksAndMessages(null);
        releasePlayer();
        repository.close();
        network.shutdownNow();
        images.shutdownNow();
        super.onDestroy();
    }
}
