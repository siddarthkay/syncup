package com.siddarthkay.syncup

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper
import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicReference

class MainActivity : ReactActivity() {
  companion object {
    private const val REQUEST_NOTIFICATION_PERMISSION = 4242
  }

  // Blocking SAF picker: the launcher lives on the main thread and delivers
  // results via a CountDownLatch so the JS-synchronous bridge method can wait.
  private var safPickerResult = AtomicReference<Uri?>(null)
  private var safPickerLatch = CountDownLatch(1)

  private lateinit var safPickerLauncher: ActivityResultLauncher<Uri?>

  /**
   * Called from GoServerBridgeModule.pickSafFolder() on the JS thread.
   * Blocks until the user picks a folder or cancels, then returns the URI.
   */
  fun pickSafFolderBlocking(): Uri? {
    safPickerResult.set(null)
    safPickerLatch = CountDownLatch(1)
    runOnUiThread { safPickerLauncher.launch(null) }
    safPickerLatch.await()
    return safPickerResult.get()
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    setTheme(R.style.AppTheme);

    // Must register before super.onCreate (before STARTED state).
    safPickerLauncher = registerForActivityResult(
      ActivityResultContracts.OpenDocumentTree()
    ) { uri: Uri? ->
      safPickerResult.set(uri)
      safPickerLatch.countDown()
    }

    super.onCreate(null)
    requestNotificationPermissionIfNeeded()
  }

  private fun requestNotificationPermissionIfNeeded() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
    val granted = ContextCompat.checkSelfPermission(
      this,
      Manifest.permission.POST_NOTIFICATIONS,
    ) == PackageManager.PERMISSION_GRANTED
    if (granted) return
    ActivityCompat.requestPermissions(
      this,
      arrayOf(Manifest.permission.POST_NOTIFICATIONS),
      REQUEST_NOTIFICATION_PERMISSION,
    )
  }

  override fun getMainComponentName(): String = "main"

  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      super.invokeDefaultOnBackPressed()
  }
}
