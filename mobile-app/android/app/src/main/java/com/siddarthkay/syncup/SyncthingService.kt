package com.siddarthkay.syncup

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import gobridge.MobileAPI

// foreground service keeps the daemon alive when the Activity is gone.
class SyncthingService : Service() {

    companion object {
        private const val TAG = "SyncthingService"
        private const val CHANNEL_ID = "syncthing"
        private const val NOTIFICATION_ID = 1337

        private const val ACTION_EVALUATE_CONDITIONS =
            "com.siddarthkay.syncup.EVALUATE_CONDITIONS"

        fun start(context: Context) {
            val intent = Intent(context, SyncthingService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, SyncthingService::class.java))
        }

        // re-check conditions now instead of waiting for the next network tick.
        fun requestConditionEvaluation(context: Context) {
            val intent = Intent(context, SyncthingService::class.java)
            intent.action = ACTION_EVALUATE_CONDITIONS
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
    }

    private val mobileAPI = MobileAPI()
    private var multicastLock: WifiManager.MulticastLock? = null
    private var connectivityManager: ConnectivityManager? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var powerReceiver: BroadcastReceiver? = null
    @Volatile private var started = false
    @Volatile private var lastSuspended: Boolean? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "onCreate")
        createNotificationChannel()
        promoteToForeground()
        acquireMulticastLock()
        startDaemon()
        registerNetworkCallback()
        registerPowerReceiver()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.i(TAG, "onStartCommand flags=$flags startId=$startId action=${intent?.action}")
        if (intent?.action == ACTION_EVALUATE_CONDITIONS) {
            evaluateConditions()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        Log.i(TAG, "onDestroy")
        unregisterPowerReceiver()
        unregisterNetworkCallback()
        releaseMulticastLock()
        stopDaemon()
        super.onDestroy()
    }

    private fun startDaemon() {
        if (started) return
        try {
            val dataDir = Paths.syncthingDir(applicationContext)
            val foldersRoot = Paths.foldersRoot(applicationContext)

            // Wire SAF bridge so SAF-backed folders can open through ContentResolver.
            mobileAPI.setSAFBridge(SAFProvider(applicationContext))

            // must land before startServer so Load's migration step sees it.
            val stashOk = mobileAPI.setFoldersRoot(foldersRoot)
            Log.i(TAG, "pre-start setFoldersRoot=$foldersRoot ok=$stashOk")

            val port = mobileAPI.startServer(dataDir)
            Log.i(TAG, "syncthing started on port=$port dataDir=$dataDir")
            started = true
            evaluateConditions()
        } catch (e: Exception) {
            Log.e(TAG, "startDaemon failed", e)
        }
    }

    // Run on a background thread: syncthing's supervisor drain can take several
    // seconds, and this is called from onDestroy (main thread). Blocking the
    // main thread past ~5s triggers an ANR and kills the process.
    private fun stopDaemon() {
        if (!started) return
        started = false
        lastSuspended = null
        Thread {
            try {
                mobileAPI.stopServer()
                Log.i(TAG, "syncthing stopped")
            } catch (e: Exception) {
                Log.e(TAG, "stopDaemon failed", e)
            }
        }.start()
    }

    private fun acquireMulticastLock() {
        try {
            // local discovery (udp 21027) needs this or the OS filters broadcast.
            val wifi = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            val lock = wifi.createMulticastLock("syncthing-discovery")
            lock.setReferenceCounted(false)
            lock.acquire()
            multicastLock = lock
            Log.i(TAG, "multicast lock acquired")
        } catch (e: Exception) {
            Log.w(TAG, "multicast lock failed", e)
        }
    }

    private fun releaseMulticastLock() {
        try {
            multicastLock?.takeIf { it.isHeld }?.release()
        } catch (e: Exception) {
            Log.w(TAG, "releaseMulticastLock failed", e)
        } finally {
            multicastLock = null
        }
    }

    private fun registerNetworkCallback() {
        try {
            val cm = applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            connectivityManager = cm
            val cb = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) = evaluateConditions()
                override fun onLost(network: Network) = evaluateConditions()
                override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) =
                    evaluateConditions()
            }
            networkCallback = cb
            val request = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()
            cm.registerNetworkCallback(request, cb)
            Log.i(TAG, "network callback registered")
        } catch (e: Exception) {
            Log.w(TAG, "registerNetworkCallback failed", e)
        }
    }

    private fun unregisterNetworkCallback() {
        val cm = connectivityManager ?: return
        val cb = networkCallback ?: return
        try {
            cm.unregisterNetworkCallback(cb)
        } catch (e: Exception) {
            Log.w(TAG, "unregisterNetworkCallback failed", e)
        } finally {
            connectivityManager = null
            networkCallback = null
        }
    }

    // only crosses the JNI boundary when the desired state actually changes.
    private fun evaluateConditions() {
        if (!started) return
        val wifiOnly = SyncthingPrefs.getWifiOnlySync(applicationContext)
        val chargingOnly = SyncthingPrefs.getChargingOnlySync(applicationContext)
        val allowMetered = SyncthingPrefs.getAllowMeteredWifi(applicationContext)
        val allowMobile = SyncthingPrefs.getAllowMobileData(applicationContext)
        val networkState = getNetworkState()
        val onPower = isCharging()

        val networkBad = when {
            !wifiOnly -> false
            networkState == NetworkState.UNMETERED_WIFI -> false
            networkState == NetworkState.METERED_WIFI -> !allowMetered
            networkState == NetworkState.MOBILE -> !allowMobile
            networkState == NetworkState.ETHERNET -> false
            else -> true
        }
        val powerBad = chargingOnly && !onPower
        val desiredSuspended = networkBad || powerBad
        if (desiredSuspended == lastSuspended) return
        Log.i(
            TAG,
            "evaluateConditions wifiOnly=$wifiOnly chargingOnly=$chargingOnly allowMetered=$allowMetered allowMobile=$allowMobile network=$networkState onPower=$onPower -> suspended=$desiredSuspended",
        )
        try {
            mobileAPI.setSuspended(desiredSuspended)
            lastSuspended = desiredSuspended
        } catch (e: Exception) {
            Log.e(TAG, "setSuspended failed", e)
        }
    }

    private enum class NetworkState {
        UNMETERED_WIFI, METERED_WIFI, MOBILE, ETHERNET, NONE
    }

    private fun getNetworkState(): NetworkState {
        val cm = connectivityManager ?: return NetworkState.NONE
        val active = cm.activeNetwork ?: return NetworkState.NONE
        val caps = cm.getNetworkCapabilities(active) ?: return NetworkState.NONE
        if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) return NetworkState.NONE
        if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) return NetworkState.NONE
        return when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> NetworkState.ETHERNET
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> {
                if (caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)) {
                    NetworkState.UNMETERED_WIFI
                } else {
                    NetworkState.METERED_WIFI
                }
            }
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> NetworkState.MOBILE
            else -> NetworkState.NONE
        }
    }

    private fun isCharging(): Boolean {
        // sticky broadcast; null receiver just reads the last value.
        val intent = applicationContext.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            ?: return false
        val plugged = intent.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1)
        return plugged > 0
    }

    private fun registerPowerReceiver() {
        try {
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context?, intent: Intent?) {
                    Log.i(TAG, "power broadcast: ${intent?.action}")
                    evaluateConditions()
                }
            }
            val filter = IntentFilter().apply {
                addAction(Intent.ACTION_POWER_CONNECTED)
                addAction(Intent.ACTION_POWER_DISCONNECTED)
            }
            applicationContext.registerReceiver(receiver, filter)
            powerReceiver = receiver
            Log.i(TAG, "power receiver registered")
        } catch (e: Exception) {
            Log.w(TAG, "registerPowerReceiver failed", e)
        }
    }

    private fun unregisterPowerReceiver() {
        val receiver = powerReceiver ?: return
        try {
            applicationContext.unregisterReceiver(receiver)
        } catch (e: Exception) {
            Log.w(TAG, "unregisterPowerReceiver failed", e)
        } finally {
            powerReceiver = null
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Syncthing",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Persistent notification while syncthing is running"
            setShowBadge(false)
            setSound(null, null)
            enableLights(false)
            enableVibration(false)
        }
        nm.createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pending = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Syncthing")
            .setContentText("Syncing in background")
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setShowWhen(false)
            .setContentIntent(pending)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    private fun promoteToForeground() {
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }
}
