package com.siddarthkay.syncup

import android.content.Context
import android.content.SharedPreferences

// one SharedPreferences file shared between the service and the turbo module.
object SyncthingPrefs {
    private const val PREFS_NAME = "syncthing.prefs"
    private const val KEY_WIFI_ONLY_SYNC = "wifi_only_sync"
    private const val KEY_CHARGING_ONLY_SYNC = "charging_only_sync"
    private const val KEY_ALLOW_METERED_WIFI = "allow_metered_wifi"
    private const val KEY_ALLOW_MOBILE_DATA = "allow_mobile_data"

    private fun prefs(context: Context): SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun getWifiOnlySync(context: Context): Boolean =
        prefs(context).getBoolean(KEY_WIFI_ONLY_SYNC, false)

    fun setWifiOnlySync(context: Context, value: Boolean) {
        prefs(context).edit().putBoolean(KEY_WIFI_ONLY_SYNC, value).apply()
    }

    fun getChargingOnlySync(context: Context): Boolean =
        prefs(context).getBoolean(KEY_CHARGING_ONLY_SYNC, false)

    fun setChargingOnlySync(context: Context, value: Boolean) {
        prefs(context).edit().putBoolean(KEY_CHARGING_ONLY_SYNC, value).apply()
    }

    fun getAllowMeteredWifi(context: Context): Boolean =
        prefs(context).getBoolean(KEY_ALLOW_METERED_WIFI, false)

    fun setAllowMeteredWifi(context: Context, value: Boolean) {
        prefs(context).edit().putBoolean(KEY_ALLOW_METERED_WIFI, value).apply()
    }

    fun getAllowMobileData(context: Context): Boolean =
        prefs(context).getBoolean(KEY_ALLOW_MOBILE_DATA, false)

    fun setAllowMobileData(context: Context, value: Boolean) {
        prefs(context).edit().putBoolean(KEY_ALLOW_MOBILE_DATA, value).apply()
    }
}
