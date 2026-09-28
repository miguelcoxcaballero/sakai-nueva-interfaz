package io.github.miguelcoxcaballero.aulasakai;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.webkit.CookieManager;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Descarga archivos del aula virtual con la sesión del WebView y los abre con otras apps. */
final class Downloads {
    private Downloads() {}

    static File dir(Context c) {
        File d = new File(c.getCacheDir(), "descargas");
        //noinspection ResultOfMethodCallIgnored
        d.mkdirs();
        return d;
    }

    /** Borra descargas de más de un día para no llenar la memoria. */
    static void cleanOld(Context c) {
        File[] files = dir(c).listFiles();
        if (files == null) return;
        long limit = System.currentTimeMillis() - 24L * 3600 * 1000;
        for (File f : files) if (f.lastModified() < limit) //noinspection ResultOfMethodCallIgnored
            f.delete();
    }

    static String safeName(String name) {
        String n = name == null ? "archivo" : name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        return n.isEmpty() ? "archivo" : n;
    }

    /** Descarga la URL siguiendo redirecciones y enviando las cookies de la sesión. */
    static File fetch(Context c, String url, String userAgent, String name) throws IOException {
        URL u = new URL(url);
        HttpURLConnection con;
        int redirects = 0;
        while (true) {
            con = (HttpURLConnection) u.openConnection();
            con.setInstanceFollowRedirects(false);
            con.setConnectTimeout(20000);
            con.setReadTimeout(60000);
            String cookie = CookieManager.getInstance().getCookie(u.toString());
            if (cookie != null) con.setRequestProperty("Cookie", cookie);
            if (userAgent != null) con.setRequestProperty("User-Agent", userAgent);
            int code = con.getResponseCode();
            if (code >= 300 && code < 400 && redirects++ < 10) {
                String loc = con.getHeaderField("Location");
                con.disconnect();
                if (loc == null) throw new IOException("Redirección sin destino");
                u = new URL(u, loc);
                continue;
            }
            if (code >= 400) {
                con.disconnect();
                throw new IOException("El servidor respondió " + code);
            }
            break;
        }
        File out = new File(dir(c), safeName(name));
        try (InputStream in = con.getInputStream(); OutputStream os = new FileOutputStream(out)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
        } finally {
            con.disconnect();
        }
        return out;
    }

    static Uri uriFor(Context c, File f) {
        return FileProvider.getUriForFile(c, c.getPackageName() + ".files", f);
    }

    /** Abre el archivo con la app que elija el usuario; si no hay ninguna, ofrece compartirlo. */
    static void open(Context c, File f, String mime) {
        Uri uri = uriFor(c, f);
        Intent view = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, mime == null || mime.isEmpty() ? "*/*" : mime)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            c.startActivity(Intent.createChooser(view, "Abrir con"));
        } catch (ActivityNotFoundException e) {
            share(c, f, mime);
        }
    }

    static void share(Context c, File f, String mime) {
        Intent send = new Intent(Intent.ACTION_SEND)
                .setType(mime == null || mime.isEmpty() ? "*/*" : mime)
                .putExtra(Intent.EXTRA_STREAM, uriFor(c, f))
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            c.startActivity(Intent.createChooser(send, "Compartir"));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(c, "No hay ninguna app para abrir este archivo", Toast.LENGTH_LONG).show();
        }
    }
}
