package app.tatakai.me.player;

import androidx.annotation.Nullable;
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.text.Cue;
import androidx.media3.decoder.SimpleDecoder;
import androidx.media3.extractor.text.*;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

/** Media3 demuxes and times the packets; libass renders their complete scripts. */
final class AssSubtitleDecoder extends SimpleDecoder<SubtitleInputBuffer, SubtitleOutputBuffer, SubtitleDecoderException> implements SubtitleDecoder {
    private final AssSubtitleView view;
    private final String token = UUID.randomUUID().toString();
    private final String header;
    private final String format;
    private boolean started;
    private static final Subtitle EMPTY = new Subtitle() {
        public int getNextEventTimeIndex(long timeUs) { return -1; }
        public int getEventTimeCount() { return 0; }
        public long getEventTime(int index) { throw new IndexOutOfBoundsException(); }
        public List<Cue> getCues(long timeUs) { return Collections.emptyList(); }
    };
    AssSubtitleDecoder(Format track, AssSubtitleView view) {
        super(new SubtitleInputBuffer[2], new SubtitleOutputBuffer[2]);
        this.view = view;
        String script = "", fields = "Format: Start, End, ReadOrder, Layer, Style, Name, MarginL, MarginR, MarginV, Effect, Text";
        for (byte[] bytes : track.initializationData) {
            String value = new String(bytes, StandardCharsets.UTF_8);
            if (value.trim().startsWith("Format:")) fields=value.trim(); else script += value + "\n";
        }
        format=fields;
        header=script + (script.contains("[Events]") ? "\n" : "\n[Events]\n") + format + "\n";
        setInitialInputBufferSize(4096);
    }
    public String getName() { return "TatakaiLibass"; }
    public void setPositionUs(long positionUs) { }
    protected SubtitleInputBuffer createInputBuffer() { return new SubtitleInputBuffer(); }
    protected SubtitleOutputBuffer createOutputBuffer() { return new SubtitleOutputBuffer() {
        public void release() { releaseOutputBuffer(this); }
    }; }
    protected SubtitleDecoderException createUnexpectedDecodeException(Throwable error) { return new SubtitleDecoderException("ASS decode failed",error); }
    @Nullable protected SubtitleDecoderException decode(SubtitleInputBuffer input, SubtitleOutputBuffer output, boolean reset) {
        ByteBuffer buffer=input.data;
        if (buffer == null) return null;
        ByteBuffer copy=buffer.duplicate(); copy.position(0);
        byte[] bytes=new byte[copy.limit()]; copy.get(bytes);
        String text=new String(bytes, StandardCharsets.UTF_8);
        if (text.contains("[Script Info]") || text.contains("[V4+ Styles]") || text.contains("[V4 Styles]")) view.load(token,text);
        else {
            if (reset || !started) { view.load(token,header); started=true; }
            long offset = input.subsampleOffsetUs == Long.MAX_VALUE ? input.timeUs : input.subsampleOffsetUs;
            view.append(token,AssPacket.shift(text,format,offset));
        }
        output.setContent(input.timeUs,EMPTY,input.subsampleOffsetUs);
        output.shouldBeSkipped=false;
        return null;
    }
    @Override public void release() { super.release(); view.releaseTrack(token); }
}
