package io.github.miguelcoxcaballero.aulasakai;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.graphics.Insets;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Abre el aula virtual Sakai elegida en un WebView e inyecta la misma interfaz que la
 * extensión para navegador (content.js + app.css), con subida de archivos y visor de PDF.
 */
public class MainActivity extends Activity {

    private static final String PREFS = "prefs";
    private static final String KEY_SITE = "site";
    private static final int REQ_FILE = 1;
    /** Dominio especial desde el que WebViewAssetLoader sirve los archivos de la interfaz. */
    private static final String ASSETS_BASE = "https://appassets.androidplatform.net/assets/ext/";

    private static final String[][] KNOWN_SITES = {
            {"PoliformaT", "Universitat Politècnica de València", "https://poliformat.upv.es/portal"},
            {"Aula Virtual", "Universidad de Murcia", "https://aulavirtual.um.es/portal"},
    };

    private WebView web;
    private ProgressBar bar;
    private ValueCallback<Uri[]> fileCallback;
    private String site;
    private String siteOrigin;
    private String injectJs;
    private boolean documentStartScript;
    private WebViewAssetLoader assetLoader;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private Updater updater;

    // ------------------------------------------------------------------ ciclo de vida

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Downloads.cleanOld(this);
        updater = new Updater(this);
        setupBackHandling();

        site = prefs().getString(KEY_SITE, null);
        Uri link = getIntent().getData();
        if (link != null) site = siteFromLink(link);

