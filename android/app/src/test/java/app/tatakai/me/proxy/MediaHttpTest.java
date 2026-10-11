package app.tatakai.me.proxy;

import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;
import org.junit.Test;
import static org.junit.Assert.*;

public final class MediaHttpTest {
    private static final class Server implements AutoCloseable {
        final ServerSocket socket = new ServerSocket(0, 5, InetAddress.getByName("127.0.0.1"));
        Function<Map<String, String>, String> handler;
        Server() throws IOException {
            Thread thread = new Thread(() -> {
                while (!socket.isClosed()) {
                    try (Socket client = socket.accept()) {
                        client.setSoTimeout(3000);
                        BufferedReader input = new BufferedReader(new InputStreamReader(client.getInputStream(), StandardCharsets.US_ASCII));
                        Map<String, String> request = new HashMap<>(); request.put("request", input.readLine());
                        String line;
                        while ((line = input.readLine()) != null && !line.isEmpty()) {
                            int colon = line.indexOf(':'); if (colon > 0) request.put(line.substring(0, colon).toLowerCase(Locale.US), line.substring(colon + 1).trim());
                        }
                        client.getOutputStream().write(handler.apply(request).getBytes(StandardCharsets.US_ASCII));
                    } catch (IOException ignored) {}
                }
            });
            thread.setDaemon(true); thread.start();
        }
        HttpURLConnection entry() throws IOException {
            HttpURLConnection conn = (HttpURLConnection) new URL("http://127.0.0.1:" + socket.getLocalPort() + "/entry").openConnection();
            conn.setConnectTimeout(3000); conn.setReadTimeout(3000); return conn;
        }
        public void close() throws IOException { socket.close(); }
    }
    @Test public void preservesProviderHeadersAndRangesAcrossHostRedirects() throws Exception {
        AtomicReference<String> received = new AtomicReference<>();
        try (Server server = new Server()) {
            server.handler = request -> {
                if (request.get("request").contains("/entry")) return "HTTP/1.1 302 Found\r\nLocation: http://localhost:" + server.socket.getLocalPort() + "/media\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                received.set(request.get("authorization") + "|" + request.get("referer") + "|" + request.get("range"));
                return "HTTP/1.1 206 Partial Content\r\nContent-Range: bytes 10-12/100\r\nContent-Length: 3\r\nConnection: close\r\n\r\nabc";
            };
            Map<String, String> headers = new HashMap<>(); headers.put("Authorization", "Bearer provider-token"); headers.put("Referer", "https://provider.example");
            HttpURLConnection conn = server.entry();
            for (Map.Entry<String, String> header : headers.entrySet()) conn.setRequestProperty(header.getKey(), header.getValue());
            conn.setRequestProperty("Range", "bytes=10-12"); conn = MediaHttp.follow(conn, headers);
            assertEquals(206, conn.getResponseCode()); assertEquals("bytes 10-12/100", conn.getHeaderField("Content-Range"));
            assertEquals("Bearer provider-token|https://provider.example|bytes=10-12", received.get());
            assertEquals("/media", conn.getURL().getPath()); conn.getInputStream().close(); conn.disconnect();
        }
    }
    @Test public void rejectsNonHttpRedirects() throws Exception {
        try (Server server = new Server()) {
            server.handler = request -> "HTTP/1.1 302 Found\r\nLocation: file:///private/media\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
            HttpURLConnection conn = server.entry(); assertThrows(IOException.class, () -> MediaHttp.follow(conn));
        }
    }
}
