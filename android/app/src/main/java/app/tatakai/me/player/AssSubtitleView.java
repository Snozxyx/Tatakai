package app.tatakai.me.player;

import android.content.Context;
import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.webkit.*;
import android.view.View;
import android.view.MotionEvent;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/** Trusted local WebView draws libass over the native video surface on phones and TV. */
final class AssSubtitleView extends WebView {
    private static final String BASE="https://appassets.androidplatform.net/assets/libass/";
    private final Handler handler=new Handler(Looper.getMainLooper());
    private boolean ready=false, destroyed=false;
    private String token="", script="";
    private final List<String> packets=new ArrayList<>();
    private final List<String> fonts=new ArrayList<>();
    private ExoPlayer player;
    private PlayerView playerView;
    private String fontSource;
    private java.util.Map<String,String> fontHeaders;
    private boolean fontsRequested;
    void configureFontSource(String source, java.util.Map<String,String> headers) { fontSource=source;fontHeaders=headers; }
    AssSubtitleView(Context context) {
        super(context);
        setBackgroundColor(Color.TRANSPARENT);
        setFocusable(false); setFocusableInTouchMode(false); setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        getSettings().setJavaScriptEnabled(true);
        getSettings().setAllowFileAccess(false); getSettings().setAllowContentAccess(false);
        getSettings().setDomStorageEnabled(false);
        addJavascriptInterface(new Object() {
            @JavascriptInterface public void ready() { handler.post(() -> { if(destroyed)return; ready=true; sendTrack(); handler.post(ticker); }); }
            @JavascriptInterface public void error(String message) { handler.post(() -> { if(!destroyed) android.widget.Toast.makeText(getContext(),"ASS subtitle rendering failed",android.widget.Toast.LENGTH_LONG).show(); }); }
        }, "AssBridge");
        setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String url=request.getUrl().toString();
                if (!url.startsWith(BASE)) return new WebResourceResponse("text/plain","UTF-8",new java.io.ByteArrayInputStream(new byte[0]));
                String name=request.getUrl().getLastPathSegment();
                if(name==null) return null;
                if(name.contains("..") || name.contains("/") || !name.matches("[a-zA-Z0-9._-]+")) return null;
                try {
                    InputStream stream=getContext().getAssets().open("public/assets/libass/"+name);
                    String mime=name.endsWith(".wasm")?"application/wasm":name.endsWith(".js")?"application/javascript":name.endsWith(".woff2")?"font/woff2":"text/html";
                    return new WebResourceResponse(mime, "UTF-8", stream);
                } catch(Exception ignored) { return new WebResourceResponse("text/plain","UTF-8",new java.io.ByteArrayInputStream(new byte[0])); }
            }
        });
        loadUrl(BASE+"native.html");
    }
    @Override public boolean onTouchEvent(MotionEvent event) { return false; }
    void attach(ExoPlayer player, PlayerView view) { this.player=player;playerView=view; }
    void load(String trackToken,String content) { handler.post(() -> { if(destroyed)return; token=trackToken;script=content;packets.clear();sendTrack();if(!fontsRequested&&fontSource!=null&&!fontSource.contains(".m3u8")){fontsRequested=true;AssFontAttachments.extract(getContext(),fontSource,fontHeaders,this::addFonts);} }); }
    void append(String trackToken,String packet) { handler.post(() -> { if(destroyed||!token.equals(trackToken)||packet.isEmpty())return;packets.add(packet);if(ready)evaluateJavascript("TatakaiAss.append("+JSONObject.quote(packet)+")",null); }); }
    void releaseTrack(String trackToken) { handler.post(() -> { if(token.equals(trackToken)){token="";script="";packets.clear();if(ready)evaluateJavascript("TatakaiAss.clear()",null);} }); }
    void addFonts(List<String> values) { handler.post(() -> { if(destroyed)return;fonts.addAll(values);sendTrack(); }); }
    private void sendTrack() {
        if (!ready || script.isEmpty() || destroyed) return;
        evaluateJavascript("TatakaiAss.load("+JSONObject.quote(script)+","+new JSONArray(fonts).toString()+")", null);
        for(String packet:packets)evaluateJavascript("TatakaiAss.append("+JSONObject.quote(packet)+")",null);
    }
    private final Runnable ticker=new Runnable() { public void run() {
        if(destroyed||player==null)return;
        if(ready && !script.isEmpty()) {
            View surface=playerView.getVideoSurfaceView();
            if(surface!=null && surface.getWidth()>0 && surface.getHeight()>0) {
                android.widget.FrameLayout.LayoutParams layout=new android.widget.FrameLayout.LayoutParams(surface.getWidth(),surface.getHeight());
                int[] location=new int[2],origin=new int[2];surface.getLocationInWindow(location);((View)getParent()).getLocationInWindow(origin);
                layout.leftMargin=location[0]-origin[0];layout.topMargin=location[1]-origin[1];
                if(getWidth()!=layout.width||getHeight()!=layout.height||getLeft()!=layout.leftMargin||getTop()!=layout.topMargin)setLayoutParams(layout);
            }
            int width=player.getVideoSize().width, height=player.getVideoSize().height;
            if(width<=0)width=1920;if(height<=0)height=1080;
            evaluateJavascript("TatakaiAss.frame("+(player.getCurrentPosition()/1000.0)+","+width+","+height+","+player.isPlaying()+","+player.getPlaybackParameters().speed+")",null);
        }
        handler.postDelayed(this,50);
    }};
    @Override public void destroy() { destroyed=true;handler.removeCallbacksAndMessages(null);removeJavascriptInterface("AssBridge");stopLoading();super.destroy(); }
}
