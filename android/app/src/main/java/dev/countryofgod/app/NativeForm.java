package dev.countryofgod.app;

import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.text.Editable;
import android.text.InputFilter;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONObject;

final class NativeForm {
    final LinearLayout view;
    final EditText name;
    final EditText body;
    final TextView submit;
    final TextView hint;
    final ImageView preview;
    private final MainActivity host;
    private final String slot;
    private final String article;
    private final SharedPreferences preferences;
    private final String prefix;
    private final Runnable changed;
    private final Runnable save;
    private boolean restoring;
    private int revision;
    private Uri image;

    NativeForm(MainActivity host, String article, boolean dark, Runnable changed) {
        this.host = host;
        this.article = article;
        this.changed = changed;
        slot = article == null ? "guestbook" : "echo:" + article;
        preferences = host.getSharedPreferences("native-drafts", 0);
        prefix = BuildConfig.SITE_URL + ":" + slot + ":";
        NativeStyle style = host.style;
        int ink = dark ? Color.WHITE : Color.BLACK;
        view = style.column();
        name = field("名字", 24, false, ink, dark);
        style.add(view, name, 52, 0);
        if (article == null) {
            TextView upload = style.button("Upload?", "Upload?", ink, () -> host.pickImage(this));
            upload.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
            style.add(view, upload, 48, 8);
        }
        preview = new ImageView(host);
        preview.setAdjustViewBounds(true);
        preview.setScaleType(ImageView.ScaleType.FIT_CENTER);
        preview.setContentDescription("待上传图片预览");
        preview.setVisibility(View.GONE);
        style.add(view, preview, 160, 8);
        body = field(article == null ? "Mus es sein?" : "我也这样想过……", 500, true, ink, dark);
        style.add(view, body, 170, 12);
        submit = style.button(article == null ? "Es mus sein!" : "留下回声",
                article == null ? "Es mus sein!" : "留下回声", ink, this::send);
        submit.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        style.add(view, submit, 52, 12);
        hint = style.text("", 14, dark ? Color.WHITE : NativeStyle.RED, style.heldane);
        hint.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        hint.setVisibility(View.GONE);
        style.add(view, hint, -2, 8);
        save = () -> {
            if (restoring) return;
            JSONObject draft = new JSONObject();
            try {
                draft.put("slot", slot);
                draft.put("name", name.getText().toString());
                draft.put("body", body.getText().toString());
            } catch (org.json.JSONException ignored) { return; }
            host.load(() -> host.repository.request("PUT", "/api/drafts", draft), ignored -> { }, ignored -> { });
        };
        restoreLocal();
        TextWatcher watcher = new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence value, int start, int count, int after) { }
            @Override public void onTextChanged(CharSequence value, int start, int before, int count) { }
            @Override public void afterTextChanged(Editable value) {
                if (restoring) return;
                revision++;
                persist();
                host.handler.removeCallbacks(save);
                host.handler.postDelayed(save, 800);
            }
        };
        name.addTextChangedListener(watcher);
        body.addTextChangedListener(watcher);
        int initialRevision = revision;
        host.load(() -> host.repository.object("/api/drafts?slot=" + host.encode(slot)), result -> {
            JSONObject draft = result.optJSONObject("draft");
            if (draft != null && initialRevision == revision && body.length() == 0) {
                restoring = true;
                name.setText(draft.optString("name", ""));
                body.setText(draft.optString("body", ""));
                restoring = false;
                persist();
            }
        }, ignored -> { });
    }

    private EditText field(String label, int limit, boolean multiline, int ink, boolean dark) {
        NativeStyle style = host.style;
        EditText input = new EditText(host);
        input.setTextSize(17);
        input.setTypeface(android.graphics.Typeface.SERIF);
        input.setTextColor(ink);
        input.setHintTextColor(dark ? 0xff999999 : 0xff777777);
        input.setHint(label);
        input.setContentDescription(label);
        input.setPadding(style.dp(12), style.dp(12), style.dp(12), style.dp(12));
        input.setBackground(NativeStyle.background(Color.TRANSPARENT, dark ? 0xff666666 : 0xffbbbbbb, style.dp(1), 0));
        input.setInputType(InputType.TYPE_CLASS_TEXT | (multiline ? InputType.TYPE_TEXT_FLAG_MULTI_LINE
                | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES : InputType.TYPE_TEXT_VARIATION_PERSON_NAME));
        input.setSingleLine(!multiline);
        input.setGravity(Gravity.TOP | Gravity.START);
        input.setFilters(new InputFilter[] { new InputFilter.LengthFilter(limit) });
        input.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO);
        return input;
    }

    private void restoreLocal() {
        restoring = true;
        name.setText(preferences.getString(prefix + "name", preferences.getString(BuildConfig.SITE_URL + ":nickname", "")));
        body.setText(preferences.getString(prefix + "body", ""));
        String uri = preferences.getString(prefix + "image", null);
        if (article == null && uri != null) selectImage(Uri.parse(uri));
        restoring = false;
    }

    private void persist() {
        preferences.edit().putString(prefix + "name", name.getText().toString())
                .putString(prefix + "body", body.getText().toString())
                .putString(prefix + "image", image == null ? null : image.toString())
                .putString(BuildConfig.SITE_URL + ":nickname", name.getText().toString()).apply();
    }

    void selectImage(Uri uri) {
        if (!submit.isEnabled()) return;
        image = uri;
        preview.setVisibility(View.VISIBLE);
        host.localImage(preview, uri);
        persist();
    }

    void rememberName(String nickname) {
        if (name.length() == 0 && nickname != null && !nickname.isEmpty()) {
            restoring = true;
            name.setText(nickname);
            restoring = false;
        }
    }

    private void send() {
        if (!submit.isEnabled()) return;
        String sender = name.getText().toString();
        String message = body.getText().toString();
        Uri attachment = image;
        host.handler.removeCallbacks(save);
        submit.setEnabled(false);
        name.setEnabled(false);
        body.setEnabled(false);
        hint.setVisibility(View.GONE);
        host.load(() -> {
            JSONObject result;
            if (article == null) result = host.repository.uploadGuest(sender, message, attachment);
            else {
                JSONObject payload = new JSONObject();
                payload.put("articleId", article);
                payload.put("name", sender);
                payload.put("body", message);
                result = host.repository.request("POST", "/api/echoes", payload);
            }
            try { host.repository.request("DELETE", "/api/drafts?slot=" + host.encode(slot), null); }
            catch (Exception ignored) { }
            return result;
        }, result -> {
            submit.setEnabled(true);
            name.setEnabled(true);
            body.setEnabled(true);
            restoring = true;
            body.setText("");
            image = null;
            preview.setImageDrawable(null);
            preview.setVisibility(View.GONE);
            restoring = false;
            persist();
            changed.run();
        }, error -> {
            submit.setEnabled(true);
            name.setEnabled(true);
            body.setEnabled(true);
            hint.setText(error.getMessage());
            hint.setVisibility(View.VISIBLE);
        });
    }
}
