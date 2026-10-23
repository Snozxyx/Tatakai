package app.tatakai.compatibility.aniyomi;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

/** Loopback image capabilities only; no extension-execution HTTP endpoint. */
final class AniyomiImageServer implements Closeable {
    interface Fetch { JSONObject image(String source, String key) throws Exception; }
    private final ServerSocket server;
    private final String secret = UUID.randomUUID().toString();
    private final Map<String, String[]> leases = Collections.synchronizedMap(new LinkedHashMap<>());
    private final ExecutorService workers = new ThreadPoolExecutor(4, 4, 30, TimeUnit.SECONDS, new ArrayBlockingQueue<>(24));
    private final File root;
    AniyomiImageServer(File root, Fetch fetch) throws Exception {
        this.root = root.getCanonicalFile(); server = new ServerSocket(0, 32, InetAddress.getByName("127.0.0.1"));
        Thread accept = new Thread(() -> { while (!server.isClosed()) { try { Socket socket = server.accept(); try { workers.execute(() -> serve(socket, fetch)); } catch (RejectedExecutionException error) { socket.close(); } } catch (IOException error) { if (server.isClosed()) return; } } }, "Tatakai original source images"); accept.setDaemon(true); accept.start();
    }
    String grant(String source, String key) { String lease = UUID.randomUUID().toString(); synchronized (leases) { while (leases.size() >= 4096) leases.remove(leases.keySet().iterator().next()); leases.put(lease, new String[]{source, key}); } return "http://127.0.0.1:" + server.getLocalPort() + "/" + secret + "/" + lease; }
    private void serve(Socket socket, Fetch fetch) {
        try (Socket client = socket) {
            client.setSoTimeout(15000); InputStream input = client.getInputStream(); ByteArrayOutputStream request = new ByteArrayOutputStream(); int b;
            while ((b = input.read()) != -1 && b != '\n') { if (request.size() >= 4096) return; request.write(b); }
            int headerBytes = 0, lineBytes = 0; while ((b = input.read()) != -1) { if (++headerBytes > 16384) return; if (b == '\n') { if (lineBytes <= 1) break; lineBytes = 0; } else lineBytes++; }
            String[] start = request.toString("US-ASCII").trim().split(" "); String[] capability = start.length == 3 ? start[1].split("/") : new String[0];
            String[] lease = capability.length == 3 && capability[1].equals(secret) && start[0].equals("GET") ? leases.get(capability[2]) : null;
            if (lease == null) { client.getOutputStream().write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".getBytes(StandardCharsets.US_ASCII)); return; }
            JSONObject resolved = fetch.image(lease[0], lease[1]); File file = new File(resolved.getString("file")).getCanonicalFile();
            if (!file.toPath().startsWith(root.toPath()) || !file.isFile() || file.length() < 1 || file.length() > 32 * 1024 * 1024 || Files.isSymbolicLink(file.toPath())) throw new IOException("Invalid image cache capability");
            byte[] magic = new byte[16]; try (InputStream bytes = new FileInputStream(file)) { bytes.read(magic); }
            String type = (magic[0] & 255) == 255 && (magic[1] & 255) == 216 ? "image/jpeg" : (magic[0] & 255) == 137 && magic[1] == 'P' ? "image/png" : magic[0] == 'G' && magic[1] == 'I' ? "image/gif" : magic[0] == 'R' && magic[8] == 'W' ? "image/webp" : magic[4] == 'f' && magic[8] == 'a' ? "image/avif" : "application/octet-stream";
            OutputStream out = client.getOutputStream(); out.write(("HTTP/1.1 200 OK\r\nContent-Type: " + type + "\r\nContent-Length: " + file.length() + "\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: private, max-age=300\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
            try (InputStream bytes = new FileInputStream(file)) { byte[] block = new byte[32768]; int n; while ((n = bytes.read(block)) != -1) out.write(block, 0, n); }
        } catch (Exception ignored) { /* Closing a failed capability cannot expose an arbitrary resource. */ }
    }
    public void close() throws IOException { server.close(); workers.shutdownNow(); leases.clear(); }
}
