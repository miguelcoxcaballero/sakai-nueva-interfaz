package io.github.miguelcoxcaballero.aulasakai;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Insets;
import android.graphics.pdf.PdfRenderer;
import android.os.Build;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.text.TextUtils;
import android.util.LruCache;
import android.util.TypedValue;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.widget.AbsListView;
import android.widget.BaseAdapter;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.io.File;
import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Visor de PDF dentro de la app: descarga el archivo con la sesión y lo muestra página a página. */
public class PdfActivity extends Activity {

    static final String EXTRA_URL = "url";
    static final String EXTRA_UA = "ua";
    static final String EXTRA_NAME = "name";

    private static final float MAX_ZOOM = 3f;
    private static final int MAX_RENDER_WIDTH = 1800; // límite de memoria por página

    private final ExecutorService downloader = Executors.newSingleThreadExecutor();
    private final ExecutorService renderer = Executors.newSingleThreadExecutor();
    private PdfRenderer pdf;
    private ParcelFileDescriptor fd;
    private File file;
    private float[] ratios; // alto / ancho de cada página
    private float zoom = 1f;
    private int baseWidth;

    private ListView list;
    private HorizontalScrollView hscroll;
    private ProgressBar spinner;
    private TextView message;
    private Adapter adapter;
    private LruCache<Integer, Bitmap> cache;
    private ScaleGestureDetector scaleDetector;
    private GestureDetector tapDetector;
    private float pinch = 1f;

    private int dp(float v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        String url = getIntent().getStringExtra(EXTRA_URL);
        String ua = getIntent().getStringExtra(EXTRA_UA);
        String name = getIntent().getStringExtra(EXTRA_NAME);

        int maxKb = (int) (Runtime.getRuntime().maxMemory() / 1024);
        cache = new LruCache<Integer, Bitmap>(maxKb / 4) {
            @Override
            protected int sizeOf(Integer key, Bitmap b) {
                return b.getByteCount() / 1024;
            }
        };

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);

