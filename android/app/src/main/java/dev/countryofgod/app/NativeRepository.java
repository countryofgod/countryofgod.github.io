package dev.countryofgod.app;

import android.content.ContentResolver;
import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.Closeable;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InterruptedIOException;
import java.io.OutputStream;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.HttpCookie;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

public final class NativeRepository implements Closeable {
    static final int MAX_IMAGE_BYTES = 5 * 1024 * 1024;
    static final int MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
    private static final int MAX_JSON_BYTES = 128 * 1024;
    private static final int CONNECT_TIMEOUT_MS = 10_000;
    private static final int READ_TIMEOUT_MS = 15_000;
    private static final int TOTAL_TIMEOUT_MS = 45_000;
    private static final String DEVICE_COOKIE = "gc_dev";

    private final Context context;
    private final URI site;
    private final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ORIGINAL_SERVER);
    private final SharedPreferences preferences;
    private final String cookieKey;
    private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(task -> {
        Thread thread = new Thread(task, "native-repository-timeout");
        thread.setDaemon(true);
        return thread;
    });
    private volatile boolean closed;
    private volatile HttpURLConnection active;

    public NativeRepository(Context context) {
        this.context = context.getApplicationContext();
        site = siteAddress(BuildConfig.SITE_URL, BuildConfig.DEBUG);
        preferences = this.context.getSharedPreferences("native_repository", Context.MODE_PRIVATE);
        cookieKey = site.getScheme().toLowerCase(Locale.ROOT) + "://"
                + site.getHost().toLowerCase(Locale.ROOT) + ":" + port(site) + "/device";
        restoreCookie();
    }

    public synchronized String text(String path) throws IOException {
        return new String(bytes(path), StandardCharsets.UTF_8);
    }

    public synchronized byte[] bytes(String path) throws IOException {
        return exchange("GET", path, null, null);
    }

    public synchronized byte[] imageBytes(String path) throws IOException {
        ensureOpen();
        URI target;
        try {
            target = mediaAddress(site, path);
        } catch (IllegalArgumentException exception) {
            throw new IOException("Invalid image URL", exception);
        }
        if (isSameOrigin(site, target)) {
            return bytes(path);
        }
        return exchange("GET", path, null, null, true);
    }

    public synchronized JSONArray array(String path) throws IOException {
        try {
            return new JSONArray(text(path));
        } catch (JSONException exception) {
            throw new IOException("Invalid JSON array", exception);
        }
    }

    public synchronized JSONObject object(String path) throws IOException {
        return request("GET", path, null);
    }

    public synchronized JSONObject request(String method, String path, JSONObject body) throws IOException {
        String verb = method == null ? "" : method.toUpperCase(Locale.ROOT);
        if (!verb.matches("GET|POST|PUT|DELETE|PATCH")) {
            throw new IOException("Unsupported HTTP method");
        }
        if (body != null && "GET".equals(verb)) {
            throw new IOException("GET cannot contain a request body");
        }
        byte[] bytes = body == null ? null : body.toString().getBytes(StandardCharsets.UTF_8);
        if (bytes != null && bytes.length > MAX_JSON_BYTES) {
            throw new IOException("JSON request exceeds size limit");
        }
        RequestBody payload = bytes == null ? null : new RequestBody() {
            public long length() { return bytes.length; }
            public void write(OutputStream output) throws IOException { output.write(bytes); }
        };
        return jsonObject(new String(exchange(verb, path,
                bytes == null ? null : "application/json; charset=UTF-8", payload), StandardCharsets.UTF_8));
    }

    public synchronized JSONObject uploadGuest(String name, String body, Uri image) throws IOException {
        ensureOpen();
        String nickname = name == null ? "" : name;
        String message = body == null ? "" : body;
        if (nickname.trim().length() > 24 || message.trim().length() > 500
                || (message.trim().isEmpty() && image == null)
                || nickname.getBytes(StandardCharsets.UTF_8).length > 8192
                || message.getBytes(StandardCharsets.UTF_8).length > 8192) {
            throw new IOException("Invalid guestbook fields");
        }
        String boundary = "gc-" + UUID.randomUUID();
        File selected = null;
        try {
            String mime = null;
            if (image != null) {
                if (!"content".equalsIgnoreCase(image.getScheme())) {
                    throw new IOException("Image must be a content URI");
                }
                ContentResolver resolver = context.getContentResolver();
                mime = resolver.getType(image);
                String extension = imageExtension(mime);
                selected = File.createTempFile("guest-image-", "." + extension, context.getCacheDir());
                try (InputStream input = resolver.openInputStream(image);
                        OutputStream output = new FileOutputStream(selected)) {
                    if (input == null) {
                        throw new IOException("Cannot open selected image");
                    }
                    copyLimited(input, output, MAX_IMAGE_BYTES);
                }
                if (selected.length() == 0) {
                    throw new IOException("Empty image");
                }
            }
            String head = field(boundary, "name", nickname) + field(boundary, "body", message);
            if (selected != null) {
                head += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"image\"; filename=\"image."
                        + imageExtension(mime) + "\"\r\nContent-Type: " + mime + "\r\n\r\n";
            }
            byte[] prefix = head.getBytes(StandardCharsets.UTF_8);
            byte[] suffix = ((selected == null ? "" : "\r\n") + "--" + boundary + "--\r\n")
                    .getBytes(StandardCharsets.UTF_8);
            File imageFile = selected;
            RequestBody payload = new RequestBody() {
                public long length() {
                    return prefix.length + (imageFile == null ? 0 : imageFile.length()) + suffix.length;
                }

                public void write(OutputStream output) throws IOException {
                    output.write(prefix);
                    if (imageFile != null) {
                        try (InputStream input = new FileInputStream(imageFile)) {
                            copyLimited(input, output, MAX_IMAGE_BYTES);
                        }
                    }
                    output.write(suffix);
                }
            };
            return jsonObject(new String(exchange("POST", "/api/guestbook",
                    "multipart/form-data; boundary=" + boundary, payload), StandardCharsets.UTF_8));
        } catch (SecurityException | IllegalArgumentException exception) {
            throw new IOException("Cannot read selected image", exception);
        } finally {
            if (selected != null && !selected.delete()) {
                selected.deleteOnExit();
            }
        }
    }

    public String absolute(String path) {
        return mediaAddress(site, path).toASCIIString();
    }

    static URI mediaAddress(URI site, String path) {
        if (path == null) {
            throw new IllegalArgumentException("Missing URL");
        }
        return safeAddress(site.resolve(path).toString());
    }

    @Override
    public void close() {
        closed = true;
        HttpURLConnection connection = active;
        if (connection != null) {
            connection.disconnect();
        }
        timer.shutdownNow();
    }

    private byte[] exchange(String method, String path, String contentType, RequestBody body) throws IOException {
        return exchange(method, path, contentType, body, false);
    }

    private byte[] exchange(String method, String path, String contentType, RequestBody body,
            boolean anonymousImage) throws IOException {
        ensureOpen();
        URI target = anonymousImage ? imageAddress(site, path) : sameOrigin(path);
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(TOTAL_TIMEOUT_MS);
        for (int redirects = 0; redirects <= 4; redirects++) {
            ensureOpen();
            long remaining = TimeUnit.NANOSECONDS.toMillis(deadline - System.nanoTime());
            if (remaining <= 0) {
                throw new IOException("Request timed out");
            }
            HttpURLConnection connection = (HttpURLConnection) target.toURL().openConnection();
            active = connection;
            ScheduledFuture<?> timeout = null;
            try {
                ensureOpen();
                timeout = timer.schedule(connection::disconnect, remaining, TimeUnit.MILLISECONDS);
                connection.setConnectTimeout((int) Math.min(CONNECT_TIMEOUT_MS, remaining));
                connection.setReadTimeout((int) Math.min(READ_TIMEOUT_MS, remaining));
                connection.setInstanceFollowRedirects(false);
                connection.setUseCaches(false);
                connection.setRequestMethod(method);
                connection.setRequestProperty("Accept", anonymousImage ? "image/*"
                        : "application/json, text/plain;q=0.9, */*;q=0.1");
                if (anonymousImage) {
                    connection.setAllowUserInteraction(false);
                    connection.setRequestProperty("Cookie", "");
                    connection.setRequestProperty("Cookie2", "");
                    connection.setRequestProperty("Authorization", "");
                    connection.setRequestProperty("Proxy-Authorization", "");
                } else {
                    for (Map.Entry<String, List<String>> header : cookies.get(target, java.util.Collections.emptyMap()).entrySet()) {
                        connection.setRequestProperty(header.getKey(), String.join("; ", header.getValue()));
                    }
                }
                if (body != null) {
                    connection.setDoOutput(true);
                    connection.setRequestProperty("Content-Type", contentType);
                    connection.setFixedLengthStreamingMode(body.length());
                    try (OutputStream output = connection.getOutputStream()) {
                        body.write(output);
                    }
                }
                int status = connection.getResponseCode();
                if (!anonymousImage) {
                    Map<String, List<String>> headers = connection.getHeaderFields();
                    cookies.put(target, headers);
                    persistCookie(headers);
                }
                if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                    String location = connection.getHeaderField("Location");
                    if (!"GET".equals(method) || location == null || redirects == 4) {
                        throw new HttpException(status, "Redirect rejected");
                    }
                    String redirected = target.resolve(location).toString();
                    target = anonymousImage ? imageAddress(site, redirected) : sameOrigin(redirected);
                    continue;
                }
                byte[] response;
                try (InputStream input = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
                        ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                    if (input != null) {
                        copyLimited(input, output, MAX_RESPONSE_BYTES);
                    }
                    response = output.toByteArray();
                }
                if (status < 200 || status >= 300) {
                    throw new HttpException(status, new String(response, StandardCharsets.UTF_8));
                }
                ensureOpen();
                if (System.nanoTime() >= deadline) {
                    throw new IOException("Request timed out");
                }
                return response;
            } catch (IllegalArgumentException | java.util.concurrent.RejectedExecutionException exception) {
                throw new IOException("Request could not be completed", exception);
            } finally {
                if (timeout != null) {
                    timeout.cancel(false);
                }
                connection.disconnect();
                active = null;
            }
        }
        throw new IOException("Too many redirects");
    }

    private URI sameOrigin(String path) throws IOException {
        return requestAddress(site, path);
    }

    static URI requestAddress(URI site, String path) throws IOException {
        try {
            URI target = mediaAddress(site, path);
            if (!isSameOrigin(site, target) || target.getRawFragment() != null) {
                throw new IOException("Request must stay on the configured origin");
            }
            return target;
        } catch (IllegalArgumentException exception) {
            throw new IOException("Invalid request URL", exception);
        }
    }

    static URI imageAddress(URI site, String path) throws IOException {
        try {
            URI target = mediaAddress(site, path);
            if (!"https".equalsIgnoreCase(target.getScheme()) || target.getRawFragment() != null) {
                throw new IOException("External images require HTTPS without fragment");
            }
            return target;
        } catch (IllegalArgumentException exception) {
            throw new IOException("Invalid image URL", exception);
        }
    }

    private static boolean isSameOrigin(URI site, URI target) {
        return site.getScheme().equalsIgnoreCase(target.getScheme())
                && site.getHost().equalsIgnoreCase(target.getHost()) && port(site) == port(target);
    }

    static URI siteAddress(String address, boolean debug) {
        URI target = safeAddress(address);
        if ((!debug && !"https".equalsIgnoreCase(target.getScheme()))
                || target.getRawQuery() != null || target.getRawFragment() != null) {
            throw new IllegalArgumentException("SITE_URL requires HTTPS outside debug and no query or fragment");
        }
        return target;
    }

    private static URI safeAddress(String address) {
        URI target = URI.create(address);
        String scheme = target.getScheme();
        if (address.indexOf('\\') >= 0 || address.chars().anyMatch(character -> character <= 32 || character == 127)
                || !("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))
                || target.getHost() == null || target.getRawUserInfo() != null
                || target.getPort() == 0 || target.getPort() > 65535) {
            throw new IllegalArgumentException("Unsafe HTTP(S) URL");
        }
        return target;
    }

    private static int port(URI address) {
        return address.getPort() < 0 ? ("https".equalsIgnoreCase(address.getScheme()) ? 443 : 80) : address.getPort();
    }

    static void copyLimited(InputStream input, OutputStream output, int limit) throws IOException {
        byte[] buffer = new byte[8192];
        int total = 0;
        while (true) {
            if (Thread.currentThread().isInterrupted()) {
                throw new InterruptedIOException("Stream interrupted");
            }
            int count = input.read(buffer, 0, Math.min(buffer.length, limit - total + 1));
            if (count < 0) {
                return;
            }
            total += count;
            if (total > limit) {
                throw new IOException("Stream exceeds size limit: " + limit);
            }
            output.write(buffer, 0, count);
        }
    }

    private void restoreCookie() {
        String stored = preferences.getString(cookieKey, null);
        if (stored == null) {
            return;
        }
        try {
            JSONObject data = new JSONObject(stored);
            long remaining = data.getLong("expires") - System.currentTimeMillis();
            if (remaining <= 0) {
                preferences.edit().remove(cookieKey).apply();
                return;
            }
            HttpCookie cookie = new HttpCookie(DEVICE_COOKIE, data.getString("value"));
            cookie.setPath(data.getString("path"));
            cookie.setSecure(data.getBoolean("secure"));
            cookie.setHttpOnly(true);
            cookie.setVersion(0);
            cookie.setMaxAge(Math.max(1, remaining / 1000));
            cookies.getCookieStore().add(site, cookie);
        } catch (JSONException | IllegalArgumentException exception) {
            preferences.edit().remove(cookieKey).apply();
        }
    }

    private void persistCookie(Map<String, List<String>> headers) throws IOException {
        boolean changed = false;
        for (Map.Entry<String, List<String>> header : headers.entrySet()) {
            if (!"Set-Cookie".equalsIgnoreCase(header.getKey())
                    && !"Set-Cookie2".equalsIgnoreCase(header.getKey())) {
                continue;
            }
            for (String value : header.getValue()) {
                try {
                    for (HttpCookie cookie : HttpCookie.parse(value)) {
                        changed |= DEVICE_COOKIE.equals(cookie.getName());
                    }
                } catch (IllegalArgumentException ignored) {
                    continue;
                }
            }
        }
        if (!changed) {
            return;
        }
        HttpCookie device = null;
        for (HttpCookie cookie : cookies.getCookieStore().get(site)) {
            if (DEVICE_COOKIE.equals(cookie.getName()) && !cookie.hasExpired()) {
                device = cookie;
                break;
            }
        }
        SharedPreferences.Editor editor = preferences.edit();
        if (device == null || device.getMaxAge() < 0) {
            editor.remove(cookieKey);
        } else {
            try {
                long expires = System.currentTimeMillis() + device.getMaxAge() * 1000;
                JSONObject data = new JSONObject();
                data.put("value", device.getValue());
                data.put("path", device.getPath() == null ? "/" : device.getPath());
                data.put("secure", device.getSecure());
                data.put("expires", expires);
                editor.putString(cookieKey, data.toString());
            } catch (JSONException exception) {
                throw new IOException("Cannot persist device cookie", exception);
            }
        }
        if (!editor.commit()) {
            throw new IOException("Cannot persist device cookie");
        }
    }

    private void ensureOpen() throws IOException {
        if (closed) {
            throw new IOException("Repository is closed");
        }
    }

    private static String field(String boundary, String name, String value) {
        return "--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + name + "\"\r\n\r\n" + value + "\r\n";
    }

    private static String imageExtension(String mime) throws IOException {
        if ("image/png".equals(mime)) return "png";
        if ("image/jpeg".equals(mime)) return "jpg";
        if ("image/gif".equals(mime)) return "gif";
        if ("image/webp".equals(mime)) return "webp";
        throw new IOException("Unsupported image MIME type");
    }

    private static JSONObject jsonObject(String response) throws IOException {
        if ("null".equals(response.trim())) {
            return null;
        }
        try {
            return new JSONObject(response);
        } catch (JSONException exception) {
            throw new IOException("Invalid JSON object", exception);
        }
    }

    private interface RequestBody {
        long length();
        void write(OutputStream output) throws IOException;
    }

    public static final class HttpException extends IOException {
        public final int statusCode;
        public final String responseBody;

        private HttpException(int statusCode, String responseBody) {
            super(errorMessage(statusCode, responseBody));
            this.statusCode = statusCode;
            this.responseBody = responseBody;
        }

        private static String errorMessage(int statusCode, String responseBody) {
            if (responseBody != null) {
                try {
                    Object error = new JSONObject(responseBody).opt("error");
                    if (error instanceof String && !((String) error).trim().isEmpty()) {
                        return (String) error;
                    }
                } catch (JSONException ignored) {
                    return "HTTP " + statusCode;
                }
            }
            return "HTTP " + statusCode;
        }
    }
}
