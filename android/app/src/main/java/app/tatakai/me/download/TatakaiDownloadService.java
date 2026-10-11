package app.tatakai.me.download;

import android.app.*;
import android.content.*;
import android.os.*;
import org.json.*;
import java.util.concurrent.atomic.AtomicBoolean;

public final class TatakaiDownloadService extends Service {
    private final AtomicBoolean working = new AtomicBoolean();
    private MobileDownloadStore store;
    private PowerManager.WakeLock wakeLock;
    private volatile boolean stopped;
    private Thread worker;
    private static final int ID = 1702;
    @Override public void onCreate() {
        super.onCreate(); store = MobileDownloadStore.get(this);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel("tatakai-native-downloads", "Anime downloads", NotificationManager.IMPORTANCE_LOW);
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Tatakai:downloads");
    }
    private Notification notification(String body) {
        Intent open = new Intent(this, app.tatakai.me.MainActivity.class);
        PendingIntent pending = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, "tatakai-native-downloads") : new Notification.Builder(this);
        return builder.setContentTitle("Tatakai downloads").setContentText(body)
            .setSmallIcon(app.tatakai.me.R.drawable.ic_notification).setContentIntent(pending).setOngoing(true).setOnlyAlertOnce(true).build();
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(ID, notification("Preparing downloads"));
        if (working.compareAndSet(false, true)) {
          worker = new Thread(() -> {
            try {
                while (!stopped && store.hasPending()) {
                    if (!wakeLock.isHeld()) wakeLock.acquire(10 * 60 * 1000L);
                    if (!store.networkAllowed()) { Thread.sleep(1000); continue; }
                    JSONObject job = store.nextJob(); if (job == null) break;
                    getSystemService(NotificationManager.class).notify(ID, notification(job.optString("animeName", "Anime") + " · Episode " + job.optInt("episodeNumber")));
                    // Progress notification polling is native, independent of the WebView.
                    Handler handler = new Handler(Looper.getMainLooper());
                    Runnable tick = new Runnable() { public void run() {
                        if ("downloading".equals(job.optString("status"))) {
                            getSystemService(NotificationManager.class).notify(ID, notification(job.optString("animeName") + " · " + job.optInt("progress") + "%"));
                            handler.postDelayed(this, 2500);
                        }
                    }};
                    handler.post(tick); store.run(job); handler.removeCallbacks(tick);
                }
            } catch (InterruptedException e) { Thread.currentThread().interrupt(); store.suspend(); }
            finally {
                working.set(false);
                if (!stopped && store.hasPending()) onStartCommand(null, 0, startId);
                else { if (wakeLock.isHeld()) wakeLock.release(); stopForeground(true); stopSelf(); }
            }
          }, "tatakai-download-queue"); worker.start();
        }
        return START_STICKY;
    }
    @Override public void onTimeout(int startId, int foregroundServiceType) { store.suspend(); stopSelf(); }
    @Override public void onDestroy() { stopped = true; store.suspend(); if (worker != null) worker.interrupt(); if (wakeLock.isHeld()) wakeLock.release(); super.onDestroy(); }
    @Override public IBinder onBind(Intent intent) { return null; }
}
