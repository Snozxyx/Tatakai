package app.tatakai.compatibility;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.*;
import java.lang.reflect.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.jar.JarFile;

/** Tatakai-owned, fixed-operation local bridge around the unmodified pinned host. */
public final class SuwayomiBootstrap {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final PrintStream PROTOCOL = new PrintStream(new FileOutputStream(FileDescriptor.out), true, StandardCharsets.UTF_8);
    private static final ExecutorService CALLS = new ThreadPoolExecutor(2, 2, 0, TimeUnit.SECONDS, new ArrayBlockingQueue<>(16));
    public static void main(String[] args) throws Exception {
        System.setOut(System.err);
        if (args.length != 1) throw new IllegalArgumentException("Expected pinned host JAR");
        final String main;
        try (JarFile jar = new JarFile(args[0])) { main = jar.getManifest().getMainAttributes().getValue("Main-Class"); }
        Thread server = new Thread(() -> {
            try { Class.forName(main).getMethod("main", String[].class).invoke(null, (Object)new String[0]); }
            catch (Throwable error) { System.err.println("Compatibility host stopped: " + error.getClass().getSimpleName()); System.exit(1); }
        }, "tatakai-original-host");
        server.start();
        try (BufferedReader input = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8))) {
            for (String line; (line = input.readLine()) != null;) {
                if (line.length() > 524288) break;
                final Map<?, ?> request = JSON.readValue(line, Map.class);
                try { CALLS.execute(() -> respond(request)); }
                catch (RejectedExecutionException error) { send(request.get("id"), null, "Compatibility command queue is full"); }
            }
        }
        CALLS.shutdownNow(); System.exit(0);
    }
    private static void respond(Map<?, ?> request) {
        try {
            if (!"cookies".equals(request.get("method"))) throw new IllegalArgumentException("Unsupported compatibility command");
            Map<?, ?> params = (Map<?, ?>)request.get("params");
            URI uri = URI.create((String)params.get("url"));
            if (!List.of("http", "https").contains(uri.getScheme()) || uri.getUserInfo() != null) throw new IllegalArgumentException("Invalid source URL");
            Object scope = Class.forName("uy.kohesive.injekt.InjektKt").getMethod("getInjekt").invoke(null);
            Class<?> helperClass = Class.forName("eu.kanade.tachiyomi.network.NetworkHelper");
            Object helper = scope.getClass().getMethod("getInstance", Type.class).invoke(scope, helperClass);
            Object store = helperClass.getMethod("getCookieStore").invoke(helper);
            Method add = store.getClass().getMethod("add", URI.class, HttpCookie.class);
            List<?> cookies = (List<?>)params.get("cookies");
            if (cookies.size() > 200) throw new IllegalArgumentException("Too many source cookies");
            if (Boolean.TRUE.equals(params.get("replace"))) store.getClass().getMethod("remove", URI.class).invoke(store, uri);
            for (Object item : cookies) {
                Map<?, ?> value = (Map<?, ?>)item;
                String domain = (String)value.get("domain");
                String plain = domain == null ? uri.getHost() : domain.replaceFirst("^\\.", "");
                if (!uri.getHost().equalsIgnoreCase(plain) && !uri.getHost().toLowerCase(Locale.ROOT).endsWith("." + plain.toLowerCase(Locale.ROOT))) throw new IllegalArgumentException("Cookie does not belong to source");
                HttpCookie cookie = new HttpCookie((String)value.get("name"), (String)value.get("value"));
                cookie.setDomain(domain == null ? uri.getHost() : domain);
                cookie.setPath(value.get("path") instanceof String ? (String)value.get("path") : "/");
                cookie.setSecure(Boolean.TRUE.equals(value.get("secure")));
                cookie.setHttpOnly(Boolean.TRUE.equals(value.get("httpOnly")));
                if (value.get("expirationDate") instanceof Number expiry && expiry.longValue() > 0) cookie.setMaxAge(Math.max(0, expiry.longValue() - System.currentTimeMillis() / 1000));
                add.invoke(store, uri, cookie);
            }
            if (params.get("userAgent") instanceof String agent && !agent.isBlank() && agent.length() <= 1000 && !agent.contains("\n") && !agent.contains("\r")) {
                Field field = helperClass.getDeclaredField("userAgent"); field.setAccessible(true);
                Class.forName("kotlinx.coroutines.flow.MutableStateFlow").getMethod("setValue", Object.class).invoke(field.get(helper), agent);
            }
            send(request.get("id"), Map.of("cookies", cookies.size()), null);
        } catch (Throwable error) { send(request.get("id"), null, "Source sign-in could not be applied to the local runtime"); }
    }
    private static synchronized void send(Object id, Object result, String error) {
        try {
            Map<String, Object> reply = new LinkedHashMap<>(); reply.put("id", id);
            if (error == null) reply.put("result", result); else reply.put("error", error);
            PROTOCOL.println(JSON.writeValueAsString(reply));
        } catch (Exception ignored) { }
    }
}
