package io.github.miguelcoxcaballero.aulasakai;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * Actualizaciones obligatorias dentro de la app (mismo sistema que Inhouse Notes):
 * se lee android-update.json del repositorio; si hay una versión más nueva, una pantalla
 * que no se puede cerrar pide instalarla. El APK se descarga dentro de la app y se abre
 * el instalador de Android.
 */
final class Updater {

    static final String MANIFEST_URL =
            "https://raw.githubusercontent.com/miguelcoxcaballero/sakai-nueva-interfaz/main/android-update.json";
    private static final List<String> ALLOWED_HOSTS =
            Arrays.asList("github.com", "raw.githubusercontent.com", "objects.githubusercontent.com");
    private static final long PERIOD_MS = 15 * 60 * 1000L;
    private static final String TAG = "AulaSakaiUpdate";

    private final Activity activity;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable periodic = this::checkAndReschedule;
    private volatile boolean checking;
    private volatile boolean downloading;
    private String apkUrl;
    private FrameLayout gate;
    private TextView status;
    private Button button;

    Updater(Activity activity) {
        this.activity = activity;
    }

    /** Al volver a la app (equivale al "focus" de la web): comprobar y programar cada 15 min. */
    void onResume() {
        main.removeCallbacks(periodic);
        checkAndReschedule();
    }

    void onPause() {
        main.removeCallbacks(periodic);
    }

    boolean isBlocking() {
        return gate != null;
    }

    /** Tras un setContentView la pantalla de actualización se vuelve a poner encima. */
    void reattach() {
        if (gate != null && gate.getParent() == null) {
            ViewGroup content = activity.findViewById(android.R.id.content);
            content.addView(gate, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        }
    }

    private void checkAndReschedule() {
        check();
        main.postDelayed(periodic, PERIOD_MS);
    }

    private String installedVersion() {
        try {
            String v = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionName;
            return v == null ? "0.0.0" : v;
        } catch (Exception e) {
            return "0.0.0";
        }
    }

    static int compareVersions(String a, String b) {
        String[] x = String.valueOf(a).split("\\."), y = String.valueOf(b).split("\\.");
        for (int i = 0; i < Math.max(x.length, y.length); i++) {
            int p = i < x.length ? parse(x[i]) : 0, q = i < y.length ? parse(y[i]) : 0;
            if (p != q) return p - q;
        }
        return 0;
    }

    private static int parse(String s) {
        try {
            return Integer.parseInt(s.replaceAll("[^0-9]", ""));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private void check() {
        if (checking || downloading) return;
        checking = true;
        new Thread(() -> {
            HttpURLConnection con = null;
            try {
                con = (HttpURLConnection) new URL(MANIFEST_URL + "?check=" + System.currentTimeMillis()).openConnection();
                con.setUseCaches(false);
                con.setRequestProperty("Cache-Control", "no-cache");
                con.setConnectTimeout(15000);
                con.setReadTimeout(15000);
                if (con.getResponseCode() != 200) throw new Exception("Update check failed (" + con.getResponseCode() + ")");
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                try (InputStream in = con.getInputStream()) {
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                }
                JSONObject m = new JSONObject(out.toString(StandardCharsets.UTF_8.name()));
                String version = m.optString("version");
                if (!version.matches("\\d+\\.\\d+\\.\\d+")) throw new Exception("Invalid update version");
                Uri url = Uri.parse(m.optString("apkUrl"));
                if (!"https".equalsIgnoreCase(url.getScheme()) || !ALLOWED_HOSTS.contains(String.valueOf(url.getHost()).toLowerCase(Locale.ROOT))) {
                    throw new Exception("Invalid update download URL");
                }
                String installed = installedVersion();
                boolean required = m.optBoolean("required", true);
                main.post(() -> {
                    if (required && compareVersions(version, installed) > 0) {
                        apkUrl = url.toString();
                        showGate(version, installed);
                    } else {
                        closeGate();
                    }
                });
            } catch (Exception e) {
                Log.w(TAG, "Android update check failed: " + e.getMessage());
            } finally {
                checking = false;
                if (con != null) con.disconnect();
            }
        }, "AulaSakaiUpdateCheck").start();
    }

    // ------------------------------------------------------------------ pantalla obligatoria

    private int dp(float v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, activity.getResources().getDisplayMetrics());
    }

    private void showGate(String version, String installed) {
        String text = "Tienes Aula Sakai " + installed + ". Instala la versión " + version + " para continuar.";
        if (gate != null) {
            ((TextView) gate.findViewWithTag("msg")).setText(text);
            return;
        }
        ViewGroup content = activity.findViewById(android.R.id.content);
        gate = new FrameLayout(activity);
        gate.setBackgroundColor(0xF00A0A0C);
        gate.setClickable(true); // bloquea la app que hay debajo
        gate.setFocusable(true);

        LinearLayout card = new LinearLayout(activity);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER_HORIZONTAL);
        card.setPadding(dp(28), dp(28), dp(28), dp(24));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.WHITE);
        bg.setCornerRadius(dp(24));
        card.setBackground(bg);

        TextView ico = new TextView(activity);
        ico.setText("↻");
        ico.setTextSize(40);
        ico.setTextColor(0xFF1A73E8);
        ico.setGravity(Gravity.CENTER);
        card.addView(ico);

        TextView title = new TextView(activity);
        title.setText("Actualización obligatoria");
        title.setTextSize(22);
        title.setTextColor(0xFF1F1F1F);
        title.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, dp(8), 0, dp(8));
        card.addView(title);

