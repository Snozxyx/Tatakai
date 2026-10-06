package app.tatakai.me.player;

import android.app.PictureInPictureParams;
import android.content.pm.ActivityInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.util.Rational;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.TrackSelectionParameters;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.PlayerView;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Full-screen hardware-accelerated torrent player. */
public class PlayerActivity extends AppCompatActivity {
    private static final String TAG = "TatakaiPlayer";
    static final String EXTRA_URL = "url";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_START_POSITION_MS = "startPositionMs";
    static final String EXTRA_INTRO_START_MS = "introStartMs";
    static final String EXTRA_INTRO_END_MS = "introEndMs";
    static final String EXTRA_OUTRO_START_MS = "outroStartMs";
    static final String EXTRA_OUTRO_END_MS = "outroEndMs";
    static final String EXTRA_SUBTITLES = "subtitles";
    static final String EXTRA_HEADERS = "headers";
    static final String EXTRA_PREFERRED_AUDIO_LANGUAGE = "preferredAudioLanguage";
    static final String EXTRA_PREFERRED_SUBTITLE_LANGUAGE = "preferredSubtitleLanguage";
    static final String EXTRA_SUBTITLES_ENABLED = "subtitlesEnabled";

    // Weak bridge back to the plugin so progress/ended/closed events can cross
    // from this Activity without keeping a destroyed Activity (or its ExoPlayer
    // and surface) alive. A previous strong static reference leaked the whole
    // player screen across episode changes.
    @Nullable private static volatile WeakReference<PlayerActivity> activeActivityRef;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private ExoPlayer player;
    private Button skipButton;
    private long introStartMs = -1L;
    private long introEndMs = -1L;
    private long outroStartMs = -1L;
    private long outroEndMs = -1L;
    private boolean completed = false;
    private boolean closingEventSent = false;
    /** Torrent range waits can take many seconds; bound how many times we retry before surfacing an error. */
    private int errorRecoveries = 0;
    private static final int MAX_ERROR_RECOVERIES = 2;

    private final Runnable ticker = new Runnable() {
        @Override public void run() {
            if (player == null) return;
            emitProgress();
            updateSkipButton();
            handler.postDelayed(this, 2000L);
        }
    };

