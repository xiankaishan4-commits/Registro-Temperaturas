package com.shanfoodsgroup.temperaturas;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Calendar;
import java.util.HashSet;

/** Stores only reminder metadata; never exports records or photos to a server. */
public final class ReminderScheduler {
    private static final String PREFS = "local_reminders_v1";
    private static final String KEY = "snapshot";
    private ReminderScheduler() {}

    public static void saveSnapshot(Context context, String json) {
        try {
            if (json == null || json.length() > 750000) return;
            JSONObject source = new JSONObject(json);
            JSONArray devices = source.getJSONArray("devices");
            JSONArray entries = source.getJSONArray("entries");
            if (devices.length() > 1000 || entries.length() > 4000) return;
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json).apply();
            scheduleNext(context);
        } catch (Exception ignored) {}
    }

    public static int pendingCount(Context context, long currentTimeMillis) {
        SharedPreferences pref = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String json = pref.getString(KEY, null);
        if (json == null) return 0;
        try {
            JSONObject snapshot = new JSONObject(json);
            JSONArray devices = snapshot.getJSONArray("devices");
            JSONArray entries = snapshot.getJSONArray("entries");
            Calendar start = Calendar.getInstance();
            start.setTimeInMillis(currentTimeMillis);
            int hour = start.get(Calendar.HOUR_OF_DAY);
            boolean night = hour >= 21 || hour < 9;
            if (hour < 9) start.add(Calendar.DAY_OF_MONTH, -1);
            start.set(Calendar.HOUR_OF_DAY, night ? 21 : 9);
            start.set(Calendar.MINUTE, 0);
            start.set(Calendar.SECOND, 0);
            start.set(Calendar.MILLISECOND, 0);
            long lowerBound = start.getTimeInMillis();
            HashSet<String> checked = new HashSet<>();
            for (int i = 0; i < entries.length(); i++) {
                JSONObject entry = entries.optJSONObject(i);
                if (entry == null) continue;
                long when = entry.optLong("timestamp", -1);
                if (when >= lowerBound && when <= currentTimeMillis) {
                    checked.add(entry.optString("deviceId", ""));
                }
            }
            int pending = 0;
            for (int i = 0; i < devices.length(); i++) {
                JSONObject device = devices.optJSONObject(i);
                if (device != null && !checked.contains(device.optString("id", ""))) pending++;
            }
            return pending;
        } catch (Exception error) {
            return 0;
        }
    }

    /**
     * 30-minute wall clock schedule. Doze/battery optimizations can defer delivery;
     * no exact-alarm privileges are needed.
     */
    public static void scheduleNext(Context context) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) return;
        PendingIntent callback = PendingIntent.getBroadcast(context, 405,
            new Intent(context, ReminderReceiver.class),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Calendar at = Calendar.getInstance();
        at.set(Calendar.SECOND, 0);
        at.set(Calendar.MILLISECOND, 0);
        if (at.get(Calendar.MINUTE) < 30) at.set(Calendar.MINUTE, 30);
        else { at.set(Calendar.MINUTE, 0); at.add(Calendar.HOUR_OF_DAY, 1); }
        manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at.getTimeInMillis(), callback);
    }
}
