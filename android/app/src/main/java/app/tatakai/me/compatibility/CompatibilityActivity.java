package app.tatakai.me.compatibility;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.*;
import android.widget.*;
import java.net.URI;
import java.util.UUID;
import java.util.concurrent.*;

/** Private browser in the compatibility process; shares only that process's cookie store. */
public final class CompatibilityActivity extends Activity {
    interface Open { void open(CompatibilityActivity activity) throws Exception; }
    private static final ConcurrentHashMap<String, Session> sessions = new ConcurrentHashMap<>();
    private static final class Session {
        final Open open; final CompletableFuture<String> result = new CompletableFuture<>();
        volatile CompatibilityActivity activity;
        Session(Open open) { this.open = open; }
    }
    private Session session;
    private WebView browser;
    private static String show(Context context, Open open) throws Exception {
        String id = UUID.randomUUID().toString(); Session session = new Session(open); sessions.put(id, session);
        try {
            context.startActivity(new Intent(context, CompatibilityActivity.class).putExtra("session", id).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            return session.result.get(5, TimeUnit.MINUTES);
        } finally {
            sessions.remove(id);
            new Handler(Looper.getMainLooper()).post(() -> { if (session.activity != null) session.activity.finish(); });
        }
    }
    static String authenticate(Context context, String url) throws Exception {
        URI target = new URI(url);
        if (!("https".equals(target.getScheme()) || "http".equals(target.getScheme())) || target.getHost() == null || target.getUserInfo() != null) throw new IllegalArgumentException("Invalid source sign-in URL");
        return show(context, activity -> activity.openBrowser(url));
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        session = sessions.get(getIntent().getStringExtra("session"));
        if (session == null) { finish(); return; }
        session.activity = this;
        try { session.open.open(this); } catch (Exception error) { session.result.completeExceptionally(error); finish(); }
    }
    private void openBrowser(String url) {
        LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL);
        TextView title = new TextView(this); title.setText("Sign in to this source, then choose Done"); layout.addView(title);
        Button done = new Button(this); done.setText("Done"); done.setOnClickListener(view -> {
            CookieManager.getInstance().flush(); session.result.complete(browser.getSettings().getUserAgentString()); finish();
        }); layout.addView(done);
        browser = new WebView(this);
        WebSettings settings = browser.getSettings(); settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false); settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(browser, false);
        browser.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme(); return !"https".equals(scheme) && !"http".equals(scheme);
            }
            @Override public void onReceivedSslError(WebView view, android.webkit.SslErrorHandler handler, android.net.http.SslError error) { handler.cancel(); }
        });
        browser.setDownloadListener((a,b,c,d,e) -> {});
        layout.addView(browser, new LinearLayout.LayoutParams(-1, 0, 1)); setContentView(layout); browser.loadUrl(url);
    }
    @Override protected void onDestroy() {
        if (browser != null) { browser.stopLoading(); browser.destroy(); browser = null; }
        if (session != null && !session.result.isDone()) session.result.completeExceptionally(new CancellationException("Source sign-in cancelled"));
        super.onDestroy();
    }
}