    public static void closeActive() {
        WeakReference<PlayerActivity> ref = activeActivityRef;
        PlayerActivity current = ref == null ? null : ref.get();
        if (current != null) current.runOnUiThread(current::finish);
    }

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        activeActivityRef = new WeakReference<>(this);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR);

        String url = getIntent().getStringExtra(EXTRA_URL);
        if (url == null || url.trim().isEmpty()) {
            finish();
            return;
        }

        introStartMs = getIntent().getLongExtra(EXTRA_INTRO_START_MS, -1L);
        introEndMs = getIntent().getLongExtra(EXTRA_INTRO_END_MS, -1L);
        outroStartMs = getIntent().getLongExtra(EXTRA_OUTRO_START_MS, -1L);
        outroEndMs = getIntent().getLongExtra(EXTRA_OUTRO_END_MS, -1L);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xFF000000);
        PlayerView playerView = new PlayerView(this);
        playerView.setUseController(true);
        playerView.setControllerAutoShow(true);
        playerView.setKeepContentOnPlayerReset(true);
        // PlayerView hides its dedicated subtitle selector by default. Expose
        // it so embedded MKV text tracks and supplied sidecars can be selected;
        // multi-audio choices remain available in the adjacent settings menu.
        playerView.setShowSubtitleButton(true);
        root.addView(playerView, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT
        ));

        skipButton = new Button(this);
        skipButton.setVisibility(View.GONE);
        skipButton.setOnClickListener(view -> {
            if (player == null) return;
            if (isInWindow(introStartMs, introEndMs)) player.seekTo(introEndMs);
            else if (isInWindow(outroStartMs, outroEndMs)) player.seekTo(outroEndMs);
        });
        FrameLayout.LayoutParams skipLayout = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.END | Gravity.BOTTOM
        );
        skipLayout.setMargins(0, 0, 32, 96);
        root.addView(skipButton, skipLayout);
        setContentView(root);

        try {
            DefaultHttpDataSource.Factory httpFactory = new DefaultHttpDataSource.Factory()
                .setAllowCrossProtocolRedirects(true);
            Map<String, String> requestHeaders = readRequestHeaders();
            if (!requestHeaders.isEmpty()) httpFactory.setDefaultRequestProperties(requestHeaders);
            DefaultDataSource.Factory dataSourceFactory = new DefaultDataSource.Factory(this, httpFactory);
            DefaultMediaSourceFactory mediaSourceFactory = new DefaultMediaSourceFactory(dataSourceFactory);
            // Torrent streams start with almost no buffered data on slow swarms.
            // The default 50s min-buffer keeps the spinner up for a long time, so
            // the minimum stays lean for a fast first frame. The rebuffer targets
            // are wider than the old 1.5s/2s pair: with a lean buffer, a 1.5s
            // rebuffer threshold made playback visibly stutter the moment the
            // swarm hiccuped, which read as "the video froze" even though the
            // stream was simply downloading.
            // Embedded MKV audio/subtitle tracks are parsed from the same source,
            // so a lean buffer also exposes them sooner in the track selector.
            DefaultLoadControl fastStartLoadControl = new DefaultLoadControl.Builder()
                .setBufferDurationsMs(10000, 30000, 2500, 5000)
                .setTargetBufferBytes(-1)
                .setPrioritizeTimeOverSizeThresholds(true)
                .build();
            player = new ExoPlayer.Builder(this)
                .setMediaSourceFactory(mediaSourceFactory)
                .setLoadControl(fastStartLoadControl)
                .build();

            TrackSelectionParameters.Builder trackParameters = player.getTrackSelectionParameters().buildUpon();
            String preferredAudio = getIntent().getStringExtra(EXTRA_PREFERRED_AUDIO_LANGUAGE);
            if (preferredAudio != null && !preferredAudio.trim().isEmpty()) {
                trackParameters.setPreferredAudioLanguage(preferredAudio.trim());
            }
            boolean subtitlesEnabled = getIntent().getBooleanExtra(EXTRA_SUBTITLES_ENABLED, true);
            trackParameters.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, !subtitlesEnabled);
            if (subtitlesEnabled) {
                String preferredSubtitle = getIntent().getStringExtra(EXTRA_PREFERRED_SUBTITLE_LANGUAGE);
                if (preferredSubtitle != null && !preferredSubtitle.trim().isEmpty()) {
                    trackParameters.setPreferredTextLanguage(preferredSubtitle.trim());
                }
                // Many release groups omit the language tag on embedded ASS
                // tracks; pick that track instead of silently disabling text.
                trackParameters.setSelectUndeterminedTextLanguage(true);
            }
            player.setTrackSelectionParameters(trackParameters.build());
        } catch (Exception error) {
            JSObject event = new JSObject();
            event.put("positionMs", 0L);
            event.put("durationMs", 0L);
            event.put("completed", false);
            event.put("message", "Unable to start the native player on this device.");
            NativePlayerPlugin.emit("playerError", event);
            finish();
            return;
        }
        player.addListener(new Player.Listener() {
            @Override public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_ENDED) {
                    completed = true;
                    emitProgress();
                    NativePlayerPlugin.emit("playerEnded", payload());
                    // The React watch page receives playerEnded and advances to
                    // the next episode when enabled. Do not leave this Activity
                    // on top of that new page.
                    handler.postDelayed(PlayerActivity.this::finish, 100L);
                }
            }

            @Override public void onPlayerError(PlaybackException error) {
                // Torrent data behind the loopback range server often needs another
                // second or two of download time; the first network error is
                // routinely transient. Recover with the same retry semantics
                // ExoPlayer gives desktop's HTTP playback, and only then give up.
                if (errorRecoveries < MAX_ERROR_RECOVERIES) {
                    errorRecoveries += 1;
                    String detail = error.getMessage() == null ? "stream interrupted" : error.getMessage();
                    Log.w(TAG, "Playback error (recovery " + errorRecoveries + "/" + MAX_ERROR_RECOVERIES + "): " + detail);
                    emitProgress();
                    handler.postDelayed(() -> {
                        if (player == null) return;
                        try {
                            player.seekToDefaultPosition();
                            player.prepare();
                            player.play();
                        } catch (Exception ignored) {
                            // prepare() on a dead source throws; onPlayerError reports it.
                        }
                    }, 1000L * errorRecoveries);
                    return;
                }
                JSObject event = payload();
                event.put("message", error.getMessage() == null ? "Unable to play this torrent file." : error.getMessage());
                NativePlayerPlugin.emit("playerError", event);
            }
        });
        playerView.setPlayer(player);

        MediaItem mediaItem;
        try {
            MediaItem.Builder item = new MediaItem.Builder().setUri(url);
            List<MediaItem.SubtitleConfiguration> subtitles = readSubtitles();
            if (!subtitles.isEmpty()) item.setSubtitleConfigurations(subtitles);
            mediaItem = item.build();
        } catch (Exception error) {
            JSObject event = new JSObject();
            event.put("positionMs", 0L);
            event.put("durationMs", 0L);
            event.put("completed", false);
            event.put("message", "Unable to play this torrent file.");
            NativePlayerPlugin.emit("playerError", event);
            finish();
            return;
        }
        player.setMediaItem(mediaItem);
        long startPositionMs = Math.max(0L, getIntent().getLongExtra(EXTRA_START_POSITION_MS, 0L));
        if (startPositionMs > 0L) player.seekTo(startPositionMs);
        player.prepare();
        player.play();
        handler.post(ticker);
    }

    private List<MediaItem.SubtitleConfiguration> readSubtitles() {
        List<MediaItem.SubtitleConfiguration> result = new ArrayList<>();
        try {
            String extra = getIntent().getStringExtra(EXTRA_SUBTITLES);
            if (extra == null || extra.trim().isEmpty()) return result;
            JSArray raw = new JSArray(extra);
            for (int index = 0; index < raw.length(); index++) {
                JSONObject track = raw.optJSONObject(index);
                if (track == null) continue;
                String url = track.optString("url", "").trim();
                if (url.isEmpty()) continue;
                MediaItem.SubtitleConfiguration.Builder subtitle = new MediaItem.SubtitleConfiguration.Builder(android.net.Uri.parse(url));
                // Media3 treats the sidecar MIME type as required: without it
                // the track cannot be decoded and may fail the whole item, so
                // always set one — prefer the JS-inferred value, fall back to
                // the URL extension, then to WebVTT as a safe default.
                String mime = track.optString("mime", "").trim();
                if (mime.isEmpty()) mime = inferSubtitleMime(url);
                subtitle.setMimeType(mime);
                String language = track.optString("lang", "").trim();
                if (!language.isEmpty()) subtitle.setLanguage(language);
                String label = track.optString("label", "").trim();
                if (!label.isEmpty()) subtitle.setLabel(label);
                // Only the first sidecar is the default; marking every track
                // default leaves selection undefined and can render several
                // tracks at once.
                if (result.isEmpty()) subtitle.setSelectionFlags(C.SELECTION_FLAG_DEFAULT);
                result.add(subtitle.build());
            }
        } catch (Exception ignored) {
            // Embedded subtitle tracks remain available even if a remote sidecar is malformed.
        }
        return result;
    }

    private Map<String, String> readRequestHeaders() {
        Map<String, String> result = new HashMap<>();
        try {
            String extra = getIntent().getStringExtra(EXTRA_HEADERS);
            if (extra == null || extra.trim().isEmpty()) return result;
            JSONObject raw = new JSONObject(extra);
            Iterator<String> keys = raw.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                String value = raw.optString(key, "").trim();
                if (!key.trim().isEmpty() && !value.isEmpty()) result.put(key, value);
            }
        } catch (Exception ignored) {
            // Embedded tracks and the loopback torrent stream still work when
            // optional sidecar request headers are malformed.
        }
        return result;
    }

    private static String inferSubtitleMime(String url) {
        String clean = url.split("\\?", 2)[0].toLowerCase(Locale.US);
        if (clean.endsWith(".vtt")) return "text/vtt";
        if (clean.endsWith(".srt")) return "application/x-subrip";
        if (clean.endsWith(".ass") || clean.endsWith(".ssa")) return "text/x-ssa";
        return "text/vtt";
    }

    private void updateSkipButton() {
        if (skipButton == null || player == null) return;
        if (isInWindow(introStartMs, introEndMs)) {
            skipButton.setText("Skip intro");
            skipButton.setVisibility(View.VISIBLE);
        } else if (isInWindow(outroStartMs, outroEndMs)) {
            skipButton.setText("Skip outro");
            skipButton.setVisibility(View.VISIBLE);
        } else {
            skipButton.setVisibility(View.GONE);
        }
    }

    private boolean isInWindow(long start, long end) {
        return player != null && start >= 0L && end > start && player.getCurrentPosition() >= start && player.getCurrentPosition() < end;
    }

    private JSObject payload() {
        JSObject event = new JSObject();
        long position = player == null ? 0L : Math.max(0L, player.getCurrentPosition());
        long rawDuration = player == null ? C.TIME_UNSET : player.getDuration();
        long duration = rawDuration == C.TIME_UNSET ? 0L : Math.max(0L, rawDuration);
        event.put("positionMs", position);
        event.put("durationMs", duration);
        event.put("completed", completed);
        return event;
    }

    private void emitProgress() {
        NativePlayerPlugin.emit("playerProgress", payload());
    }

    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && player != null && !isInPictureInPictureMode()) {
            Rational aspect = new Rational(Math.max(1, player.getVideoSize().width), Math.max(1, player.getVideoSize().height));
            enterPictureInPictureMode(new PictureInPictureParams.Builder().setAspectRatio(aspect).build());
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        // Persist the exact position when the player loses focus (home button,
        // PiP, incoming call) so reopening resumes here even if the process
        // dies before onDestroy runs.
        emitProgress();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(ticker);
        emitProgress();
        if (!closingEventSent) {
            closingEventSent = true;
            NativePlayerPlugin.emit("playerClosed", payload());
        }
        if (player != null) {
            player.release();
            player = null;
        }
        WeakReference<PlayerActivity> ref = activeActivityRef;
        if (ref != null && ref.get() == this) activeActivityRef = null;
        super.onDestroy();
    }
}