        if (site == null || wantsChooser(getIntent())) {
            showChooser();
        } else {
            startWeb(state, link);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (wantsChooser(intent)) {
            showChooser();
            return;
        }
        Uri link = intent.getData();
        if (link != null) {
            String s = siteFromLink(link);
            if (web == null || !s.equals(site)) {
                site = s;
                startWeb(null, link);
            } else {
                web.loadUrl(link.toString());
            }
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (web != null) web.saveState(out);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.onResume();
            // Al volver a la app, la interfaz vuelve a leer las favoritas de Sakai.
            web.evaluateJavascript("window.dispatchEvent(new Event('focus'))", null);
        }
        updater.onResume();
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        updater.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        io.shutdownNow();
        if (web != null) web.destroy();
        super.onDestroy();
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private static boolean wantsChooser(Intent i) {
        return i != null && "true".equals(i.getStringExtra("choose"));
    }

    /** Un enlace de https://poliformat.upv.es/... fija el aula a ese sitio. */
    private String siteFromLink(Uri link) {
        String s = link.getScheme() + "://" + link.getHost() + (link.getPort() > 0 ? ":" + link.getPort() : "") + "/portal";
        prefs().edit().putString(KEY_SITE, s).apply();
        return s;
    }

    // ------------------------------------------------------------------ elegir aula

    private int dp(float v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    private void showChooser() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(24), dp(48), dp(24), dp(24));
        box.setBackgroundColor(Color.WHITE);

        TextView title = new TextView(this);
        title.setText("¿Cuál es tu aula virtual?");
        title.setTextSize(24);
        title.setTextColor(0xFF202124);
        title.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
        box.addView(title);

        TextView sub = new TextView(this);
        sub.setText("Podrás cambiarla más tarde manteniendo pulsado el icono de la app.");
        sub.setTextSize(14);
        sub.setTextColor(0xFF5F6368);
        sub.setPadding(0, dp(8), 0, dp(24));
        box.addView(sub);

        for (String[] s : KNOWN_SITES) box.addView(choiceButton(s[0] + "\n" + s[1], () -> chooseSite(s[2])));
        box.addView(choiceButton("Otra aula virtual Sakai…", this::askCustomSite));

        FrameLayout root = new FrameLayout(this);
        root.addView(box, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        applyInsets(root);
        setContentView(root);
        updater.reattach();
    }

    private Button choiceButton(String text, Runnable onClick) {
        Button b = new Button(this, null, android.R.attr.borderlessButtonStyle);
        android.graphics.drawable.GradientDrawable bg = new android.graphics.drawable.GradientDrawable();
        bg.setColor(Color.WHITE);
        bg.setCornerRadius(dp(12));
        bg.setStroke(dp(1), 0xFFDADCE0);
        b.setBackground(new android.graphics.drawable.RippleDrawable(
                android.content.res.ColorStateList.valueOf(0x221A73E8), bg, null));
        b.setTextColor(0xFF202124);
        b.setAllCaps(false);
        b.setText(text);
        b.setTextSize(16);
        b.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        b.setPadding(dp(16), dp(12), dp(16), dp(12));
        b.setOnClickListener(v -> onClick.run());
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(8);
        b.setLayoutParams(lp);
        return b;
    }

    private void askCustomSite() {
        EditText input = new EditText(this);
        input.setHint("https://aula.miuniversidad.es");
        input.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        FrameLayout wrap = new FrameLayout(this);
        wrap.setPadding(dp(20), dp(8), dp(20), 0);
        wrap.addView(input);
        new AlertDialog.Builder(this)
                .setTitle("Dirección del aula virtual")
                .setMessage("Escribe la dirección de tu aula virtual basada en Sakai.")
                .setView(wrap)
                .setPositiveButton("Abrir", (d, w) -> {
                    String t = input.getText().toString().trim();
                    if (t.isEmpty()) return;
                    if (!t.startsWith("http://") && !t.startsWith("https://")) t = "https://" + t;
                    Uri u = Uri.parse(t);
                    if (u.getHost() == null) {
                        Toast.makeText(this, "Dirección no válida", Toast.LENGTH_LONG).show();
                        return;
                    }
                    String base = u.getScheme() + "://" + u.getHost() + (u.getPort() > 0 ? ":" + u.getPort() : "");
                    chooseSite(base + "/portal");
                })
                .setNegativeButton("Cancelar", null)
                .show();
    }

    private void chooseSite(String s) {
        prefs().edit().putString(KEY_SITE, s).apply();
        site = s;
        startWeb(null, null);
    }

    // ------------------------------------------------------------------ WebView

    @SuppressLint("SetJavaScriptEnabled")
    private void startWeb(Bundle state, Uri link) {
        if (web != null) web.destroy();
        Uri s = Uri.parse(site);
        siteOrigin = s.getScheme() + "://" + s.getHost() + (s.getPort() > 0 ? ":" + s.getPort() : "");

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.WHITE);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        root.addView(bar, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3), Gravity.TOP));
        applyInsets(root);
        setContentView(root);
        updater.reattach();

        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setUseWideViewPort(true);
        ws.setLoadWithOverviewMode(true);
        ws.setSupportZoom(false);
        ws.setBuiltInZoomControls(false);
        ws.setDisplayZoomControls(false);
        ws.setSupportMultipleWindows(false); // los enlaces "target=_blank" se abren en la misma vista
        ws.setAllowFileAccess(false);
        ws.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        ws.setMediaPlaybackRequiresUserGesture(true);

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, true); // algunos inicios de sesión (SSO) lo necesitan

        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        injectJs = buildInjectScript();
        documentStartScript = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT);
        if (documentStartScript) {
            WebViewCompat.addDocumentStartJavaScript(web, injectJs, Collections.singleton(siteOrigin));
        }

        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.setDownloadListener(this::onDownload);

        if (state != null && web.restoreState(state) != null) return;
        web.loadUrl(link != null ? link.toString() : site);
    }

    private void applyInsets(View root) {
        if (Build.VERSION.SDK_INT >= 30) {
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                Insets b = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime() | WindowInsets.Type.displayCutout());
                v.setPadding(b.left, b.top, b.right, b.bottom);
                return WindowInsets.CONSUMED;
            });
        } else {
            root.setFitsSystemWindows(true);
        }
    }

    /** Script inyectado al empezar cada página del aula: estilos de arranque + content.js. */
    private String buildInjectScript() {
        String boot = readAsset("ext/boot.css");
        String content = readAsset("ext/content.js");
        return "(function(){if(window.__gcInjected)return;window.__gcInjected=true;window.__gcApp=true;"
                + "try{var s=document.createElement('style');s.textContent=" + JSONObject.quote(boot)
                + ";(document.head||document.documentElement).appendChild(s);}catch(e){}"
                // Vista a tamaño de móvil aunque la página no declare viewport.
                + "function vp(){if(!document.head||document.querySelector('meta[name=viewport]'))return;"
                + "var m=document.createElement('meta');m.name='viewport';m.content='width=device-width, initial-scale=1';document.head.appendChild(m);}"
                + "vp();document.addEventListener('DOMContentLoaded',vp);"
                + "var chrome={runtime:{getURL:function(p){return '" + ASSETS_BASE + "'+p;},onMessage:{addListener:function(){}}}};\n"
                + content + "\n})();";
    }

    private String readAsset(String path) {
        try (InputStream in = getAssets().open(path); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        } catch (IOException e) {
            return "";
        }
    }

    private class Client extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return assetLoader.shouldInterceptRequest(request.getUrl());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
            if (scheme.equals("http") || scheme.equals("https")) return false; // todo dentro de la app (incluido el inicio de sesión)
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, u)); // mailto:, tel:, etc.
            } catch (ActivityNotFoundException ignored) {
                Toast.makeText(MainActivity.this, "No hay ninguna app para abrir este enlace", Toast.LENGTH_SHORT).show();
            }
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            bar.setVisibility(View.VISIBLE);
            // WebView antiguo sin inyección al inicio del documento: se inyecta aquí.
            if (!documentStartScript && url != null && url.startsWith(siteOrigin)) view.evaluateJavascript(injectJs, null);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            bar.setVisibility(View.GONE);
            CookieManager.getInstance().flush();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (!request.isForMainFrame()) return;
            String html = "<html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head>"
                    + "<body style='font-family:sans-serif;color:#3c4043;text-align:center;padding:64px 24px'>"
                    + "<h2 style='font-weight:400;color:#202124'>Sin conexión</h2>"
                    + "<p>No se ha podido abrir el aula virtual. Comprueba tu conexión a internet.</p>"
                    + "<p><a style='display:inline-block;margin-top:16px;padding:10px 24px;border-radius:4px;background:#1a73e8;color:#fff;text-decoration:none' href='"
                    + site + "'>Reintentar</a></p></body></html>";
            view.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
        }
    }

    private class Chrome extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int progress) {
            bar.setProgress(progress);
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            Intent pick = params.createIntent();
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            if (pick.getType() == null || pick.getType().isEmpty()) pick.setType("*/*");
            if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            try {
                startActivityForResult(Intent.createChooser(pick, "Elegir archivo"), REQ_FILE);
                return true;
            } catch (ActivityNotFoundException e) {
                fileCallback = null;
                Toast.makeText(MainActivity.this, "No hay ninguna app para elegir archivos", Toast.LENGTH_LONG).show();
                return false;
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_FILE || fileCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK && data != null) {
            ClipData clip = data.getClipData();
            if (clip != null && clip.getItemCount() > 0) {
                result = new Uri[clip.getItemCount()];
                for (int i = 0; i < clip.getItemCount(); i++) result[i] = clip.getItemAt(i).getUri();
            } else if (data.getData() != null) {
                result = new Uri[]{data.getData()};
            }
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    // ------------------------------------------------------------------ descargas y PDF

    private void onDownload(String url, String userAgent, String disposition, String mime, long length) {
        if (url == null || !(url.startsWith("http://") || url.startsWith("https://"))) {
            Toast.makeText(this, "Este archivo no se puede descargar desde la app", Toast.LENGTH_LONG).show();
            return;
        }
        String name = URLUtil.guessFileName(url, disposition, mime);
        boolean pdf = "application/pdf".equalsIgnoreCase(mime) || name.toLowerCase(Locale.ROOT).endsWith(".pdf");
        if (pdf) {
            startActivity(new Intent(this, PdfActivity.class)
                    .putExtra(PdfActivity.EXTRA_URL, url)
                    .putExtra(PdfActivity.EXTRA_UA, userAgent)
                    .putExtra(PdfActivity.EXTRA_NAME, name.toLowerCase(Locale.ROOT).endsWith(".pdf") ? name : name + ".pdf"));
            return;
        }
        Toast.makeText(this, "Descargando " + name + "…", Toast.LENGTH_SHORT).show();
        io.execute(() -> {
            try {
                File f = Downloads.fetch(this, url, userAgent, name);
                runOnUiThread(() -> Downloads.open(this, f, mime));
            } catch (IOException e) {
                runOnUiThread(() -> Toast.makeText(this, "No se pudo descargar: " + e.getMessage(), Toast.LENGTH_LONG).show());
            }
        });
    }

    // ------------------------------------------------------------------ botón atrás

    private void setupBackHandling() {
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }
    }

    private void handleBack() {
        if (updater.isBlocking()) return;
        if (web == null) {
            finish();
            return;
        }
        web.evaluateJavascript("(window.__gcBack&&window.__gcBack())?1:0", r -> {
            if ("1".equals(r)) return;
            if (web.canGoBack()) web.goBack();
            else finish();
        });
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        handleBack();
    }
}
