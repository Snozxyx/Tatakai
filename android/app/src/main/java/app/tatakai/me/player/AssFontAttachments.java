package app.tatakai.me.player;

import android.content.Context;
import android.util.Base64;
import com.arthenica.ffmpegkit.FFmpegKit;
import com.arthenica.ffmpegkit.FFprobeKit;
import org.json.*;
import java.io.File;
import java.nio.file.Files;
import java.util.*;
import java.util.function.Consumer;

/** Matroska attachments are extracted from its header, without decoding the movie. */
final class AssFontAttachments {
    static void extract(Context context, String source, Map<String,String> headers, Consumer<List<String>> done) {
        List<String> probe=new ArrayList<>(Arrays.asList("-v","quiet","-show_streams","-of","json"));
        List<String> input=new ArrayList<>();
        if(source.startsWith("http")) {
            input.addAll(Arrays.asList("-rw_timeout","10000000"));
            StringBuilder raw=new StringBuilder();
            for(Map.Entry<String,String> entry:headers.entrySet()) if(!entry.getKey().matches(".*[\r\n].*")&&!entry.getValue().matches(".*[\r\n].*")) raw.append(entry.getKey()).append(": ").append(entry.getValue()).append("\r\n");
            if(raw.length()>0) input.addAll(Arrays.asList("-headers",raw.toString()));
        }
        probe.addAll(input);probe.add(source);
        FFprobeKit.executeWithArgumentsAsync(probe.toArray(new String[0]),session -> {
            try {
                JSONArray streams=new JSONObject(session.getOutput()).optJSONArray("streams");
                if(streams==null){done.accept(Collections.emptyList());return;}
                List<String> args=new ArrayList<>(Arrays.asList("-y"));
                List<File> files=new ArrayList<>();
                for(int i=0;i<streams.length() && files.size()<32;i++) {
                    JSONObject stream=streams.optJSONObject(i);if(stream==null||!"attachment".equals(stream.optString("codec_type")))continue;
                    JSONObject tags=stream.optJSONObject("tags");
                    String filename=tags==null?"":tags.optString("filename").toLowerCase(Locale.US);
                    String codec=stream.optString("codec_name");
                    if(!(filename.endsWith(".ttf") || filename.endsWith(".otf") || filename.endsWith(".woff") || filename.endsWith(".woff2"))&&!"ttf".equals(codec)&&!"otf".equals(codec))continue;
                    File file=new File(context.getCacheDir(),"ass-font-"+UUID.randomUUID()+".font");
                    files.add(file);args.add("-dump_attachment:"+stream.optInt("index"));args.add(file.getPath());
                }
                if(files.isEmpty()){done.accept(Collections.emptyList());return;}
                args.addAll(input);args.addAll(Arrays.asList("-i",source,"-t","0","-map","0:v:0?","-c","copy","-f","null","-"));
                FFmpegKit.executeWithArgumentsAsync(args.toArray(new String[0]),result -> {
                    List<String> fonts=new ArrayList<>();long total=0;
                    for(File file:files)try {
                        long size=file.length();if(size>0&&size<=8*1024*1024 && total+size<=64*1024*1024){total+=size;fonts.add("data:font/ttf;base64,"+Base64.encodeToString(Files.readAllBytes(file.toPath()),Base64.NO_WRAP));}
                    } catch(Exception ignored){} finally{file.delete();}
                    done.accept(fonts);
                });
            }catch(Exception ignored){done.accept(Collections.emptyList());}
        });
    }
}
