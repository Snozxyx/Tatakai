package app.tatakai.me.branding;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import app.tatakai.me.MainActivity;

/** Separate launcher activities let TV associate an icon and banner with each choice. */
public class LauncherActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(intent);
        finish();
    }
    public static final class Dark extends LauncherActivity {}
    public static final class Light extends LauncherActivity {}
    public static final class Monochrome extends LauncherActivity {}
    public static final class Legacy extends LauncherActivity {}
}
