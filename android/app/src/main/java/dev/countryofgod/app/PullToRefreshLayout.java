package dev.countryofgod.app;

import android.content.Context;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.widget.FrameLayout;

/**
 * 下拉刷新容器：把内容整体下移，松手超过阈值就通知宿主重新加载。
 *
 * 为什么自己写而不引 androidx 的 SwipeRefreshLayout：本模块至今零第三方依赖（连 AndroidX 都是关的），
 * 引一个 AAR 会把整个构建从"离线可复现"变成"必须联网拉依赖"，代价大于收益。
 *
 * 只在下探（内容已在顶部）且手势明显偏竖直时才开始接管，避免抢走网页自身的横向拖动
 * （美术馆胶片带就是横向拖动的，但它在中段，不会与"已在顶部"这个前提同时成立）。
 */
final class PullToRefreshLayout extends FrameLayout {
    interface OnRefreshListener {
        void onRefresh();
    }

    /** 手指位移到内容位移的衰减系数：拉得再长也不会把内容拽出去 */
    private static final float DAMPING = 0.55f;
    /** 松手后内容停留的位移（同时是触发刷新的阈值） */
    private static final int TRIGGER_DP = 64;
    private static final int MAX_DP = 140;
    private static final int GAP_DP = 10;

    private final int touchSlop = ViewConfiguration.get(getContext()).getScaledTouchSlop();
    private final int triggerDistance;
    private final int maxDistance;
    private final int gap;
    private final int indicatorSize;

    private View content;
    private View indicator;
    private OnRefreshListener refreshListener;

    private float downX;
    private float downY;
    private boolean dragging;
    private boolean refreshing;
    private float currentTranslation;
    private int topInset;
    private boolean pageAtTop;

    void setPageAtTop(boolean atTop) {
        pageAtTop = atTop;
    }

    PullToRefreshLayout(Context context, int indicatorSizePx) {
        super(context);
        this.indicatorSize = indicatorSizePx;
        triggerDistance = dp(context, TRIGGER_DP);
        maxDistance = dp(context, MAX_DP);
        gap = dp(context, GAP_DP);
        setBackgroundColor(0xFFFFFFFF);
    }

    void setTopInset(int insetPx) {
        topInset = insetPx;
    }

    void setContentView(View view) {
        content = view;
        addView(view, new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));
    }

    void setIndicator(View view) {
        indicator = view;
        LayoutParams params = new LayoutParams(indicatorSize, indicatorSize);
        params.gravity = android.view.Gravity.TOP | android.view.Gravity.CENTER_HORIZONTAL;
        addView(view, params);
        view.setAlpha(0f);
        view.setVisibility(INVISIBLE);
    }

    void setOnRefreshListener(OnRefreshListener listener) {
        refreshListener = listener;
    }

    boolean isRefreshing() {
        return refreshing;
    }

    /** 宿主在页面加载结束时调用：收回内容、收起指示器 */
    void finishRefresh() {
        if (content == null) {
            return;
        }
        if (refreshing || currentTranslation != 0f) {
            refreshing = false;
            animateTo(0f);
            hideIndicator();
        }
    }

    @Override
    public boolean onInterceptTouchEvent(MotionEvent event) {
        if (content == null || refreshing) {
            return false;
        }
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                downX = event.getX();
                downY = event.getY();
                dragging = false;
                return false;
            case MotionEvent.ACTION_MOVE:
                float deltaY = event.getY() - downY;
                float deltaX = event.getX() - downX;
                if (deltaY > touchSlop && deltaY > Math.abs(deltaX) * 2f && atTop()) {
                    dragging = true;
                    showIndicator();
                    return true;
                }
                return false;
            default:
                return false;
        }
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        if (!dragging) {
            return false;
        }
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_MOVE:
                drag(event.getY() - downY);
                return true;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                dragging = false;
                if (currentTranslation >= triggerDistance) {
                    startRefresh();
                } else {
                    animateTo(0f);
                    hideIndicator();
                }
                return true;
            default:
                return true;
        }
    }

    private void drag(float rawDelta) {
        float translation = Math.min(Math.max(rawDelta, 0f) * DAMPING, maxDistance);
        currentTranslation = translation;
        content.setTranslationY(translation);
        float progress = Math.min(1f, rawDelta / (triggerDistance / DAMPING));
        indicator.setAlpha(Math.max(0.15f, progress));
        indicator.setTranslationY(Math.max(topInset + gap, translation - indicatorSize - gap));
    }

    private void startRefresh() {
        refreshing = true;
        animateTo(triggerDistance);
        indicator.setAlpha(1f);
        indicator.setTranslationY(topInset + gap);
        if (refreshListener != null) {
            refreshListener.onRefresh();
        }
    }

    private void animateTo(float translation) {
        currentTranslation = translation;
        content.animate().translationY(translation).setDuration(200).start();
    }

    private void showIndicator() {
        if (indicator.getVisibility() != VISIBLE) {
            indicator.setVisibility(VISIBLE);
        }
    }

    private void hideIndicator() {
        indicator.animate().cancel();
        indicator.animate().alpha(0f).setDuration(160)
                .withEndAction(() -> indicator.setVisibility(INVISIBLE)).start();
    }

    private boolean atTop() {
        return pageAtTop && content.getScrollY() <= 0 && !content.canScrollVertically(-1);
    }

    private static int dp(Context context, int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }
}
