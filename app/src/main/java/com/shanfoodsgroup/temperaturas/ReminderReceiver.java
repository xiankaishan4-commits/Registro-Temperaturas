package com.shanfoodsgroup.temperaturas;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

public class ReminderReceiver extends BroadcastReceiver {
    private static final String CHANNEL = "temperature_checks_pending";
    @Override public void onReceive(Context context, Intent intent) {
        ReminderScheduler.scheduleNext(context);
        int pending = ReminderScheduler.pendingCount(context, System.currentTimeMillis());
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (pending == 0) { manager.cancel(405); return; }
        if (Build.VERSION.SDK_INT >= 33 &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        manager.createNotificationChannel(new NotificationChannel(
            CHANNEL, "Recordatorios de temperaturas", NotificationManager.IMPORTANCE_DEFAULT));
        PendingIntent open = PendingIntent.getActivity(context, 406,
            new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification note = new Notification.Builder(context, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle("Control de temperaturas pendiente")
            .setContentText(pending + " equipo(s) pendientes del turno actual.")
            .setContentIntent(open).setAutoCancel(true).build();
        manager.notify(405, note);
    }
}
