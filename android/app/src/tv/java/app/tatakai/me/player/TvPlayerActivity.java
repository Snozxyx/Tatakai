package app.tatakai.me.player;

import android.os.Build;
import android.view.*;
import androidx.media3.common.*;
import androidx.media3.session.MediaSession;
import androidx.media3.ui.AspectRatioFrameLayout;
import org.json.*;
import com.getcapacitor.JSObject;
import java.util.ArrayList;

/** TV remote controls share the mobile player's data sources, subtitle support and cleanup. */
public class TvPlayerActivity extends PlayerActivity {
    private MediaSession mediaSession;
    private TvPlaybackControls controls;
    private JSONArray sources = new JSONArray();
    private android.content.SharedPreferences preferences;
    private long lastSeek = 0; private int seekRepeats = 0; private int seekDirection = 0;
    private int oldDisplayMode; private JSONArray queue = new JSONArray(); private int queueIndex = -1;
    private String currentMediaId = "";
    private boolean selectHandled;
    private android.window.OnBackInvokedCallback backCallback;
    @Override protected boolean isTvPlayer() { return true; }
    @Override protected boolean shouldAutoPlay() { return getIntent().getBooleanExtra("playWhenReady", true); }
    @Override protected void configurePlayer() {
        oldDisplayMode = getWindow().getAttributes().preferredDisplayModeId;
        if (Build.VERSION.SDK_INT >= 26) getWindow().setColorMode(android.content.pm.ActivityInfo.COLOR_MODE_WIDE_COLOR_GAMUT);
        playerView.setUseController(false);
        playerView.setFocusable(true);
        preferences = getSharedPreferences("tatakai-tv-playback", MODE_PRIVATE);
        playerView.setResizeMode(preferences.getInt("aspect", AspectRatioFrameLayout.RESIZE_MODE_FIT));
        player.setPlaybackSpeed(preferences.getFloat("speed", 1f));
        if (playerView.getSubtitleView() != null && preferences.contains("subtitleSize")) {
            playerView.getSubtitleView().setApplyEmbeddedFontSizes(false);
            playerView.getSubtitleView().setFractionalTextSize(preferences.getFloat("subtitleSize", .0533f));
        }
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        player.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(), true);
        // Media3's default audio sink probes the current output route and handles passthrough/fallback.
        player.setVideoChangeFrameRateStrategy(C.VIDEO_CHANGE_FRAME_RATE_STRATEGY_ONLY_IF_SEAMLESS);
        mediaSession = new MediaSession.Builder(this, player).setId("tatakai-tv-" + java.util.UUID.randomUUID()).build();
        currentMediaId = getIntent().getStringExtra("mediaId");
        try { sources = new JSONArray(getIntent().getStringExtra("sources")); } catch (Exception ignored) { }
        controls = new TvPlaybackControls(this, player, getIntent().getStringExtra("title"), new TvPlaybackControls.Actions() {
            public void open(String panel) { openPanel(panel); }
            public void seek(int direction) { TvPlayerActivity.this.seek(direction); }
            public void exit() { finish(); }
        });
        android.widget.FrameLayout root = (android.widget.FrameLayout) playerView.getParent();
        root.addView(controls, new android.widget.FrameLayout.LayoutParams(-1, -1));
        if (Build.VERSION.SDK_INT >= 33) {
            backCallback = () -> { if (!controls.back()) finish(); };
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
        }
        if (skipButton != null) controls.attachSkip(skipButton);
        try { queue = new JSONArray(getIntent().getStringExtra("queue")); } catch (Exception ignored) { }
        for (int i = 0; i < queue.length(); i++) if (queue.optJSONObject(i) != null && queue.optJSONObject(i).optString("id").equals(currentMediaId)) queueIndex = i;
        player.addListener(new Player.Listener() {
            @Override public void onVideoSizeChanged(VideoSize size) { matchDisplay(); }
            @Override public void onPlaybackStateChanged(int state) { if (state == Player.STATE_READY) matchDisplay(); }
            @Override public void onIsPlayingChanged(boolean playing) { if (controls != null) { if (!playing) controls.showChrome(null); else controls.touch(); } }
            @Override public void onPlayerError(PlaybackException error) { if (controls != null) controls.message("Playback interrupted. Try another server or audio track."); }
        });

    }
    private void matchDisplay() {
        if (player == null || player.getVideoFormat() == null) return;
        float fps = player.getVideoFormat().frameRate;
        if (fps <= 0) return;
        if (Build.VERSION.SDK_INT >= 30) {
            View surface = playerView.getVideoSurfaceView();
            if (surface instanceof SurfaceView) {
                Surface s = ((SurfaceView) surface).getHolder().getSurface();
                if (s.isValid()) {
                    if (Build.VERSION.SDK_INT >= 31) s.setFrameRate(fps, Surface.FRAME_RATE_COMPATIBILITY_FIXED_SOURCE,
                        getIntent().getBooleanExtra("allowDisplaySwitch", false) ? Surface.CHANGE_FRAME_RATE_ALWAYS : Surface.CHANGE_FRAME_RATE_ONLY_IF_SEAMLESS);
                    else s.setFrameRate(fps, Surface.FRAME_RATE_COMPATIBILITY_FIXED_SOURCE);
                }
            }
        } else if (getIntent().getBooleanExtra("allowDisplaySwitch", false)) {
            Display display = getWindowManager().getDefaultDisplay(); Display.Mode current = display.getMode();
            for (Display.Mode mode : display.getSupportedModes()) {
                float multiple = mode.getRefreshRate() / fps;
                if (mode.getPhysicalWidth() == current.getPhysicalWidth() && mode.getPhysicalHeight() == current.getPhysicalHeight()
                    && Math.abs(multiple - Math.round(multiple)) < 0.01f) {
                    WindowManager.LayoutParams attrs = getWindow().getAttributes(); attrs.preferredDisplayModeId = mode.getModeId(); getWindow().setAttributes(attrs); break;
                }
            }
        }
    }
    private void openPanel(String panel) {
        if ("servers".equals(panel)) { showServers(); return; }
        if ("audio".equals(panel)) { showTracks(C.TRACK_TYPE_AUDIO); return; }
        if ("subtitles".equals(panel)) { showTracks(C.TRACK_TYPE_TEXT); return; }
        if ("quality".equals(panel)) { showTracks(C.TRACK_TYPE_VIDEO); return; }
        if ("queue".equals(panel)) { selectQueue(); return; }
        showSettings();
    }
    private void showServers() {
        ArrayList<android.widget.Button> rows = new ArrayList<>(); int selected = 0;
        for (int i = 0; i < sources.length(); i++) {
            JSONObject source = sources.optJSONObject(i); if (source == null) continue;
            final int index = i; boolean current = source.optBoolean("selected");
            String detail = source.optString("detail");
            if (current) selected = rows.size();
            rows.add(controls.button(source.optString("title", "Server " + (i + 1)) + (current ? " · Current" : "") + (detail.isEmpty() ? "" : "\n" + detail), () -> {
                if (current) controls.closeDrawer(); else requestSource(index);
            }));
        }
        if (getIntent().getBooleanExtra("canChangeSource", false)) rows.add(controls.button("Find more servers", () -> requestSource(-1)));
        controls.drawer("Servers", rows.isEmpty() ? "This item has no alternate servers. Offline files play directly from this TV." : "Choose a server or quality. Your playback position is kept when switching.", rows, selected, null);
    }
    private void requestSource(int index) {
        NativePlayerPlugin.emit("playerProgress", payload());
        JSObject event = payload();
        if (index >= 0) {
            JSONObject source = sources.optJSONObject(index);
            if (source != null && !source.optString("id").isEmpty()) event.put("sourceId", source.optString("id"));
            else event.put("sourceIndex", index);
        }
        NativePlayerPlugin.emit("playerSourceRequested", event); finish();
    }
    private void showTracks(int type) {
        ArrayList<android.widget.Button> rows = new ArrayList<>();
        boolean disabled = player.getTrackSelectionParameters().disabledTrackTypes.contains(type);
        rows.add(controls.button(type == C.TRACK_TYPE_TEXT ? "Off" + (disabled ? " · Selected" : "") : "Automatic", () -> {
            player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon().clearOverridesOfType(type).setTrackTypeDisabled(type, type == C.TRACK_TYPE_TEXT).build());
            controls.closeDrawer();
        }));
        int selected = 0; int available = 0;
        for (Tracks.Group group : player.getCurrentTracks().getGroups()) {
            if (group.getType() != type) continue;
            for (int i = 0; i < group.length; i++) {
                if (!group.isTrackSupported(i)) continue;
                final int track = i; Format format = group.getTrackFormat(i);
                boolean active = !disabled && group.isTrackSelected(i);
                if (active) selected = rows.size(); available++;
                String name;
                if (type == C.TRACK_TYPE_VIDEO) name = (format.height > 0 ? format.height + "p" : "Video track") + (format.bitrate > 0 ? String.format(java.util.Locale.US, " · %.1f Mbps", format.bitrate / 1000000f) : "");
                else {
                    name = format.label;
                    if (name == null || name.isEmpty()) name = format.language == null || "und".equals(format.language) ? "Track " + available : java.util.Locale.forLanguageTag(format.language).getDisplayLanguage();
                    if (type == C.TRACK_TYPE_AUDIO && format.channelCount > 0) name += " · " + format.channelCount + " channels";
                }
                rows.add(controls.button(name + (active ? " · Selected" : ""), () -> {
                    player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon().setTrackTypeDisabled(type, false)
                        .setOverrideForType(new TrackSelectionOverride(group.getMediaTrackGroup(), track)).build()); controls.closeDrawer();
                }));
            }
        }
        String title = type == C.TRACK_TYPE_AUDIO ? "Audio" : type == C.TRACK_TYPE_TEXT ? "Subtitles" : "Video quality";
        String description = available == 0 ? "No selectable tracks are available yet. Try another server if the track you need is missing." : type == C.TRACK_TYPE_VIDEO ? "Automatic adapts to your connection. Only supported tracks are shown." : "Choose a track available on this server.";
        controls.drawer(title, description, rows, selected, type == C.TRACK_TYPE_VIDEO ? this::showSettings : null);
    }
    private void showSettings() {
        ArrayList<android.widget.Button> rows = new ArrayList<>();
        rows.add(controls.button("Playback speed · " + player.getPlaybackParameters().speed + "×", this::showSpeed));
        rows.add(controls.button("Video quality", () -> showTracks(C.TRACK_TYPE_VIDEO)));
        rows.add(controls.button("Picture size", this::showAspect));
        rows.add(controls.button("Subtitle size", this::showSubtitleSize));
        rows.add(controls.button("Refresh rate · " + (getIntent().getBooleanExtra("allowDisplaySwitch", false) ? "Display switching allowed" : "Seamless only"), this::showRefresh));
        controls.drawer("Playback settings", "Changes apply immediately. Picture, speed and subtitle size are remembered on this TV.", rows, 0, null);
    }
    private void showSpeed() {
        ArrayList<android.widget.Button> rows = new ArrayList<>(); float[] speeds = {0.5f, 0.75f, 1f, 1.25f, 1.5f, 2f}; int selected = 2;
        for (int i = 0; i < speeds.length; i++) { final float speed = speeds[i]; if (Math.abs(player.getPlaybackParameters().speed - speed) < 0.01f) selected = i;
            rows.add(controls.button(speed == 1f ? "Normal · 1×" : speed + "×", () -> { player.setPlaybackSpeed(speed); preferences.edit().putFloat("speed", speed).apply(); controls.closeDrawer(); })); }
        controls.drawer("Playback speed", "Adjust the pace without changing pitch.", rows, selected, this::showSettings);
    }
    private void showAspect() {
        ArrayList<android.widget.Button> rows = new ArrayList<>(); String[] names = {"Fit · Show the whole picture", "Fill · Stretch to the screen", "Zoom · Crop to fill"};
        int[] modes = {AspectRatioFrameLayout.RESIZE_MODE_FIT, AspectRatioFrameLayout.RESIZE_MODE_FILL, AspectRatioFrameLayout.RESIZE_MODE_ZOOM}; int selected = 0;
        for (int i = 0; i < modes.length; i++) { final int mode = modes[i]; if (playerView.getResizeMode() == mode) selected = i;
            rows.add(controls.button(names[i], () -> { playerView.setResizeMode(mode); preferences.edit().putInt("aspect", mode).apply(); controls.closeDrawer(); })); }
        controls.drawer("Picture size", "Fit preserves the original image. Zoom crops its edges.", rows, selected, this::showSettings);
    }
    private void showSubtitleSize() {
        ArrayList<android.widget.Button> rows = new ArrayList<>(); String[] names = {"Small", "Medium", "Large", "Extra large"}; float[] sizes = {.04f, .0533f, .067f, .08f}; int selected = 1;
        for (int i = 0; i < sizes.length; i++) { final float size = sizes[i]; if (Math.abs(preferences.getFloat("subtitleSize", .0533f) - size) < .001f) selected = i;
            rows.add(controls.button(names[i], () -> { if (playerView.getSubtitleView() != null) { playerView.getSubtitleView().setApplyEmbeddedFontSizes(false); playerView.getSubtitleView().setFractionalTextSize(size); } preferences.edit().putFloat("subtitleSize", size).apply(); controls.closeDrawer(); })); }
        controls.drawer("Subtitle size", "Adjust text for your viewing distance. Image-based subtitles may keep their original size.", rows, selected, this::showSettings);
    }
    private void showRefresh() {
        ArrayList<android.widget.Button> rows = new ArrayList<>();
        rows.add(controls.button("Seamless only · Recommended", () -> { getIntent().putExtra("allowDisplaySwitch", false); matchDisplay(); controls.closeDrawer(); }));
        rows.add(controls.button("Allow display switching", () -> { getIntent().putExtra("allowDisplaySwitch", true); matchDisplay(); controls.closeDrawer(); }));
        controls.drawer("Match refresh rate", "Display switching may briefly blank the screen. Seamless matching avoids disruptive changes.", rows, getIntent().getBooleanExtra("allowDisplaySwitch", false) ? 1 : 0, this::showSettings);
    }
    private void selectQueue() {
        ArrayList<android.widget.Button> rows = new ArrayList<>();
        for (int i = 0; i < queue.length(); i++) { JSONObject item = queue.optJSONObject(i); if (item == null) continue; final int index = i;
            rows.add(controls.button(item.optString("title", "Channel") + (i == queueIndex ? " · Playing" : ""), () -> { playQueue(index); controls.closeDrawer(); })); }
        if (rows.isEmpty() && getIntent().getBooleanExtra("canBrowseQueue", false)) rows.add(controls.button("Browse episodes", () -> { NativePlayerPlugin.emit("playerQueueRequested", payload()); finish(); }));
        controls.drawer(getIntent().getBooleanExtra("live", false) ? "Channels" : "Episodes", rows.size() > 1 ? "Choose what to watch next." : "Open the episode list to continue watching.", rows, Math.max(0, queueIndex), null);
    }
    private void playQueue(int index) {
        if (index < 0 || index >= queue.length()) return;
        JSONObject item = queue.optJSONObject(index); if (item == null || item.optString("url").isEmpty()) return;
        NativePlayerPlugin.emit("playerProgress", payload());
        queueIndex = index; currentMediaId = item.optString("id");
        controls.setMediaTitle(item.optString("title", "Channel"));
        MediaItem.Builder media = new MediaItem.Builder().setMediaId(currentMediaId).setUri(item.optString("url"));
        if (!item.optString("mimeType").isEmpty()) media.setMimeType(item.optString("mimeType"));
        player.setMediaItem(media.build());
        player.prepare(); player.play(); NativePlayerPlugin.emit("playerItemChanged", payload());
    }
    @Override protected JSObject payload() {
        JSObject event = super.payload();
        if (player != null) event.put("playWhenReady", player.getPlayWhenReady());
        if (currentMediaId != null && !currentMediaId.isEmpty()) event.put("mediaId", currentMediaId);
        return event;
    }
    private void seek(int direction) {
        if (!player.isCurrentMediaItemSeekable()) { controls.message("This live stream does not support seeking"); return; }
        long now = android.os.SystemClock.elapsedRealtime();
        seekRepeats = now - lastSeek < 800 && direction == seekDirection ? seekRepeats + 1 : 0;
        lastSeek = now; seekDirection = direction;
        long step = seekRepeats < 3 ? 10000 : seekRepeats < 6 ? 30000 : seekRepeats < 10 ? 60000 : 300000;
        long duration = player.getDuration();
        player.seekTo(Math.max(0, Math.min(duration == C.TIME_UNSET ? Long.MAX_VALUE : duration, player.getCurrentPosition() + step * direction)));
        controls.message((direction < 0 ? "Back " : "Forward ") + step / 1000 + " seconds");
        controls.showTimeline();
    }
    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        if (player == null || controls == null) return super.dispatchKeyEvent(event);
        int code = event.getKeyCode();
        if (code == KeyEvent.KEYCODE_BACK) {
            // Android 13+ invokes the registered callback on key-up. Handling
            // key-down as well would close both the drawer and its controls.
            if (Build.VERSION.SDK_INT >= 33) return super.dispatchKeyEvent(event);
            if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
                if (!controls.back()) finish();
            }
            return true;
        }
        if (code == KeyEvent.KEYCODE_DPAD_CENTER || code == KeyEvent.KEYCODE_ENTER) {
            if (event.getAction() == KeyEvent.ACTION_UP && selectHandled) { selectHandled = false; return true; }
            if (event.getAction() == KeyEvent.ACTION_DOWN && selectHandled) return true;
            if (event.getAction() == KeyEvent.ACTION_DOWN && controls.isChromeVisible()
                    && getCurrentFocus() instanceof android.widget.Button) {
                // Activate once on Select; a newly opened drawer must not receive its key-up.
                selectHandled = true;
                getCurrentFocus().performClick();
                return true;
            }
        }
        if (event.getAction() != KeyEvent.ACTION_DOWN) return super.dispatchKeyEvent(event);
        controls.touch();
        if (controls.isDrawerOpen()) return super.dispatchKeyEvent(event);
        switch (code) {
            case KeyEvent.KEYCODE_MEDIA_PLAY: player.play(); controls.showChrome(null); return true;
            case KeyEvent.KEYCODE_MEDIA_PAUSE: player.pause(); controls.showChrome(null); return true;
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: player.setPlayWhenReady(!player.getPlayWhenReady()); controls.showChrome(null); return true;
            case KeyEvent.KEYCODE_MEDIA_NEXT: if (queue.length() > 0) playQueue(queueIndex + 1); else { NativePlayerPlugin.emit("playerNextRequested", payload()); finish(); } return true;
            case KeyEvent.KEYCODE_MEDIA_PREVIOUS: if (queue.length() > 0) playQueue(queueIndex - 1); else { NativePlayerPlugin.emit("playerPreviousRequested", payload()); finish(); } return true;
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: seek(1); return true;
            case KeyEvent.KEYCODE_MEDIA_REWIND: seek(-1); return true;
        }
        if (!controls.isChromeVisible()) {
            switch (code) {
                case KeyEvent.KEYCODE_DPAD_UP: controls.showTools(); return true;
                case KeyEvent.KEYCODE_DPAD_DOWN: controls.showEpisodes(); return true;
                case KeyEvent.KEYCODE_DPAD_CENTER: case KeyEvent.KEYCODE_ENTER:
                    selectHandled = true; player.setPlayWhenReady(!player.getPlayWhenReady()); controls.showPlayback(); return true;
                case KeyEvent.KEYCODE_DPAD_LEFT: seek(-1); return true;
                case KeyEvent.KEYCODE_DPAD_RIGHT: seek(1); return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }
    @Override public void onBackPressed() { if (controls == null || !controls.back()) finish(); }
    @Override protected void onStop() { if (player != null) player.pause(); super.onStop(); }
    @Override protected void onDestroy() {
        if (Build.VERSION.SDK_INT >= 33 && backCallback != null) getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
        if (controls != null) controls.release();
        if (mediaSession != null) { mediaSession.release(); mediaSession = null; }
        WindowManager.LayoutParams attrs = getWindow().getAttributes(); attrs.preferredDisplayModeId = oldDisplayMode; getWindow().setAttributes(attrs);
        super.onDestroy();
    }
}
