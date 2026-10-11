package app.tatakai.me.proxy;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.Collections;

/** Replay provider headers and ranges on every redirect, including cross-host CDN redirects. */
public final class MediaHttp {
    private MediaHttp() {}
    public static HttpURLConnection follow(HttpURLConnection connection) throws IOException {
        return follow(connection, Collections.emptyMap());
    }
    public static HttpURLConnection follow(HttpURLConnection connection, Map<String, String> providerHeaders) throws IOException {
        Map<String, List<String>> headers = new HashMap<>(connection.getRequestProperties());
        // Some implementations hide Authorization from getRequestProperties.
        for (Map.Entry<String, String> header : providerHeaders.entrySet())
            if (!header.getKey().equalsIgnoreCase("Range")) headers.put(header.getKey(), Collections.singletonList(header.getValue()));
        String method = connection.getRequestMethod();
        int connectTimeout = connection.getConnectTimeout(), readTimeout = connection.getReadTimeout();
        try {
            for (int hop = 0; hop <= 5; hop++) {
                connection.setInstanceFollowRedirects(false);
                int code = connection.getResponseCode();
                if (code != 301 && code != 302 && code != 303 && code != 307 && code != 308) return connection;
                String location = connection.getHeaderField("Location");
                if (location == null || hop == 5) throw new IOException("Invalid or excessive media redirects");
                URL target = new URL(connection.getURL(), location);
                if (!target.getProtocol().equals("http") && !target.getProtocol().equals("https")) throw new IOException("Unsupported media redirect");
                connection.disconnect(); connection = (HttpURLConnection) target.openConnection();
                connection.setConnectTimeout(connectTimeout); connection.setReadTimeout(readTimeout); connection.setRequestMethod(method);
                for (Map.Entry<String, List<String>> header : headers.entrySet()) {
                    if (header.getKey().equalsIgnoreCase("Host")) continue;
                    for (String value : header.getValue()) connection.addRequestProperty(header.getKey(), value);
                }
            }
            throw new IOException("Excessive media redirects");
        } catch (IOException error) { connection.disconnect(); throw error; }
    }
}
