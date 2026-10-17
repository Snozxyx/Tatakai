package app.tatakai.me.player;

import android.content.Intent;
import android.os.Bundle;

/** Local developer preview; packaged only in the TV test APK, never the app. */
public class TvPlayerPreviewRunner extends androidx.test.runner.AndroidJUnitRunner {
    private boolean preview;
    @Override public void onCreate(Bundle arguments) {
        preview = "true".equals(arguments.getString("preview"));
        super.onCreate(arguments);
    }
    @Override public void onStart() {
        if (!preview) { super.onStart(); return; }
        sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_WAKEUP);
        Intent intent = new Intent(getTargetContext(), TvPlayerActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        intent.putExtra("url", "asset:///public/assets/tv/wallpapers/sakura.mp4");
        intent.putExtra("title", "Tatakai · Player preview");
        intent.putExtra("sources", "[{\"title\":\"Video wallpaper preview\",\"detail\":\"Preview video · Direct stream\",\"selected\":true}]");
        TvPlayerActivity activity = (TvPlayerActivity) startActivitySync(intent);
        runOnMainSync(() -> activity.player.setRepeatMode(androidx.media3.common.Player.REPEAT_MODE_ONE));
    }
}