        TextView msg = new TextView(activity);
        msg.setTag("msg");
        msg.setText(text);
        msg.setTextSize(15);
        msg.setTextColor(0xFF444746);
        msg.setGravity(Gravity.CENTER);
        card.addView(msg);

        button = new Button(activity, null, android.R.attr.borderlessButtonStyle);
        button.setAllCaps(false);
        button.setText("Instalar actualización");
        button.setTextColor(Color.WHITE);
        button.setTextSize(15);
        GradientDrawable bb = new GradientDrawable();
        bb.setColor(0xFF1A73E8);
        bb.setCornerRadius(dp(24));
        button.setBackground(bb);
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48));
        blp.topMargin = dp(24);
        card.addView(button, blp);
        button.setOnClickListener(v -> install());

        status = new TextView(activity);
        status.setTextSize(13);
        status.setTextColor(0xFF5F6368);
        status.setGravity(Gravity.CENTER);
        status.setPadding(0, dp(12), 0, 0);
        card.addView(status);

        FrameLayout.LayoutParams clp = new FrameLayout.LayoutParams(
                Math.min(dp(420), activity.getResources().getDisplayMetrics().widthPixels - dp(40)),
                ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER);
        gate.addView(card, clp);
        content.addView(gate, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        gate.requestFocus();
    }

    private void closeGate() {
        if (gate == null || downloading) return;
        ((ViewGroup) gate.getParent()).removeView(gate);
        gate = null;
    }

    private void setState(String text, String label, boolean enabled) {
        if (status != null) status.setText(text);
        if (button != null) {
            if (label != null) button.setText(label);
            button.setEnabled(enabled);
            button.setAlpha(enabled ? 1f : .6f);
        }
    }

    // ------------------------------------------------------------------ descarga e instalación

    private void install() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !activity.getPackageManager().canRequestPackageInstalls()) {
            setState("Activa “Permitir desde esta fuente”, vuelve a Aula Sakai y pulsa Continuar.", "Continuar instalación", true);
            try {
                activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + activity.getPackageName())));
            } catch (ActivityNotFoundException ignored) {
                // sin pantalla de ajustes: el usuario lo activa a mano
            }
            return;
        }
        if (downloading) {
            setState("Descargando la actualización dentro de Aula Sakai…", null, false);
            return;
        }
        downloading = true;
        setState("Preparando la actualización…", null, false);
        final String url = apkUrl;
        new Thread(() -> {
            HttpURLConnection con = null;
            try {
                con = (HttpURLConnection) new URL(url).openConnection();
                con.setInstanceFollowRedirects(true);
                con.setConnectTimeout(15000);
                con.setReadTimeout(45000);
                con.setRequestProperty("Accept", "application/vnd.android.package-archive");
                int code = con.getResponseCode();
                if (code < 200 || code >= 300) throw new Exception("Update download failed (" + code + ")");
                File dir = new File(activity.getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("Could not prepare update storage");
                File apk = new File(dir, "aula-sakai-update.apk");
                long total = con.getContentLengthLong(), done = 0;
                int lastPct = -1;
                try (InputStream in = new BufferedInputStream(con.getInputStream());
                     FileOutputStream out = new FileOutputStream(apk)) {
                    byte[] buf = new byte[32768];
                    int n;
                    while ((n = in.read(buf)) != -1) {
                        out.write(buf, 0, n);
                        done += n;
                        int pct = total > 0 ? (int) (done * 100 / total) : -1;
                        if (pct != lastPct) {
                            lastPct = pct;
                            String t = "Descargando la actualización dentro de Aula Sakai…" + (pct >= 0 ? " " + pct + " %" : "");
                            main.post(() -> setState(t, null, false));
                        }
                    }
                }
                if (done < 50000) throw new Exception("Downloaded update is incomplete");
                Uri uri = Downloads.uriFor(activity, apk);
                main.post(() -> {
                    setState("Descarga terminada. Confirma la instalación en Android.", null, false);
                    Intent i = new Intent(Intent.ACTION_VIEW)
                            .setDataAndType(uri, "application/vnd.android.package-archive")
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                    activity.startActivity(i);
                });
            } catch (Exception e) {
                Log.w(TAG, "Update download failed", e);
                main.post(() -> setState("No se pudo descargar la actualización. Inténtalo de nuevo.", "Reintentar", true));
            } finally {
                downloading = false;
                if (con != null) con.disconnect();
            }
        }, "AulaSakaiUpdate").start();
    }
}
