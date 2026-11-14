package app.tatakai.me.player;

import android.content.Context;
import android.os.Looper;
import androidx.media3.common.Format;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.Renderer;
import androidx.media3.exoplayer.text.*;
import androidx.media3.extractor.text.SubtitleDecoder;
import java.util.ArrayList;

final class AssRenderersFactory extends DefaultRenderersFactory {
    private final AssSubtitleView view;
    AssRenderersFactory(Context context,AssSubtitleView view) { super(context);this.view=view; }
    @Override protected void buildTextRenderers(Context context, TextOutput output, Looper looper, int extensionRendererMode, ArrayList<Renderer> renderers) {
        TextRenderer renderer=new TextRenderer(output,looper,new SubtitleDecoderFactory() {
            public boolean supportsFormat(Format format) { return "text/x-ssa".equals(format.sampleMimeType) || SubtitleDecoderFactory.DEFAULT.supportsFormat(format); }
            public SubtitleDecoder createDecoder(Format format) { return "text/x-ssa".equals(format.sampleMimeType) ? new AssSubtitleDecoder(format,view) : SubtitleDecoderFactory.DEFAULT.createDecoder(format); }
        });
        renderer.experimentalSetLegacyDecodingEnabled(true);
        renderers.add(renderer);
    }
}