        // Barra superior: ← título · Abrir con · Compartir
        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(dp(4), 0, dp(4), 0);
        Button back = flatButton("←");
        back.setTextSize(22);
        back.setOnClickListener(v -> finish());
        TextView title = new TextView(this);
        title.setText(name);
        title.setTextSize(16);
        title.setTextColor(0xFF202124);
        title.setSingleLine(true);
        title.setEllipsize(TextUtils.TruncateAt.MIDDLE);
        Button openWith = flatButton("Abrir con");
        openWith.setOnClickListener(v -> { if (file != null) Downloads.open(this, file, "application/pdf"); });
        Button share = flatButton("Compartir");
        share.setOnClickListener(v -> { if (file != null) Downloads.share(this, file, "application/pdf"); });
        top.addView(back);
        top.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        top.addView(openWith);
        top.addView(share);
        root.addView(top, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56)));

        FrameLayout body = new FrameLayout(this);
        body.setBackgroundColor(0xFFE8EAED);
        hscroll = new HorizontalScrollView(this);
        hscroll.setFillViewport(true);
        list = new ListView(this);
        list.setDivider(null);
        list.setDividerHeight(0);
        list.setSelector(android.R.color.transparent);
        list.setPadding(0, dp(8), 0, dp(8));
        list.setClipToPadding(false);
        hscroll.addView(list, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        body.addView(hscroll);
        spinner = new ProgressBar(this);
        body.addView(spinner, new FrameLayout.LayoutParams(dp(48), dp(48), Gravity.CENTER));
        message = new TextView(this);
        message.setGravity(Gravity.CENTER);
        message.setPadding(dp(24), 0, dp(24), 0);
        message.setVisibility(View.GONE);
        body.addView(message, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
        root.addView(body, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        if (Build.VERSION.SDK_INT >= 30) {
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                Insets b = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                v.setPadding(b.left, b.top, b.right, b.bottom);
                return WindowInsets.CONSUMED;
            });
        } else {
            root.setFitsSystemWindows(true);
        }
        setContentView(root);

        setupGestures();

        downloader.execute(() -> {
            try {
                File f = Downloads.fetch(this, url, ua, name);
                runOnUiThread(() -> show(f));
            } catch (IOException e) {
                runOnUiThread(() -> fail("No se pudo descargar el PDF: " + e.getMessage()));
            }
        });
    }

    private Button flatButton(String text) {
        Button b = new Button(this, null, android.R.attr.borderlessButtonStyle);
        b.setAllCaps(false);
        b.setText(text);
        b.setTextColor(0xFF1A73E8);
        return b;
    }

    private void fail(String text) {
        spinner.setVisibility(View.GONE);
        message.setText(text);
        message.setVisibility(View.VISIBLE);
    }

    private void show(File f) {
        file = f;
        try {
            fd = ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
            pdf = new PdfRenderer(fd);
            int n = pdf.getPageCount();
            ratios = new float[n];
            for (int i = 0; i < n; i++) {
                try (PdfRenderer.Page p = pdf.openPage(i)) {
                    ratios[i] = p.getHeight() / (float) Math.max(1, p.getWidth());
                }
            }
        } catch (IOException | SecurityException e) {
            // PDF protegido o dañado: se ofrece abrirlo con otra app.
            fail("Este PDF no se puede mostrar aquí. Pulsa «Abrir con» para verlo en otra app.");
            return;
        }
        spinner.setVisibility(View.GONE);
        hscroll.post(() -> {
            baseWidth = hscroll.getWidth();
            adapter = new Adapter();
            list.setAdapter(adapter);
            applyZoom(1f);
        });
    }

    // ------------------------------------------------------------------ zoom

    private void setupGestures() {
        scaleDetector = new ScaleGestureDetector(this, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override
            public boolean onScaleBegin(ScaleGestureDetector d) {
                pinch = 1f;
                return true;
            }

            @Override
            public boolean onScale(ScaleGestureDetector d) {
                pinch *= d.getScaleFactor();
                float preview = Math.max(1f / zoom, Math.min(MAX_ZOOM / zoom, pinch));
                list.setPivotX(d.getFocusX() + hscroll.getScrollX());
                list.setPivotY(d.getFocusY());
                list.setScaleX(preview);
                list.setScaleY(preview);
                return true;
            }

            @Override
            public void onScaleEnd(ScaleGestureDetector d) {
                list.setScaleX(1f);
                list.setScaleY(1f);
                applyZoom(zoom * pinch);
            }
        });
        tapDetector = new GestureDetector(this, new GestureDetector.SimpleOnGestureListener() {
            @Override
            public boolean onDoubleTap(MotionEvent e) {
                applyZoom(zoom > 1.01f ? 1f : 2f);
                return true;
            }
        });
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent ev) {
        if (scaleDetector != null && adapter != null) {
            scaleDetector.onTouchEvent(ev);
            tapDetector.onTouchEvent(ev);
            if (scaleDetector.isInProgress() || ev.getPointerCount() > 1) return true;
        }
        return super.dispatchTouchEvent(ev);
    }

    private void applyZoom(float z) {
        if (adapter == null || baseWidth == 0) return;
        float newZoom = Math.max(1f, Math.min(MAX_ZOOM, z));
        int first = list.getFirstVisiblePosition();
        View firstView = list.getChildAt(0);
        float offset = firstView == null ? 0 : firstView.getTop() * (newZoom / zoom);
        float centerX = (hscroll.getScrollX() + baseWidth / 2f) / (baseWidth * zoom);
        zoom = newZoom;
        ViewGroup.LayoutParams lp = list.getLayoutParams();
        lp.width = (int) (baseWidth * zoom);
        list.setLayoutParams(lp);
        cache.evictAll();
        adapter.notifyDataSetChanged();
        list.setSelectionFromTop(first, (int) offset);
        hscroll.post(() -> hscroll.scrollTo((int) (centerX * baseWidth * zoom - baseWidth / 2f), 0));
    }

    // ------------------------------------------------------------------ páginas

    private int pageWidth() {
        return (int) (baseWidth * zoom) - dp(16);
    }

    private class Adapter extends BaseAdapter {
        @Override
        public int getCount() {
            return ratios == null ? 0 : ratios.length;
        }

        @Override
        public Object getItem(int i) {
            return i;
        }

        @Override
        public long getItemId(int i) {
            return i;
        }

        @Override
        public View getView(int i, View convert, ViewGroup parent) {
            ImageView iv = convert instanceof ImageView ? (ImageView) convert : new ImageView(PdfActivity.this);
            int w = pageWidth();
            int h = (int) (w * ratios[i]);
            iv.setLayoutParams(new AbsListView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, h + dp(8)));
            iv.setPadding(dp(8), dp(4), dp(8), dp(4));
            iv.setScaleType(ImageView.ScaleType.FIT_XY);
            iv.setTag(i);
            Bitmap b = cache.get(i);
            if (b != null) {
                iv.setImageBitmap(b);
            } else {
                iv.setImageDrawable(new android.graphics.drawable.ColorDrawable(Color.WHITE));
                render(i, iv, w);
            }
            return iv;
        }
    }

    private void render(int page, ImageView target, int width) {
        renderer.execute(() -> {
            if (pdf == null) return;
            int rw = Math.min(width, MAX_RENDER_WIDTH);
            int rh = Math.max(1, (int) (rw * ratios[page]));
            Bitmap b;
            try {
                b = Bitmap.createBitmap(rw, rh, Bitmap.Config.ARGB_8888);
            } catch (OutOfMemoryError e) {
                return;
            }
            b.eraseColor(Color.WHITE);
            synchronized (PdfActivity.this) {
                if (pdf == null) return;
                try (PdfRenderer.Page p = pdf.openPage(page)) {
                    p.render(b, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                } catch (IllegalStateException e) {
                    return;
                }
            }
            runOnUiThread(() -> {
                cache.put(page, b);
                if (Integer.valueOf(page).equals(target.getTag())) target.setImageBitmap(b);
            });
        });
    }

    @Override
    protected void onDestroy() {
        downloader.shutdownNow();
        renderer.shutdownNow();
        synchronized (this) {
            try {
                if (pdf != null) pdf.close();
                if (fd != null) fd.close();
            } catch (IOException ignored) {
                // nada que hacer al cerrar
            }
            pdf = null;
        }
        super.onDestroy();
    }
}
