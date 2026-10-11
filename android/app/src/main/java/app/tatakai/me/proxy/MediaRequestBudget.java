package app.tatakai.me.proxy;

import android.content.Context;
import android.net.ConnectivityManager;
import app.tatakai.me.download.MobileDownloadStore;

/** Shared network budget: playback > speculation > offline jobs. */
public final class MediaRequestBudget {
    private static int active, waitingPlayback, waitingPrefetch;
    private MediaRequestBudget() {}
    public static synchronized void acquire(Context context, int priority) throws InterruptedException {
        if (priority == 0) waitingPlayback++;
        if (priority == 1) waitingPrefetch++;
        try {
            while (true) {
                boolean metered = ((ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE)).isActiveNetworkMetered();
                int limit = MobileDownloadStore.dataSaver ? 2 : metered ? 2 : 6;
                if (active < limit && (priority == 0 || waitingPlayback == 0 && (priority == 1 || waitingPrefetch == 0))) { active++; return; }
                MediaRequestBudget.class.wait(100);
            }
        } finally { if (priority == 0) waitingPlayback--; if (priority == 1) waitingPrefetch--; }
    }
    public static synchronized void release() { active = Math.max(0, active - 1); MediaRequestBudget.class.notifyAll(); }
}
