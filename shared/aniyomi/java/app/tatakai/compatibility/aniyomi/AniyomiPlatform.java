package app.tatakai.compatibility.aniyomi;

import java.io.File;
import org.json.JSONArray;
import org.json.JSONObject;

/** Only serialized values cross an original runtime's classloader boundary. */
public interface AniyomiPlatform {
    JSONObject verify(File artifact, JSONObject expected) throws Exception;
    JSONArray validate(File artifact, JSONObject expected, File directory) throws Exception;
    String invoke(String method, JSONObject args) throws Exception;
    void reset() throws Exception;
    default void close() throws Exception {}
}
