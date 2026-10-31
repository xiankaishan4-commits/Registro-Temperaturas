package com.shanfoodsgroup.temperaturas;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;

/** Read-only release checks. No measurement data, credentials or install permissions. */
public final class UpdateBridge {
    private static final String REPO = "https://github.com/xiankaishan4-commits/Registro-Temperaturas/releases/";
    private final Activity activity;
    private final WebView web;
    private final AtomicBoolean busy = new AtomicBoolean();
    UpdateBridge(Activity activity, WebView web) { this.activity = activity; this.web = web; }

    @JavascriptInterface public String getVersionName() { return BuildConfig.VERSION_NAME; }

    @JavascriptInterface public void check(int requestId) {
        if (!busy.compareAndSet(false, true)) return;
        new Thread(() -> {
            HttpURLConnection connection = null;
            JSONObject result;
            try {
                connection = (HttpURLConnection) new URL("https://api.github.com/repos/xiankaishan4-commits/Registro-Temperaturas/releases/latest").openConnection();
                connection.setConnectTimeout(8000);
                connection.setReadTimeout(8000);
                connection.setInstanceFollowRedirects(false);
                connection.setUseCaches(false);
                connection.setRequestProperty("Accept", "application/vnd.github+json");
                connection.setRequestProperty("User-Agent", "Registro-Temperaturas/" + BuildConfig.VERSION_NAME);
                int code = connection.getResponseCode();
                if (code != 200) throw new java.io.IOException("GitHub HTTP " + code);
                try (InputStream in = connection.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                    byte[] buffer = new byte[8192]; int n;
                    long deadline = android.os.SystemClock.elapsedRealtime() + 10000;
                    while ((n = in.read(buffer)) != -1) {
                        if (out.size() + n > 1024 * 1024 || android.os.SystemClock.elapsedRealtime() > deadline)
                            throw new java.io.IOException("Respuesta demasiado grande o lenta");
                        out.write(buffer, 0, n);
                    }
                    result = new JSONObject(out.toString(StandardCharsets.UTF_8.name()));
                }
            } catch (Exception e) {
                result = new JSONObject();
                try { result.put("error", e instanceof java.net.UnknownHostException ? "Sin conexión a Internet" : "Error de conexión o consulta a GitHub"); }
                catch (org.json.JSONException ignored) { }
            } finally {
                if (connection != null) connection.disconnect();
                busy.set(false);
            }
            final String json = result.toString();
            activity.runOnUiThread(() -> {
                if (!activity.isDestroyed()) web.evaluateJavascript("window.RTUpdates && window.RTUpdates.receive(" + requestId + "," + json + ");", null);
            });
        }, "release-check").start();
    }

    @JavascriptInterface public void openRelease(String url) {
        if (url == null || url.matches(".*[\\s\\\\?#].*") ||
            !(url.startsWith(REPO + "tag/") || (url.startsWith(REPO + "download/") && url.endsWith(".apk")))) return;
        activity.runOnUiThread(() -> {
            try { activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
            catch (android.content.ActivityNotFoundException e) {
                android.widget.Toast.makeText(activity, "No hay navegador disponible", android.widget.Toast.LENGTH_LONG).show();
            }
        });
    }
}
