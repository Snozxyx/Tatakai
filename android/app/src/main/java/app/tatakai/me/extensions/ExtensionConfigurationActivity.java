package app.tatakai.me.extensions;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Message;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.ArrayList;

/** A private configuration browser without access to the app's JavaScript bridge. */
public final class ExtensionConfigurationActivity extends Activity {
    private final ArrayList<WebView> popups = new ArrayList<>();
    private WebView browser;
    private TextView status;
    private String requestId;
    private String initialUrl;
    private boolean completed;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        requestId = getIntent().getStringExtra("requestId");
        initialUrl = getIntent().getStringExtra("url");
        if (requestId == null || !ExtensionConfigurationUrl.isWebUrl(initialUrl)) {
            finishWithResult(null);
            return;
        }
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setBackgroundColor(Color.rgb(16, 13, 17));
        int spacing = (int) (12 * getResources().getDisplayMetrics().density);
        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setPadding(spacing, spacing / 2, spacing, spacing / 2);
        TextView title = new TextView(this);
        title.setText("Configure extension");
        title.setTextColor(Color.WHITE);
        title.setTextSize(20);
        toolbar.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        addButton(toolbar, "Back", () -> navigateBack());
        addButton(toolbar, "Reload", () -> { status.setText("Configure this addon, then choose its Install button"); browser.reload(); });
        addButton(toolbar, "Close", () -> finishWithResult(null));
        layout.addView(toolbar);
        status = new TextView(this);
        status.setText("Configure this addon, then choose its Install button");
        status.setTextColor(Color.LTGRAY);
        status.setPadding(spacing, 0, spacing, spacing / 2);
        layout.addView(status);
        browser = createBrowser(false);
        layout.addView(browser, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(layout);
        Bundle savedBrowser = state == null ? null : state.getBundle("browser");
        if (savedBrowser == null || browser.restoreState(savedBrowser) == null) browser.loadUrl(initialUrl);
        browser.requestFocus();
    }

    private void addButton(LinearLayout toolbar, String label, Runnable action) {
        Button button = new Button(this);
        button.setText(label);
        button.setContentDescription(label + " configuration window");
        button.setOnClickListener(view -> action.run());
        toolbar.addView(button);
    }

    private WebView createBrowser(boolean popup) {
        WebView view = new WebView(this);
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        view.setDownloadListener((url, agent, disposition, mime, length) -> {});
        view.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView target, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                return handleNavigation(request.getUrl().toString(), popup, target);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView target, String url) {
                return handleNavigation(url, popup, target);
            }
            @Override public void onPageStarted(WebView target, String url, android.graphics.Bitmap icon) {
                if (popup && !"about:blank".equals(url)) handleNavigation(url, true, target);
                else if (!popup && ExtensionConfigurationUrl.configuredManifest(url) != null) finishWithResult(url);
            }
            @Override public void onReceivedError(WebView target, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame() && !completed) status.setText("Could not load this page. Choose Reload to retry, or Close and paste the configured manifest URL");
            }
            @Override public void onReceivedHttpError(WebView target, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400 && !completed) status.setText("This page is unavailable. Choose Reload to retry, or Close and paste the configured manifest URL");
            }
            @Override public void onReceivedSslError(WebView target, SslErrorHandler handler, android.net.http.SslError error) {
                handler.cancel();
                if (!completed) status.setText("This page's secure connection failed. Choose Reload or Close");
            }
        });
        view.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onCreateWindow(WebView source, boolean dialog, boolean gesture, Message message) {
                if (completed || popups.size() >= 4) return false;
                WebView child = createBrowser(true);
                popups.add(child);
                WebView.WebViewTransport transport = (WebView.WebViewTransport) message.obj;
                transport.setWebView(child);
                message.sendToTarget();
                return true;
            }
            @Override public void onCloseWindow(WebView target) { releasePopup(target); }
        });
        return view;
    }

    private boolean handleNavigation(String url, boolean popup, WebView target) {
        if (completed) return true;
        String manifest = ExtensionConfigurationUrl.configuredManifest(url);
        if (manifest != null) { finishWithResult(manifest); return true; }
        if (popup && "about:blank".equals(url)) return false;
        if (!ExtensionConfigurationUrl.isWebUrl(url)) {
            status.setText("This link cannot complete configuration. Choose the addon's Install button or paste its manifest URL in Tatakai");
            if (popup) target.post(() -> releasePopup(target));
            return true;
        }
        if (popup) {
            browser.loadUrl(url);
            target.post(() -> releasePopup(target));
            return true;
        }
        return false;
    }

    private void releasePopup(WebView view) {
        if (!popups.remove(view)) return;
        view.stopLoading();
        view.destroy();
    }

    private void navigateBack() {
        if (browser != null && browser.canGoBack()) browser.goBack();
        else finishWithResult(null);
    }

    @Override public void onBackPressed() { navigateBack(); }

    private void finishWithResult(String value) {
        if (completed) return;
        completed = true;
        String manifest = ExtensionConfigurationUrl.configuredManifest(value);
        Intent result = new Intent().putExtra("requestId", requestId);
        if (manifest != null) result.putExtra("manifestUrl", manifest);
        setResult(manifest == null ? RESULT_CANCELED : RESULT_OK, result);
        finish();
    }

    @Override protected void onSaveInstanceState(Bundle state) {
        if (browser != null) { Bundle saved = new Bundle(); browser.saveState(saved); state.putBundle("browser", saved); }
        super.onSaveInstanceState(state);
    }

    @Override protected void onDestroy() {
        for (WebView popup : new ArrayList<>(popups)) releasePopup(popup);
        if (browser != null) { browser.stopLoading(); browser.destroy(); browser = null; }
        super.onDestroy();
    }
}
