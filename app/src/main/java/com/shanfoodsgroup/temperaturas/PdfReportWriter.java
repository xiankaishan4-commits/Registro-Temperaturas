package com.shanfoodsgroup.temperaturas;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.pdf.PdfDocument;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/** Offline A4 inspection report: measurement date/time and photo, never the encoded JSON backup. */
final class PdfReportWriter {
    private static final int WIDTH = 595, HEIGHT = 842, MAX_ROWS = 180;
    private static final int NAVY = Color.rgb(24, 49, 70);
    private static final int BLUE = Color.rgb(13, 95, 164);
    private static final int SUBTLE = Color.rgb(97, 111, 124);
    private static final int EDGE = Color.rgb(220, 230, 236);
    private static final int CARD = Color.rgb(247, 250, 253);
    private static final int ALERT = Color.rgb(169, 57, 42);
    private static final int GREEN = Color.rgb(39, 114, 76);
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);

    static void write(File packageZip, File outputPdf) throws Exception {
        new PdfReportWriter().writeReport(packageZip, outputPdf);
    }

    private void writeReport(File packageZip, File outputPdf) throws Exception {
        if (!packageZip.isFile() || packageZip.length() > 115L * 1024 * 1024)
            throw new IllegalArgumentException("Informe excesivamente grande; reduzca las fechas");
        try (ZipFile zip = new ZipFile(packageZip)) {
            ZipEntry metadata = zip.getEntry("informe.json");
            if (metadata == null || metadata.getSize() > 512 * 1024 || metadata.getSize() < 0)
                throw new IllegalArgumentException("Faltan los datos del informe");
            byte[] raw = new byte[(int) metadata.getSize()];
            try (InputStream input = zip.getInputStream(metadata)) {
                int offset = 0;
                while (offset < raw.length) {
                    int count = input.read(raw, offset, raw.length - offset);
                    if (count < 0) throw new IllegalArgumentException("Datos incompletos");
                    offset += count;
                }
            }
            JSONObject payload = new JSONObject(new String(raw, java.nio.charset.StandardCharsets.UTF_8));
            if (!"SHANFOODSGROUP_PDF_REPORT_V1".equals(payload.optString("format")))
                throw new IllegalArgumentException("Formato de informe incorrecto");
            JSONArray rows = payload.getJSONArray("rows");
            if (rows.length() < 1 || rows.length() > MAX_ROWS)
                throw new IllegalArgumentException("Seleccione menos registros (máximo 180)");

            int photos = 0;
            for (int i = 0; i < rows.length(); i++) {
                String photoName = rows.getJSONObject(i).optString("fotoArchivo", "");
                if (!photoName.isEmpty()) {
                    if (!photoName.matches("fotos/[0-9]{5}\\.(jpg|png|webp)") || zip.getEntry(photoName) == null)
                        throw new IllegalArgumentException("Falta la fotografía del registro " + (i + 1));
                    photos++;
                }
            }
            PdfDocument pdf = new PdfDocument();
            try {
                final float cardHeight = 136f;
                final float top = 143f;
                int pageNumber = 0;
                for (int i = 0; i < rows.length();) {
                    PdfDocument.PageInfo pi = new PdfDocument.PageInfo.Builder(WIDTH, HEIGHT, ++pageNumber).create();
                    PdfDocument.Page page = pdf.startPage(pi);
                    Canvas canvas = page.getCanvas();
                    drawHeader(canvas, payload, rows.length(), photos, pageNumber);
                    float y = top;
                    while (i < rows.length() && y + cardHeight < 804) {
                        drawRecord(canvas, rows.getJSONObject(i), zip, y, i + 1);
                        y += cardHeight;
                        i++;
                    }
                    drawFooter(canvas, pageNumber);
                    pdf.finishPage(page);
                }
                try (FileOutputStream out = new FileOutputStream(outputPdf)) { pdf.writeTo(out); }
            } finally { pdf.close(); }
        }
    }

    private void drawHeader(Canvas c, JSONObject report, int count, int photos, int page) {
        paint.setColor(NAVY);
        c.drawRect(0, 0, WIDTH, 66, paint);
        text(c, "SHANFOODSGROUP S.L.", 32, 27, 12, Color.WHITE, true);
        text(c, "REGISTRO DE TEMPERATURAS", 32, 47, 16, Color.WHITE, true);
        String from = report.optString("desde", ""), to = report.optString("hasta", "");
        String dates = (from.isEmpty() && to.isEmpty()) ? "Todos los días" :
            ((from.isEmpty() ? "Inicio" : displayDate(from)) + "  -  " + (to.isEmpty() ? "Hoy" : displayDate(to)));
        text(c, "Periodo: " + dates, 32, 84, 10, NAVY, true);
        text(c, "Equipo: " + truncate(report.optString("equipoFiltro", "Todos los equipos"), 74), 32, 103, 10, SUBTLE, false);
        text(c, "Controles: " + count + "   |   Fotografías: " + photos, 32, 121, 9, SUBTLE, false);
        paint.setColor(EDGE);
        c.drawLine(32, 130, WIDTH - 32, 130, paint);
    }

    private void drawRecord(Canvas c, JSONObject r, ZipFile zip, float y, int number) throws Exception {
        paint.setColor(CARD);
        c.drawRoundRect(new RectF(32, y, WIDTH-32, y+127), 7, 7, paint);
        paint.setColor(EDGE);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(1);
        c.drawRoundRect(new RectF(32, y, WIDTH-32, y+127), 7, 7, paint);
        paint.setStyle(Paint.Style.FILL);

        float x = 43;
        text(c, String.format(Locale.ROOT, "CONTROL %03d", number), x, y+16, 8, BLUE, true);
        List<String> names = wrap(r.optString("equipo", "Equipo sin nombre"), 49, 2);
        float lineY = y + 33;
        for (String name : names) { text(c, name, x, lineY, 11, NAVY, true); lineY += 13; }
        float baseY = y + 62;
        text(c, "Fecha:  " + displayDate(r.optString("fecha", "")), x, baseY, 10, NAVY, false);
        String time = r.optString("hora", "");
        text(c, "Hora:  " + (time.isEmpty() ? "Sin medición" : time), x+179, baseY, 10, NAVY, false);
        String temperature = r.optString("temperatura", "");
        text(c, "Temp.:  " + (temperature.isEmpty() ? "--" : temperature + " °C"), x, baseY+19, 11,
             temperature.isEmpty() ? ALERT : GREEN, true);
        text(c, "Responsable: " + truncate(r.optString("responsable", ""), 31), x, baseY+36, 9, SUBTLE, false);
        List<String> notes = wrap("Obs.: " + r.optString("observaciones", ""), 69, 1);
        text(c, notes.get(0), x, baseY+51, 8, SUBTLE, false);

        float px=428, py=y+14, pw=122, ph=98;
        paint.setColor(Color.WHITE);
        c.drawRect(px, py, px+pw, py+ph, paint);
        String name = r.optString("fotoArchivo", "");
        if (name.isEmpty()) {
            text(c, "Sin fotografía", px+20, py+50, 9, SUBTLE, false);
            return;
        }
        Bitmap bitmap = null;
        try {
            ZipEntry photo = zip.getEntry(name);
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inJustDecodeBounds = true;
            try (InputStream in=zip.getInputStream(photo)) { BitmapFactory.decodeStream(in, null, opts); }
            int maxSize = Math.max(opts.outWidth, opts.outHeight);
            if (maxSize <= 0) throw new IllegalArgumentException("Fotografía ilegible");
            opts.inJustDecodeBounds = false;
            opts.inSampleSize = 1;
            while (maxSize / opts.inSampleSize > 720) opts.inSampleSize *= 2;
            try (InputStream in=zip.getInputStream(photo)) { bitmap = BitmapFactory.decodeStream(in, null, opts); }
            if (bitmap == null) throw new IllegalArgumentException("Fotografía ilegible");
            float ratio = Math.min(pw / bitmap.getWidth(), ph / bitmap.getHeight());
            float w = bitmap.getWidth() * ratio, h = bitmap.getHeight() * ratio;
            c.drawBitmap(bitmap, null, new RectF(px+(pw-w)/2f,py+(ph-h)/2f,px+(pw+w)/2f,py+(ph+h)/2f),paint);
        } catch (RuntimeException ex) {
            text(c, "Imagen ilegible", px+19, py+50, 9, ALERT, false);
        } finally { if (bitmap != null) bitmap.recycle(); }
    }

    private void drawFooter(Canvas c, int pageNumber) {
        paint.setColor(EDGE);
        c.drawLine(32, 809, WIDTH-32, 809, paint);
        text(c, "Registro offline de equipos frigoríficos", 32, 825, 8, SUBTLE, false);
        text(c, "Página " + pageNumber, WIDTH - 78, 825, 8, SUBTLE, false);
    }

    private void text(Canvas c, String value, float x, float y, float size, int color, boolean bold) {
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(color);
        paint.setTextSize(size);
        paint.setTypeface(bold ? android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.BOLD)
                                   : android.graphics.Typeface.create("sans-serif", android.graphics.Typeface.NORMAL));
        c.drawText(value == null ? "" : value, x, y, paint);
    }
    private static String displayDate(String iso) {
        if (iso != null && iso.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}"))
            return iso.substring(8,10) + "/" + iso.substring(5,7) + "/" + iso.substring(0,4);
        return iso == null || iso.isEmpty() ? "--" : iso;
    }
    private static String truncate(String s, int count) {
        if (s == null || s.isEmpty()) return "--";
        return s.length() <= count ? s : s.substring(0, count-1) + "…";
    }
    private static List<String> wrap(String s, int max, int lines) {
        List<String> out = new ArrayList<>();
        String remain = s == null ? "" : s.trim();
        while (!remain.isEmpty() && out.size() < lines) {
            if (remain.length() <= max) { out.add(remain); remain=""; break; }
            int breakPos=remain.lastIndexOf(' ',max);
            if (breakPos < max/2) breakPos=max;
            out.add(remain.substring(0,breakPos).trim());
            remain=remain.substring(breakPos).trim();
        }
        if (out.isEmpty()) out.add("--");
        if (!remain.isEmpty()) {
            int last=out.size()-1;
            out.set(last,truncate(out.get(last) + " " + remain, max));
        }
        return out;
    }
}
