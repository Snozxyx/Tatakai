package app.tatakai.me.player;

import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.*;
import androidx.media3.common.C;
import androidx.media3.common.Player;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Native ten-foot controls. Video remains on Media3's HDR-capable SurfaceView. */
final class TvPlaybackControls extends FrameLayout {
    interface Actions {
        void open(String panel);
        void seek(int direction);
        void exit();
    }
    static final int INK = 0xEB100C17, PAPER = 0xFFFFF8FC, MUTED = 0xFFE0D5E9;
    private final TvPlayerActivity activity;
    private final Player player;
    private final Actions actions;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final LinearLayout chrome, bottom;
    private final FrameLayout drawer;
    private final TextView heading, status, elapsed, remaining, notice;
    private final SeekBar timeline;
    private final Button play, rewind, forward, servers, episodes;
    private View drawerOpener;
    private Runnable drawerBack;
    private boolean dragging;
    private final Runnable hide = this::autoHide;
    private void autoHide() { if (!isDrawerOpen() && player.isPlaying() && !dragging) hideChrome(); }
    private final Runnable tick = new Runnable() {
        @Override public void run() { refresh(); handler.postDelayed(this, 500); }
    };

    TvPlaybackControls(TvPlayerActivity activity, Player player, String title, Actions actions) {
        super(activity); this.activity = activity; this.player = player; this.actions = actions;
        setClipChildren(false);
        chrome = new LinearLayout(activity); chrome.setOrientation(LinearLayout.VERTICAL);
        chrome.setPadding(dp(38), dp(26), dp(38), dp(26));
        chrome.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
            new int[]{0xD916101D, 0x1816101D, 0x2016101D, 0xF216101D}));
        addView(chrome, new FrameLayout.LayoutParams(-1, -1));
        LinearLayout header = row();
        Button back = button("Back", () -> actions.exit()); header.addView(back);
        LinearLayout identity = new LinearLayout(activity); identity.setOrientation(LinearLayout.VERTICAL);
        identity.setPadding(dp(20), 0, dp(20), 0);
        heading = text(title == null || title.isEmpty() ? "Tatakai player" : title, 30, PAPER);
        heading.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        heading.setMaxLines(1); heading.setEllipsize(android.text.TextUtils.TruncateAt.END);
        identity.addView(heading);
        status = text("Preparing playback…", 14, MUTED); identity.addView(status);
        header.addView(new View(activity), new LinearLayout.LayoutParams(0, 1, 1));
        TextView brand = text("tatakai", 24, PAPER); brand.setTypeface(Typeface.DEFAULT_BOLD); header.addView(brand);
        chrome.addView(header);
        chrome.addView(new View(activity), new LinearLayout.LayoutParams(1, 0, 1));
        bottom = new LinearLayout(activity); bottom.setOrientation(LinearLayout.VERTICAL);
        notice = text("", 16, PAPER); notice.setPadding(0, 0, 0, dp(10)); bottom.addView(identity);
        notice.setPadding(dp(20), dp(8), 0, dp(10)); bottom.addView(notice);
        LinearLayout times = row();
        elapsed = text("0:00", 14, PAPER); remaining = text("", 14, MUTED);
        times.addView(elapsed, new LinearLayout.LayoutParams(0, -2, 1)); times.addView(remaining); bottom.addView(times);
        timeline = new SeekBar(activity); timeline.setMax(10000); timeline.setId(View.generateViewId());
        timeline.setContentDescription("Playback position. Left and Right seek; Down opens playback controls.");
        timeline.setProgressTintList(ColorStateList.valueOf(0xFF8B5CF6));
        timeline.setProgressBackgroundTintList(ColorStateList.valueOf(0x55FFFFFF));
        timeline.setThumbTintList(ColorStateList.valueOf(PAPER));
        bottom.addView(timeline, new LinearLayout.LayoutParams(-1, dp(40)));
        timeline.setOnKeyListener((v, code, event) -> {
            if (event.getAction() == KeyEvent.ACTION_DOWN && (code == KeyEvent.KEYCODE_DPAD_LEFT || code == KeyEvent.KEYCODE_DPAD_RIGHT)) {
                actions.seek(code == KeyEvent.KEYCODE_DPAD_LEFT ? -1 : 1); touch(); return true;
            } return false;
        });
        timeline.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            public void onStartTrackingTouch(SeekBar bar) { dragging = true; touch(); }
            public void onProgressChanged(SeekBar bar, int value, boolean user) {
                if (user && player.isCurrentMediaItemSeekable() && player.getDuration() > 0)
                    elapsed.setText(time(player.getDuration() * value / 10000));
            }
            public void onStopTrackingTouch(SeekBar bar) {
                dragging = false;
                if (player.isCurrentMediaItemSeekable() && player.getDuration() > 0) player.seekTo(player.getDuration() * bar.getProgress() / 10000);
                touch();
            }
        });
        LinearLayout transport = row();
        rewind = button("Back 10s", () -> actions.seek(-1));
        play = button("Pause", () -> { player.setPlayWhenReady(!player.getPlayWhenReady()); refresh(); });
        forward = button("Forward 10s", () -> actions.seek(1));
        transport.setGravity(Gravity.CENTER);
        for (Button control : new Button[]{rewind, play, forward}) {
            boolean main = control == play;
            LinearLayout.LayoutParams target = new LinearLayout.LayoutParams(dp(main ? 92 : 58), dp(main ? 92 : 58));
            target.setMargins(dp(20), 0, dp(20), 0);
            control.setLayoutParams(target);
            control.setPadding(0, 0, 0, 0);
            control.setBackground(transportBackground(main));
            control.setText("");
            transport.addView(control);
        }
        rewind.setContentDescription("Rewind 10 seconds"); forward.setContentDescription("Forward 10 seconds");
        rewind.setForeground(new TransportIcon(-1)); forward.setForeground(new TransportIcon(1));
        chrome.addView(transport, 2);
        chrome.addView(new View(activity), 3, new LinearLayout.LayoutParams(1, 0, 1));
        servers = button("Servers", () -> actions.open("servers"));
        Button audio = button("Audio", () -> actions.open("audio"));
        Button subtitles = button("Subtitles", () -> actions.open("subtitles"));
        episodes = button(activity.getIntent().getBooleanExtra("live", false) ? "Channels" : "Episodes", () -> actions.open("queue"));
        Button settings = button("Settings", () -> actions.open("settings"));
        // Two rows keep every target legible on 720p TV devices.

        LinearLayout tools = row(); tools.setPadding(0, dp(10), 0, 0);
        for (Button item : new Button[]{servers, audio, subtitles, episodes, settings}) {
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(48), 1); params.setMargins(0, 0, dp(10), 0); tools.addView(item, params);
        }
        bottom.addView(tools);
        TextView hint = text("D-Pad: move    Select: choose    Timeline Left / Right: seek    Back: hide controls", 12, MUTED);
        hint.setPadding(0, dp(13), 0, 0); bottom.addView(hint); chrome.addView(bottom);
        drawer = new FrameLayout(activity); drawer.setVisibility(GONE);
        drawer.setBackgroundColor(0x66100915);
        addView(drawer, new FrameLayout.LayoutParams(-1, -1));
        handler.post(tick); showChrome(play);
    }
    Button button(String label, Runnable action) {
        Button button = new Button(activity); button.setId(View.generateViewId());
        button.setText(label); button.setAllCaps(false); button.setTextSize(16);
        button.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        button.setTextColor(new ColorStateList(new int[][]{new int[]{android.R.attr.state_focused}, new int[]{}}, new int[]{0xFF281B2B, PAPER}));
        button.setPadding(dp(18), dp(8), dp(18), dp(8)); button.setMinHeight(dp(48)); button.setMinimumHeight(dp(48));
        button.setStateListAnimator(null); button.setBackground(buttonBackground());
        button.setOnClickListener(view -> { touch(); action.run(); });
        button.setOnFocusChangeListener((view, focused) -> { if (focused) touch(); });
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-2, dp(48)); params.setMargins(0, 0, dp(10), 0); button.setLayoutParams(params);
        return button;
    }
    private StateListDrawable buttonBackground() {
        StateListDrawable states = new StateListDrawable();
        states.addState(new int[]{android.R.attr.state_focused}, surface(PAPER, 24));
        states.addState(new int[]{android.R.attr.state_pressed}, surface(0xFFBD91B0, 24));
        states.addState(new int[]{android.R.attr.state_selected}, surface(0xFF72566E, 24));
        states.addState(new int[]{-android.R.attr.state_enabled}, surface(0x332C2131, 24));
        states.addState(new int[]{}, surface(0x99433447, 24)); return states;
    }
    private StateListDrawable transportBackground(boolean main) {
        StateListDrawable states = new StateListDrawable();
        GradientDrawable focus = surface(0x887C3AED, 100); focus.setStroke(dp(3), PAPER);
        GradientDrawable idle = surface(0x22100C17, 100); if (main) idle.setStroke(dp(2), PAPER);
        states.addState(new int[]{android.R.attr.state_focused}, focus); states.addState(new int[]{}, idle); return states;
    }
    private final class TransportIcon extends android.graphics.drawable.Drawable {
        private final int kind;
        private final android.graphics.Paint paint = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
        TransportIcon(int kind) { this.kind = kind; }
        @Override public void draw(android.graphics.Canvas canvas) {
            android.graphics.Rect bounds = getBounds(); float cx = bounds.exactCenterX(), cy = bounds.exactCenterY();
            float r = Math.min(bounds.width(), bounds.height()) * .23f;
            paint.setColor(PAPER); paint.setStyle(android.graphics.Paint.Style.FILL);
            if (kind == 0) {
                android.graphics.Path triangle = new android.graphics.Path(); triangle.moveTo(cx-r*.65f,cy-r); triangle.lineTo(cx+r,cy); triangle.lineTo(cx-r*.65f,cy+r); triangle.close(); canvas.drawPath(triangle,paint);
            } else if (kind == 2) {
                canvas.drawRect(cx-r*.7f,cy-r,cx-r*.15f,cy+r,paint); canvas.drawRect(cx+r*.15f,cy-r,cx+r*.7f,cy+r,paint);
            } else {
                paint.setStyle(android.graphics.Paint.Style.STROKE); paint.setStrokeWidth(dp(2));
                canvas.drawArc(cx-r,cy-r,cx+r,cy+r,kind < 0 ? 210 : -30,290,false,paint);
                paint.setStyle(android.graphics.Paint.Style.FILL); paint.setTextSize(dp(12)); paint.setTextAlign(android.graphics.Paint.Align.CENTER);
                canvas.drawText("10",cx,cy+dp(4),paint);
                android.graphics.Path arrow = new android.graphics.Path(); float x = cx + (kind < 0 ? -r : r);
                arrow.moveTo(x,cy-r*.7f); arrow.lineTo(x+(kind < 0 ? dp(7) : -dp(7)),cy-r*.8f); arrow.lineTo(x,cy-r*.1f); arrow.close(); canvas.drawPath(arrow,paint);
            }
        }
        @Override public void setAlpha(int alpha) { paint.setAlpha(alpha); }
        @Override public void setColorFilter(android.graphics.ColorFilter filter) { paint.setColorFilter(filter); }
        @Override public int getOpacity() { return android.graphics.PixelFormat.TRANSLUCENT; }
    }
    void attachSkip(Button skip) {
        ((ViewGroup) skip.getParent()).removeView(skip);
        skip.setAllCaps(false); skip.setTextSize(16); skip.setTextColor(PAPER); skip.setBackground(buttonBackground());
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-2, dp(46)); params.bottomMargin = dp(10);
        bottom.addView(skip, 0, params);
    }
    void refresh() {
        long duration = player.getDuration(), position = player.getCurrentPosition();
        boolean seekable = player.isCurrentMediaItemSeekable() && duration > 0;
        timeline.setEnabled(seekable);
        rewind.setEnabled(seekable); forward.setEnabled(seekable);
        rewind.setAlpha(seekable ? 1f : .4f); forward.setAlpha(seekable ? 1f : .4f);
        if (!dragging) timeline.setProgress(seekable ? (int) Math.min(10000, position * 10000 / duration) : 0);
        timeline.setSecondaryProgress(seekable ? (int) Math.min(10000, player.getBufferedPosition() * 10000 / duration) : 0);
        if (!dragging) elapsed.setText(time(position));
        remaining.setText(player.isCurrentMediaItemLive() ? "LIVE" : duration > 0 ? "−" + time(Math.max(0, duration - position)) : "");
        play.setContentDescription(player.getPlayWhenReady() ? "Pause" : "Play");
        play.setForeground(new TransportIcon(player.getPlayWhenReady() ? 2 : 0));
        String state = player.getPlaybackState() == Player.STATE_BUFFERING ? "Buffering…" : player.getPlayWhenReady() ? "Playing" : "Paused";
        if (player.getPlayerError() != null) state = "Playback interrupted · Open Servers to choose another source";
        status.setText(state + (player.getPlaybackParameters().speed != 1f ? String.format(Locale.US, " · %.2g×", player.getPlaybackParameters().speed) : ""));
    }
    void message(String value) { notice.setText(value); showChrome(null); }
    void setMediaTitle(String title) { heading.setText(title); notice.setText(""); }
    boolean isChromeVisible() { return chrome.getVisibility() == VISIBLE; }
    boolean isDrawerOpen() { return drawer.getVisibility() == VISIBLE; }
    void touch() { handler.removeCallbacks(hide); handler.postDelayed(hide, 4000); }
    void showChrome(View focus) { chrome.setVisibility(VISIBLE); if (focus != null) focus.requestFocus(); touch(); }
    void showTools() { showChrome(servers); }
    void showPlayback() { showChrome(play); }
    void showTimeline() { showChrome(timeline); }
    void showEpisodes() { showChrome(episodes); }
    void hideChrome() { if (!isDrawerOpen()) { notice.setText(""); chrome.setVisibility(GONE); activity.playerView.requestFocus(); } }
    boolean back() {
        if (isDrawerOpen()) { if (drawerBack != null) drawerBack.run(); else closeDrawer(); return true; }
        if (isChromeVisible()) { hideChrome(); return true; } return false;
    }
    void drawer(String title, String description, List<Button> choices, int selected, Runnable back) {
        if (!isDrawerOpen()) drawerOpener = activity.getCurrentFocus();
        drawerBack = back; drawer.removeAllViews(); drawer.setVisibility(VISIBLE);
        chrome.setDescendantFocusability(ViewGroup.FOCUS_BLOCK_DESCENDANTS);
        LinearLayout sheet = new LinearLayout(activity); sheet.setOrientation(LinearLayout.VERTICAL);
        sheet.setPadding(dp(26), dp(24), dp(26), dp(24)); sheet.setBackground(surface(INK, 12)); sheet.setElevation(dp(18));
        FrameLayout.LayoutParams placement = new FrameLayout.LayoutParams(Math.min(dp(440), getResources().getDisplayMetrics().widthPixels * 48 / 100), -1, Gravity.END);
        placement.setMargins(0, dp(20), dp(20), dp(20)); drawer.addView(sheet, placement);
        TextView heading = text(title, 27, PAPER); heading.setTypeface(Typeface.DEFAULT_BOLD); sheet.addView(heading);
        TextView detail = text(description, 15, MUTED); detail.setPadding(0, dp(8), 0, dp(20)); sheet.addView(detail);
        ScrollView scroll = new ScrollView(activity); scroll.setFillViewport(false); scroll.setClipToPadding(false);
        LinearLayout list = new LinearLayout(activity); list.setOrientation(LinearLayout.VERTICAL); list.setPadding(dp(3), dp(3), dp(3), dp(3)); scroll.addView(list);
        sheet.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        Button close = button(back == null ? "Back to video" : "Back to settings", () -> { if (drawerBack != null) drawerBack.run(); else closeDrawer(); });
        List<Button> focusOrder = new ArrayList<>(choices); focusOrder.add(close);
        for (int i = 0; i < focusOrder.size(); i++) {
            Button option = focusOrder.get(i);
            option.setSelected(i == selected && i < choices.size());
            option.setGravity(Gravity.START | Gravity.CENTER_VERTICAL); option.setSingleLine(false);
            LinearLayout.LayoutParams row = new LinearLayout.LayoutParams(-1, -2); row.setMargins(0, 0, 0, dp(9));
            option.setMinHeight(dp("Episodes".equals(title) || "Channels".equals(title) ? 94 : 56)); option.setPadding(dp(18), dp(13), dp(18), dp(13)); list.addView(option, row);
            option.setNextFocusUpId(focusOrder.get(Math.max(0, i - 1)).getId());
            option.setNextFocusDownId(focusOrder.get(Math.min(focusOrder.size() - 1, i + 1)).getId());
            option.setNextFocusLeftId(option.getId()); option.setNextFocusRightId(option.getId());
        }
        // Focus now so a queued callback cannot steal focus from the next drawer.
        focusOrder.get(Math.max(0, Math.min(selected, focusOrder.size() - 1))).requestFocus();
    }
    void closeDrawer() {
        drawer.setVisibility(GONE); drawer.removeAllViews(); drawerBack = null;
        chrome.setDescendantFocusability(ViewGroup.FOCUS_AFTER_DESCENDANTS);
        showChrome(drawerOpener != null ? drawerOpener : play);
    }
    void release() { handler.removeCallbacksAndMessages(null); }
    private LinearLayout row() { LinearLayout row = new LinearLayout(activity); row.setGravity(Gravity.CENTER_VERTICAL); return row; }
    private TextView text(String value, int size, int color) { TextView view = new TextView(activity); view.setText(value); view.setTextSize(size); view.setTextColor(color); return view; }
    private GradientDrawable surface(int color, int radius) { GradientDrawable drawable = new GradientDrawable(); drawable.setColor(color); drawable.setCornerRadius(dp(radius)); return drawable; }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private static String time(long milliseconds) {
        long seconds = Math.max(0, milliseconds / 1000);
        return seconds >= 3600 ? String.format(Locale.US, "%d:%02d:%02d", seconds / 3600, seconds / 60 % 60, seconds % 60) : String.format(Locale.US, "%d:%02d", seconds / 60, seconds % 60);
    }
}
