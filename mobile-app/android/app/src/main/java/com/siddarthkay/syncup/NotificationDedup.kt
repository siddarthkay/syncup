package com.siddarthkay.syncup

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

object NotificationDedup {

    private const val TAG = "NotificationDedup"
    private const val PREFS_FILE = "syncthing-notification-dedup"
    private const val EVENTS_CHANNEL_ID = "syncthing-events"

    // pure so it's unit-testable without Context / SharedPreferences.
    sealed class Decision {
        object Skip : Decision()
        object Reset : Decision()
        data class Notify(val count: Int) : Decision()
    }

    fun decide(lastCount: Int, currentCount: Int): Decision {
        // healthy now: clear so the next failure notifies fresh.
        if (currentCount <= 0) {
            return if (lastCount != 0) Decision.Reset else Decision.Skip
        }
        if (currentCount <= lastCount) return Decision.Skip
        return Decision.Notify(currentCount)
    }

    @Synchronized
    fun maybeNotifyFolderErrors(
        context: Context,
        folderId: String,
        count: Int,
        label: String,
        sample: String,
    ): Boolean {
        if (folderId.isEmpty()) return false
        val prefs = context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
        val last = prefs.getInt(folderId, 0)

        return when (val decision = decide(last, count)) {
            is Decision.Skip -> false
            is Decision.Reset -> {
                prefs.edit().remove(folderId).apply()
                false
            }
            is Decision.Notify -> {
                prefs.edit().putInt(folderId, decision.count).apply()
                postNotification(
                    context,
                    label.ifEmpty { folderId },
                    decision.count,
                    sample,
                )
                true
            }
        }
    }

    private fun postNotification(
        context: Context,
        label: String,
        count: Int,
        sample: String,
    ) {
        ensureEventsChannel(context)

        val title = "Sync errors in \"$label\""
        val body = when {
            count == 1 && sample.isNotEmpty() -> sample
            count == 1 -> "1 file failed to sync."
            sample.isNotEmpty() -> "$count files failed to sync. $sample"
            else -> "$count files failed to sync."
        }

        val launchIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pending = PendingIntent.getActivity(
            context,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, EVENTS_CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setSmallIcon(android.R.drawable.stat_notify_sync_noanim)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()

        try {
            // unique id so repeats stack instead of collapsing.
            val id = (System.currentTimeMillis() % Int.MAX_VALUE).toInt()
            NotificationManagerCompat.from(context).notify(id, notification)
        } catch (e: SecurityException) {
            Log.w(TAG, "notify denied (POST_NOTIFICATIONS)", e)
        } catch (e: Exception) {
            Log.e(TAG, "notify failed", e)
        }
    }

    private fun ensureEventsChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        if (nm.getNotificationChannel(EVENTS_CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            EVENTS_CHANNEL_ID,
            "Sync events",
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = "Folder errors and other notable sync events"
        }
        nm.createNotificationChannel(channel)
    }
}
