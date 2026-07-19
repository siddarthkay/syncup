package com.siddarthkay.syncup

import android.app.Application
import android.content.res.Configuration

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(GoServerBridgePackage())
          add(QRScannerPackage())
        }
    )
  }

  override fun onCreate() {
    super.onCreate()
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)

    // SyncthingService is intentionally NOT started here. On Android 12+,
    // startForegroundService throws ForegroundServiceStartNotAllowedException
    // when the process was woken by a background broadcast (e.g.
    // BOOT_COMPLETED) because the FGS exemption is granted to the
    // BroadcastReceiver, not to Application.onCreate. Each entry point that
    // needs the daemon starts it from a context that does have the exemption:
    //   MainActivity.onCreate         — user-launched (Activity)
    //   ShareReceiveActivity.onCreate — share intent (Activity)
    //   BootReceiver.onReceive        — BOOT_COMPLETED (exempt receiver)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
